/**
 * Devnet init for the otc_deals program.
 *
 * Sets Config with fee_bps = 300 (3%) and treasury = dev wallet's
 * mock-USDC ATA. Idempotent.
 *
 * Run:  npm run init-otc
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, web3 } = pkg;
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

import otcIdl from "../web/idl/otc_deals.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;
const CONFIG_SEED = Buffer.from("config");
const FEE_BPS = 300;

async function main() {
  const walletKeypair = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  console.log("Authority:", walletKeypair.publicKey.toBase58());
  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log("Balance:", balance / web3.LAMPORTS_PER_SOL, "SOL");

  const program = new Program(otcIdl as never, provider);
  const programId = new PublicKey((otcIdl as { address: string }).address);
  console.log("otc_deals program:", programId.toBase58());

  const statePath = pathResolve(import.meta.dirname, "devnet-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const treasury = new PublicKey(state.walletUsdcAta);
  console.log("Treasury ATA:", treasury.toBase58());

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  console.log("OTC config PDA:", configPda.toBase58());

  const existing = await connection.getAccountInfo(configPda);
  if (existing) {
    console.log("OTC config already initialised — skipping");
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
    otc: {
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
