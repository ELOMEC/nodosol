/**
 * Mints demo USDC to any wallet so it can try the Blinks.
 *
 * Usage:
 *   npm run fund-user -- <wallet-address> [amount]
 *
 * - <wallet-address>: Phantom / Backpack devnet pubkey
 * - [amount]: USDC units (default 100)
 *
 * Requires the mint authority keypair (our dev wallet at
 * id-devnet.json) to be able to sign the mint_to instruction.
 */

import pkg from "@coral-xyz/anchor";
const { web3 } = pkg;
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

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ??
  `${homedir()}/.config/solana/id-devnet.json`;

const USDC_UNIT = 1_000_000n;

const argRecipient = process.argv[2];
const argAmount = process.argv[3];

if (!argRecipient) {
  console.error("Usage: npm run fund-user -- <wallet-address> [amount]");
  process.exit(1);
}

const recipient = new PublicKey(argRecipient);
const amountUsdc = argAmount ? BigInt(argAmount) : 100n;
const mintAmount = amountUsdc * USDC_UNIT;

const mint = new PublicKey(
  process.env.DEMO_USDC_MINT ?? "73w3ocXSe2yDMWTHj1kwQxrbNjUY9tBJP9HYDkcpmh7h"
);

async function main() {
  const authority = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("Mint authority:", authority.publicKey.toBase58());
  console.log("Mint:", mint.toBase58());
  console.log("Recipient:", recipient.toBase58());
  console.log("Amount:", amountUsdc.toString(), "USDC");

  const ata = getAssociatedTokenAddressSync(
    mint,
    recipient,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey,
      ata,
      recipient,
      mint,
      TOKEN_2022_PROGRAM_ID
    ),
    createMintToInstruction(
      mint,
      ata,
      authority.publicKey,
      mintAmount,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  const sig = await web3.sendAndConfirmTransaction(connection, tx, [authority]);
  console.log("\nMinted. Signature:", sig);
  console.log("Recipient ATA:", ata.toBase58());
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
