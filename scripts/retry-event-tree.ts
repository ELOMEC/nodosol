/**
 * Retry Merkle tree initialization for an event where `initializeEventTree`
 * failed during the original seed (usually a devnet rate-limit).
 *
 * Usage:
 *   npm run retry-tree -- --event-id 3003
 *   # or with explicit creator:
 *   npm run retry-tree -- --event-id 3003 --creator 3E8ZZJBkz82RmLSSmMZJBGuwrtkJDoCsX5UZVj26rqBr
 *
 * Skips if the event already has `tree_initialised = true`.
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, BN, Program, Wallet } = pkg;
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import eventTicketsIdl from "../web/idl/event_tickets.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;

const EVENT_SEED = Buffer.from("event");
const BUBBLEGUM_PROGRAM_ID = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
const ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
const NOOP_PROGRAM_ID = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
const MERKLE_TREE_ACCOUNT_SIZE = 31_800;

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function parseArgs(argv: string[]): { eventId: bigint; creator?: PublicKey } {
  let eventId: bigint | null = null;
  let creator: PublicKey | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--event-id") {
      eventId = BigInt(argv[++i]);
    } else if (a === "--creator") {
      creator = new PublicKey(argv[++i]);
    }
  }
  if (eventId === null) {
    throw new Error("--event-id <u64> is required");
  }
  return { eventId, creator };
}

async function sendIxs(
  connection: Connection,
  payer: Keypair,
  ixs: Parameters<Transaction["add"]>[0][],
  signers: Keypair[] = []
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash });
  for (const ix of ixs) tx.add(ix);
  tx.sign(payer, ...signers);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

async function main() {
  const { eventId, creator } = parseArgs(process.argv.slice(2));
  const dev = loadKeypair(WALLET_PATH);
  const creatorPk = creator ?? dev.publicKey;

  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(dev), { commitment: "confirmed" });
  const program = new Program(eventTicketsIdl as pkg.Idl, provider);

  const [eventPda] = PublicKey.findProgramAddressSync(
    [EVENT_SEED, creatorPk.toBuffer(), Buffer.from(new BigUint64Array([eventId]).buffer)],
    program.programId
  );

  const info = await connection.getAccountInfo(eventPda);
  if (!info) {
    console.error(`Event ${eventId} (${eventPda.toBase58()}) not found on-chain.`);
    process.exit(1);
  }

  const eventAccount = (program.account as Record<string, {
    fetch: (addr: PublicKey) => Promise<{
      treeInitialised: boolean;
      merkleTree: PublicKey;
      creator: PublicKey;
    }>;
  }>).event;
  const state = await eventAccount.fetch(eventPda);

  if (!state.creator.equals(creatorPk)) {
    console.error(
      `Event ${eventId} creator mismatch: on-chain ${state.creator.toBase58()}, expected ${creatorPk.toBase58()}.`
    );
    process.exit(1);
  }

  if (state.treeInitialised) {
    console.log(`Event ${eventId} tree already initialised — merkleTree=${state.merkleTree.toBase58()}. Nothing to do.`);
    return;
  }

  console.log(`Event ${eventId} (${eventPda.toBase58()}) — tree NOT initialised. Retrying.`);

  const merkleTreeKp = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(MERKLE_TREE_ACCOUNT_SIZE);
  const [treeConfig] = PublicKey.findProgramAddressSync(
    [merkleTreeKp.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  const initTreeIx = await program.methods
    .initializeEventTree()
    .accounts({
      creator: dev.publicKey,
      event: eventPda,
      treeConfig,
      merkleTree: merkleTreeKp.publicKey,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
      logWrapper: NOOP_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const sig = await sendIxs(
    connection,
    dev,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
      SystemProgram.createAccount({
        fromPubkey: dev.publicKey,
        newAccountPubkey: merkleTreeKp.publicKey,
        space: MERKLE_TREE_ACCOUNT_SIZE,
        lamports: rent,
        programId: ACCOUNT_COMPRESSION_PROGRAM_ID,
      }),
      initTreeIx,
    ],
    [merkleTreeKp]
  );

  console.log(`✅ tree initialised — merkleTree=${merkleTreeKp.publicKey.toBase58()} sig=${sig}`);

  // Silence BN unused-import warning from tsc.
  void BN;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
