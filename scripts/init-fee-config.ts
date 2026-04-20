/**
 * Initialize Config PDA on all 3 programs with fee_bps=0.
 *
 * Idempotent: skips programs whose Config PDA already exists.
 * Treasury = dev wallet's USDC ATA from devnet-state.json.
 *
 * Run:  npm run init-fee-config
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, web3 } = pkg;
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

import tipJarIdl from "../web/idl/tip_jar.json" with { type: "json" };
import subscriptionIdl from "../web/idl/subscription.json" with { type: "json" };
import eventsIdl from "../web/idl/events.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;

const FEE_BPS = 0;
const CONFIG_SEED = Buffer.from("config");

async function main() {
  const walletKeypair = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  console.log("Authority:", walletKeypair.publicKey.toBase58());
  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log("Balance:", balance / web3.LAMPORTS_PER_SOL, "SOL");

  const statePath = pathResolve(import.meta.dirname, "devnet-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const treasury = new PublicKey(state.walletUsdcAta);
  console.log("Treasury ATA:", treasury.toBase58());

  const programs = [
    { name: "tip_jar", idl: tipJarIdl },
    { name: "subscription", idl: subscriptionIdl },
    { name: "events", idl: eventsIdl },
  ];

  const results: Record<string, { config: string; signature: string | null }> = {};

  for (const { name, idl } of programs) {
    const program = new Program(idl as never, provider);
    const programId = new PublicKey((idl as { address: string }).address);
    const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

    console.log(`\n[${name}] program: ${programId.toBase58()}`);
    console.log(`[${name}] config PDA: ${configPda.toBase58()}`);

    const existing = await connection.getAccountInfo(configPda);
    if (existing) {
      console.log(`[${name}] Config already initialized — skipping`);
      results[name] = { config: configPda.toBase58(), signature: null };
      continue;
    }

    const sig = await program.methods
      .initializeConfig(FEE_BPS)
      .accounts({
        authority: walletKeypair.publicKey,
        config: configPda,
        treasury,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`[${name}] initialize_config sig: ${sig}`);
    results[name] = { config: configPda.toBase58(), signature: sig };
  }

  const newState = {
    ...state,
    treasury: treasury.toBase58(),
    feeBps: FEE_BPS,
    configs: {
      tipJar: results.tip_jar.config,
      subscription: results.subscription.config,
      events: results.events.config,
    },
  };
  writeFileSync(statePath, JSON.stringify(newState, null, 2));
  console.log("\nState updated:", statePath);
  console.log(JSON.stringify(newState.configs, null, 2));
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
