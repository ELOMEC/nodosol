/**
 * Devnet init for the RWA stack.
 *
 * - Initialises rwa_registry Config (authority = dev wallet).
 * - Registers the dev wallet itself as the first Active issuer,
 *   authorised for Commodity + Ticket asset classes, jurisdiction SRB.
 *
 * Idempotent: skips steps whose PDAs already exist.
 * Run:  npm run init-rwa
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, web3 } = pkg;
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

import registryIdl from "../web/idl/rwa_registry.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;

const CONFIG_SEED = Buffer.from("config");
const ISSUER_SEED = Buffer.from("issuer");

// Bitmap flags — keep in sync with programs/rwa_registry/src/constants.rs
const ASSET_CLASS_COMMODITY = 1 << 0;
const ASSET_CLASS_TICKET = 1 << 4;

async function main() {
  const walletKeypair = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  console.log("Authority / issuer owner:", walletKeypair.publicKey.toBase58());
  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log("Balance:", balance / web3.LAMPORTS_PER_SOL, "SOL");

  const registry = new Program(registryIdl as never, provider);
  const programId = new PublicKey((registryIdl as { address: string }).address);
  console.log("rwa_registry program:", programId.toBase58());

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  const [issuerPda] = PublicKey.findProgramAddressSync(
    [ISSUER_SEED, walletKeypair.publicKey.toBuffer()],
    programId
  );
  console.log("Registry config PDA:", configPda.toBase58());
  console.log("Issuer PDA:", issuerPda.toBase58());

  // 1. initialize_registry
  const existingCfg = await connection.getAccountInfo(configPda);
  if (existingCfg) {
    console.log("Registry already initialised — skipping");
  } else {
    const sig = await registry.methods
      .initializeRegistry()
      .accounts({
        authority: walletKeypair.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("initialize_registry sig:", sig);
  }

  // 2. register_issuer — dev wallet as Active issuer
  const existingIssuer = await connection.getAccountInfo(issuerPda);
  if (existingIssuer) {
    console.log("Issuer already registered — skipping");
  } else {
    const jurisdictions = [Array.from(Buffer.from("SRB"))];
    const assetClasses = ASSET_CLASS_COMMODITY | ASSET_CLASS_TICKET;
    const sig = await registry.methods
      .registerIssuer(
        walletKeypair.publicKey,
        jurisdictions,
        assetClasses,
        "DEMO-KYC-001",
        { active: {} }
      )
      .accounts({
        authority: walletKeypair.publicKey,
        config: configPda,
        issuer: issuerPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("register_issuer sig:", sig);
  }

  // Persist state so web + next scripts can find these PDAs.
  const statePath = pathResolve(import.meta.dirname, "devnet-state.json");
  const existingState = JSON.parse(readFileSync(statePath, "utf8"));
  const nextState = {
    ...existingState,
    rwa: {
      registryProgram: programId.toBase58(),
      registryConfig: configPda.toBase58(),
      issuer: issuerPda.toBase58(),
      issuerOwner: walletKeypair.publicKey.toBase58(),
      jurisdictions: ["SRB"],
      assetClassesBitmap: ASSET_CLASS_COMMODITY | ASSET_CLASS_TICKET,
    },
  };
  writeFileSync(statePath, JSON.stringify(nextState, null, 2));
  console.log("\nState updated:", statePath);
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
