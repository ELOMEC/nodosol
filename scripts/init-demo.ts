/**
 * One-shot devnet initializer.
 *
 * Creates a mock Token-2022 USDC mint, funds the dev wallet with 1000
 * USDC, then seeds one CreatorProfile, one SubscriptionPlan (id=1),
 * and one Event (id=1) on the devnet-deployed programs so Blink
 * endpoints have real data to resolve.
 *
 * Run:  npm run init-demo
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, BN, Program, Wallet, web3 } = pkg;
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

import tipJarIdl from "../web/idl/tip_jar.json" with { type: "json" };
import subscriptionIdl from "../web/idl/subscription.json" with { type: "json" };
import eventsIdl from "../web/idl/events.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ??
  `${homedir()}/.config/solana/id.json`;

const USDC_UNIT = 1_000_000n;
const INITIAL_USDC = 1_000n * USDC_UNIT;
const PLAN_ID = 1n;
const EVENT_ID = 1n;
const PLAN_PRICE = 5n * USDC_UNIT;
const PLAN_PERIOD_SECONDS = 86_400n * 30n;
const EVENT_PRICE = 10n * USDC_UNIT;
const EVENT_CAPACITY = 100n;

async function main() {
  const walletKeypair = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  console.log("Using wallet:", walletKeypair.publicKey.toBase58());
  const balanceLamports = await connection.getBalance(walletKeypair.publicKey);
  console.log("Balance:", balanceLamports / web3.LAMPORTS_PER_SOL, "SOL");
  if (balanceLamports < 1.5 * web3.LAMPORTS_PER_SOL) {
    throw new Error(
      "Wallet needs ~1.5 SOL on devnet to fund mint + account rent"
    );
  }

  const tipJar = new Program(tipJarIdl as never, provider);
  const subscription = new Program(subscriptionIdl as never, provider);
  const events = new Program(eventsIdl as never, provider);

  const mint = await createMockUsdcMint(connection, walletKeypair);
  console.log("Mock USDC mint:", mint.toBase58());

  const walletUsdcAta = getAssociatedTokenAddressSync(
    mint,
    walletKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  await sendSimple(connection, walletKeypair, [
    createAssociatedTokenAccountIdempotentInstruction(
      walletKeypair.publicKey,
      walletUsdcAta,
      walletKeypair.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID
    ),
    createMintToInstruction(
      mint,
      walletUsdcAta,
      walletKeypair.publicKey,
      INITIAL_USDC,
      [],
      TOKEN_2022_PROGRAM_ID
    ),
  ]);
  console.log(
    `Minted ${INITIAL_USDC / USDC_UNIT} USDC to ${walletUsdcAta.toBase58()}`
  );

  // 1. tip_jar — initialize_creator
  const [creatorProfile] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator"), walletKeypair.publicKey.toBuffer()],
    new PublicKey(tipJarIdl.address)
  );
  const [creatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), creatorProfile.toBuffer()],
    new PublicKey(tipJarIdl.address)
  );
  const existingProfile = await connection.getAccountInfo(creatorProfile);
  if (existingProfile) {
    console.log("CreatorProfile already exists:", creatorProfile.toBase58());
  } else {
    const sig = await tipJar.methods
      .initializeCreator()
      .accounts({
        owner: walletKeypair.publicKey,
        mint,
        creatorProfile,
        vault: creatorVault,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("initialize_creator:", sig);
  }

  // 2. subscription — create_plan
  const planIdBytes = Buffer.alloc(8);
  planIdBytes.writeBigUInt64LE(PLAN_ID);
  const [planPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("plan"), walletKeypair.publicKey.toBuffer(), planIdBytes],
    new PublicKey(subscriptionIdl.address)
  );
  const [planVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), planPda.toBuffer()],
    new PublicKey(subscriptionIdl.address)
  );
  const existingPlan = await connection.getAccountInfo(planPda);
  if (existingPlan) {
    console.log("Plan already exists:", planPda.toBase58());
  } else {
    const sig = await subscription.methods
      .createPlan(
        new BN(PLAN_ID.toString()),
        new BN(PLAN_PRICE.toString()),
        new BN(PLAN_PERIOD_SECONDS.toString())
      )
      .accounts({
        creator: walletKeypair.publicKey,
        mint,
        plan: planPda,
        vault: planVault,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("create_plan:", sig);
  }

  // 3. events — create_event
  const eventIdBytes = Buffer.alloc(8);
  eventIdBytes.writeBigUInt64LE(EVENT_ID);
  const [eventPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), walletKeypair.publicKey.toBuffer(), eventIdBytes],
    new PublicKey(eventsIdl.address)
  );
  const [eventVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), eventPda.toBuffer()],
    new PublicKey(eventsIdl.address)
  );
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const startsAt = nowSec; // immediate
  const endsAt = nowSec + BigInt(86_400 * 30); // 30 days
  const existingEvent = await connection.getAccountInfo(eventPda);
  if (existingEvent) {
    console.log("Event already exists:", eventPda.toBase58());
  } else {
    const sig = await events.methods
      .createEvent(
        new BN(EVENT_ID.toString()),
        new BN(EVENT_PRICE.toString()),
        new BN(EVENT_CAPACITY.toString()),
        new BN(startsAt.toString()),
        new BN(endsAt.toString()),
        "ipfs://nodosol-demo-event"
      )
      .accounts({
        creator: walletKeypair.publicKey,
        mint,
        event: eventPda,
        vault: eventVault,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("create_event:", sig);
  }

  const summary = {
    rpc: RPC_URL,
    creator: walletKeypair.publicKey.toBase58(),
    mint: mint.toBase58(),
    walletUsdcAta: walletUsdcAta.toBase58(),
    creatorProfile: creatorProfile.toBase58(),
    creatorVault: creatorVault.toBase58(),
    plan: planPda.toBase58(),
    planId: PLAN_ID.toString(),
    planVault: planVault.toBase58(),
    event: eventPda.toBase58(),
    eventId: EVENT_ID.toString(),
    eventVault: eventVault.toBase58(),
    blinks: {
      tip: `/api/actions/tip/${walletKeypair.publicKey.toBase58()}`,
      subscribe: `/api/actions/subscribe/${walletKeypair.publicKey.toBase58()}/${PLAN_ID}`,
      ticket: `/api/actions/ticket/${walletKeypair.publicKey.toBase58()}/${EVENT_ID}`,
    },
  };

  const outPath = pathResolve(import.meta.dirname, "devnet-state.json");
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log("\nState written to", outPath);
  console.log("\nSummary:\n", JSON.stringify(summary, null, 2));
}

async function createMockUsdcMint(
  connection: Connection,
  payer: Keypair
): Promise<PublicKey> {
  const mintKp = Keypair.generate();
  const mintLen = getMintLen([]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKp.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKp.publicKey,
      6,
      payer.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );
  await web3.sendAndConfirmTransaction(connection, tx, [payer, mintKp]);
  return mintKp.publicKey;
}

async function sendSimple(
  connection: Connection,
  payer: Keypair,
  ixs: web3.TransactionInstruction[]
) {
  const tx = new Transaction().add(...ixs);
  return web3.sendAndConfirmTransaction(connection, tx, [payer]);
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
