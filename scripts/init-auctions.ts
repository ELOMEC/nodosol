/**
 * Devnet init for the auctions program.
 *
 * Sets the global AuctionConfig — fee_bps = 250 (2.5%), treasury =
 * dev wallet's mock-USDC ATA (same one event_tickets uses). Idempotent.
 *
 * Run AFTER `anchor deploy --program-name auctions`:
 *   npm run init-auctions
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, web3 } = pkg;
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

import auctionsIdl from "../web/idl/auctions.json" with { type: "json" };

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

  const program = new Program(auctionsIdl as never, provider);
  const programId = new PublicKey((auctionsIdl as { address: string }).address);
  console.log("auctions program:", programId.toBase58());

  const statePath = pathResolve(import.meta.dirname, "devnet-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const treasury = new PublicKey(state.walletUsdcAta);
  const paymentMint = new PublicKey(state.mint);
  console.log("Payment mint:", paymentMint.toBase58());
  console.log("Treasury ATA:", treasury.toBase58());

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  console.log("AuctionConfig PDA:", configPda.toBase58());

  const existing = await connection.getAccountInfo(configPda);
  if (existing) {
    console.log("AuctionConfig already initialised — skipping");
  } else {
    const sig = await program.methods
      .initializeAuctionConfig(FEE_BPS)
      .accounts({
        authority: walletKeypair.publicKey,
        config: configPda,
        paymentMint,
        treasury,
        systemProgram: SystemProgram.programId,
      } as never)
      .rpc();
    console.log("initialize_auction_config sig:", sig);
  }

  const next = {
    ...state,
    auctions: {
      program: programId.toBase58(),
      config: configPda.toBase58(),
      treasury: treasury.toBase58(),
      feeBps: FEE_BPS,
    },
  };
  writeFileSync(statePath, JSON.stringify(next, null, 2));
  console.log("State updated:", statePath);

  // Silence unused import lint — kept for ref if we ever need the token program id.
  void TOKEN_2022_PROGRAM_ID;
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
