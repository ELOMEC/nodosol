/**
 * Devnet init for event_tickets program.
 *
 * Sets Config with fee_bps = 250 (2.5%), treasury = dev wallet's mock-USDC ATA.
 * Idempotent.
 *
 * Run AFTER `anchor deploy --program-name event_tickets`:
 *   npm run init-event-tickets
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, web3 } = pkg;
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

import eventTicketsIdl from "../web/idl/event_tickets.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;
const CONFIG_SEED = Buffer.from("config");
const FEE_BPS = 250;

async function main() {
  const walletKeypair = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  console.log("Authority:", walletKeypair.publicKey.toBase58());
  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log("Balance:", balance / web3.LAMPORTS_PER_SOL, "SOL");

  const program = new Program(eventTicketsIdl as never, provider);
  const programId = new PublicKey((eventTicketsIdl as { address: string }).address);
  console.log("event_tickets program:", programId.toBase58());

  const statePath = pathResolve(import.meta.dirname, "devnet-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const treasury = new PublicKey(state.walletUsdcAta);
  console.log("Treasury ATA:", treasury.toBase58());

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  console.log("event_tickets Config PDA:", configPda.toBase58());

  const existing = await connection.getAccountInfo(configPda);
  if (existing) {
    console.log("Config already initialised — skipping");
  } else {
    const sig = await program.methods
      .initializeConfig(FEE_BPS)
      .accounts({
        authority: walletKeypair.publicKey,
        config: configPda,
        treasury,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("initialize_config sig:", sig);
  }

  const next = {
    ...state,
    event_tickets: {
      program: programId.toBase58(),
      config: configPda.toBase58(),
      treasury: treasury.toBase58(),
      feeBps: FEE_BPS,
    },
  };
  writeFileSync(statePath, JSON.stringify(next, null, 2));
  console.log("State updated:", statePath);
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
