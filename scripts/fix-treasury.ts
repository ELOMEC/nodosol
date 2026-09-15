/**
 * Repair: make the fee treasury a separate account from any seller/creator
 * wallet. Until now, all 7 configs pointed at the dev wallet's USDC ATA,
 * which is the same account a dev-wallet seller would receive payment
 * into — triggering Anchor's "duplicate mutable account" constraint on
 * every buy from the dev wallet.
 *
 * This script:
 *   1. Generates (or reuses) scripts/treasury-keypair.json
 *   2. Creates an idempotent Token-2022 ATA for the mock USDC mint owned
 *      by that new wallet
 *   3. Calls update_treasury on every program that exposes it:
 *      tip_jar, subscription, events, marketplace, otc_deals, event_tickets
 *      (auctions has no update_treasury — it keeps the old treasury until
 *      next program upgrade)
 *   4. Patches scripts/devnet-state.json with the new treasury
 *
 * Run:
 *   cd scripts && npx tsx fix-treasury.ts
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet } = pkg;
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

import tipJarIdl from "../web/idl/tip_jar.json" with { type: "json" };
import subscriptionIdl from "../web/idl/subscription.json" with { type: "json" };
import eventsIdl from "../web/idl/events.json" with { type: "json" };
import marketplaceIdl from "../web/idl/marketplace.json" with { type: "json" };
import otcDealsIdl from "../web/idl/otc_deals.json" with { type: "json" };
import eventTicketsIdl from "../web/idl/event_tickets.json" with { type: "json" };
import auctionsIdl from "../web/idl/auctions.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;
const CONFIG_SEED = Buffer.from("config");

async function main() {
  const authority = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(authority), {
    commitment: "confirmed",
  });

  console.log("Authority:", authority.publicKey.toBase58());

  const statePath = pathResolve(import.meta.dirname, "devnet-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const mint = new PublicKey(state.mint);
  console.log("Payment mint:", mint.toBase58());

  // 1. Load-or-generate treasury keypair.
  const treasuryKeypairPath = pathResolve(import.meta.dirname, "treasury-keypair.json");
  let treasuryWallet: Keypair;
  if (existsSync(treasuryKeypairPath)) {
    treasuryWallet = loadKeypair(treasuryKeypairPath);
    console.log("Reusing treasury wallet:", treasuryWallet.publicKey.toBase58());
  } else {
    treasuryWallet = Keypair.generate();
    writeFileSync(
      treasuryKeypairPath,
      JSON.stringify(Array.from(treasuryWallet.secretKey))
    );
    console.log("Generated treasury wallet:", treasuryWallet.publicKey.toBase58());
    console.log("  secret saved to:", treasuryKeypairPath);
  }

  // 2. Idempotent ATA for (mint, treasury_wallet, TOKEN_2022).
  const treasuryAta = getAssociatedTokenAddressSync(
    mint,
    treasuryWallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("Treasury ATA:", treasuryAta.toBase58());

  const ataInfo = await connection.getAccountInfo(treasuryAta);
  if (!ataInfo) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        treasuryAta,
        treasuryWallet.publicKey,
        mint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    console.log("Treasury ATA created:", sig);
  } else {
    console.log("Treasury ATA already exists");
  }

  // 3. update_treasury on every program that exposes it.
  const programs = [
    { name: "tip_jar", idl: tipJarIdl },
    { name: "subscription", idl: subscriptionIdl },
    { name: "events", idl: eventsIdl },
    { name: "marketplace", idl: marketplaceIdl },
    { name: "otc_deals", idl: otcDealsIdl },
    { name: "event_tickets", idl: eventTicketsIdl },
    { name: "auctions", idl: auctionsIdl },
  ];

  for (const { name, idl } of programs) {
    const programId = new PublicKey((idl as { address: string }).address);
    const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
    const cfgInfo = await connection.getAccountInfo(configPda);
    if (!cfgInfo) {
      console.log(`[${name}] Config not initialized — skipping`);
      continue;
    }
    const program = new Program(idl as never, provider);
    try {
      const sig = await program.methods
        .updateTreasury()
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          newTreasury: treasuryAta,
        })
        .rpc();
      console.log(`[${name}] update_treasury sig: ${sig}`);
    } catch (err) {
      console.error(`[${name}] update_treasury failed:`, err);
    }
  }

  // 4. Patch devnet-state.json so web/scripts pick up the new treasury.
  state.treasury = treasuryAta.toBase58();
  state.treasuryWallet = treasuryWallet.publicKey.toBase58();
  for (const section of ["marketplace", "otc", "event_tickets", "auctions"]) {
    if (state[section]) state[section].treasury = treasuryAta.toBase58();
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log("\nState updated:", statePath);
  console.log("New treasury ATA:", treasuryAta.toBase58());
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

void main();
