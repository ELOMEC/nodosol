/**
 * Mints from the CT-enabled mock-USDC mint to any wallet so it can
 * exercise the Confidential Transfer flows (configure / deposit /
 * withdraw). Mirrors scripts/fund-user.ts but targets the CT mint
 * recorded in devnet-state.json under `ct.mint`.
 *
 * Usage:
 *   npx tsx fund-user-ct.ts <wallet-address> [amount]
 */

import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ??
  `${homedir()}/.config/solana/id-devnet.json`;

const USDC_UNIT = 1_000_000n;

const argRecipient = process.argv[2];
const argAmount = process.argv[3];

if (!argRecipient) {
  console.error("Usage: npx tsx fund-user-ct.ts <wallet-address> [amount]");
  process.exit(1);
}

const recipient = new PublicKey(argRecipient);
const amountUsdc = argAmount ? BigInt(argAmount) : 100n;
const mintAmount = amountUsdc * USDC_UNIT;

const statePath = pathResolve(import.meta.dirname, "devnet-state.json");
const state = JSON.parse(readFileSync(statePath, "utf8"));
if (!state.ct?.mint) {
  console.error("No ct.mint in devnet-state.json. Create the mint first:");
  console.error("  spl-token create-token --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb --decimals 6 --enable-confidential-transfers auto --url devnet");
  process.exit(1);
}
const mint = new PublicKey(state.ct.mint as string);

async function main() {
  const authority = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("Mint authority:", authority.publicKey.toBase58());
  console.log("CT Mint:", mint.toBase58());
  console.log("Recipient:", recipient.toBase58());
  console.log("Amount:", amountUsdc.toString(), "USDC");

  const recipientAta = getAssociatedTokenAddressSync(
    mint,
    recipient,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey,
      recipientAta,
      recipient,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  );
  tx.add(
    createMintToInstruction(
      mint,
      recipientAta,
      authority.publicKey,
      mintAmount,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(authority);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

  console.log("\nMinted. Signature:", sig);
  console.log("Recipient CT ATA:", recipientAta.toBase58());
  console.log(
    "\nBefore using these tokens confidentially, the recipient must call configure_account on their ATA via the app."
  );
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
