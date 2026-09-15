/**
 * Seed 5 sealed-bid demo auctions with varying phases + price ranges.
 * Idempotent: skips auctions whose PDAs already exist.
 *
 * Run after `anchor deploy --program-name auctions` + `npm run init-auctions`:
 *   npm run seed-demo-auctions
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, BN, Program, Wallet } = pkg;
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
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

import auctionsIdl from "../web/idl/auctions.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;

const USDC_MINT = new PublicKey("73w3ocXSe2yDMWTHj1kwQxrbNjUY9tBJP9HYDkcpmh7h");
const USDC_DECIMALS = 6;
const USDC_UNIT = 10n ** BigInt(USDC_DECIMALS);

const AUCTION_SEED = Buffer.from("auction");
const VAULT_SEED = Buffer.from("vault");

type AuctionSpec = {
  /** Used as auction_id (deterministic); must be unique per seller. */
  id: bigint;
  memo: string;
  metadataUri: string;
  startPriceUsdc: number;
  minDepositUsdc: number;
  /** Seconds from now until commit phase ends. */
  commitDurationSec: number;
  /** Seconds from commit-end until reveal phase ends. */
  revealDurationSec: number;
};

const AUCTIONS: AuctionSpec[] = [
  {
    id: 700_001n,
    memo: "Belgrade penthouse — 30-day rights",
    metadataUri: "https://www.nodosol.com/api/metadata/auction-belgrade-penthouse",
    startPriceUsdc: 250,
    minDepositUsdc: 25,
    commitDurationSec: 3 * 86_400,
    revealDurationSec: 1 * 86_400,
  },
  {
    id: 700_002n,
    memo: "EXIT 2026 VIP weekend pass",
    metadataUri: "https://www.nodosol.com/api/metadata/auction-exit-vip-2026",
    startPriceUsdc: 80,
    minDepositUsdc: 10,
    commitDurationSec: 7 * 86_400,
    revealDurationSec: 2 * 86_400,
  },
  {
    id: 700_003n,
    memo: "Pannonian wheat futures — Q3 2026",
    metadataUri: "https://www.nodosol.com/api/metadata/auction-wheat-q3",
    startPriceUsdc: 1200,
    minDepositUsdc: 120,
    commitDurationSec: 5 * 86_400,
    revealDurationSec: 1 * 86_400,
  },
  {
    id: 700_004n,
    memo: "Carbon offset bundle — 100 t CO₂",
    metadataUri: "https://www.nodosol.com/api/metadata/auction-carbon-100t",
    startPriceUsdc: 4500,
    minDepositUsdc: 450,
    commitDurationSec: 14 * 86_400,
    revealDurationSec: 3 * 86_400,
  },
  {
    id: 700_005n,
    memo: "Legendary jersey — Crvena Zvezda 1991",
    metadataUri: "https://www.nodosol.com/api/metadata/auction-zvezda-jersey",
    startPriceUsdc: 600,
    minDepositUsdc: 60,
    commitDurationSec: 4 * 86_400,
    revealDurationSec: 1 * 86_400,
  },
];

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const kp = loadKeypair(WALLET_PATH);
  const wallet = new Wallet(kp);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(auctionsIdl as never, provider);
  const programId = new PublicKey((auctionsIdl as { address: string }).address);

  console.log(`Seeding auctions with seller ${kp.publicKey.toBase58()} (${AUCTIONS.length} planned)…`);

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < AUCTIONS.length; i++) {
    const spec = AUCTIONS[i];
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(spec.id);

    const [auctionPda] = PublicKey.findProgramAddressSync(
      [AUCTION_SEED, kp.publicKey.toBuffer(), idBuf],
      programId
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, auctionPda.toBuffer()],
      programId
    );

    const existing = await connection.getAccountInfo(auctionPda);
    if (existing) {
      skipped++;
      console.log(`[${i + 1}/${AUCTIONS.length}] ${spec.memo} — already exists, skipping`);
      continue;
    }

    const now = Math.floor(Date.now() / 1000);
    const commitEndsAt = now + spec.commitDurationSec;
    const revealEndsAt = commitEndsAt + spec.revealDurationSec;

    const ix = await (program.methods as Record<string, (...args: unknown[]) => {
      accounts: (a: unknown) => { instruction: () => Promise<unknown> };
    }>)
      .createAuction(
        new BN(spec.id.toString()),
        new BN(Math.round(spec.startPriceUsdc * Number(USDC_UNIT))),
        new BN(Math.round(spec.minDepositUsdc * Number(USDC_UNIT))),
        new BN(commitEndsAt),
        new BN(revealEndsAt),
        spec.memo,
        spec.metadataUri
      )
      .accounts({
        seller: kp.publicKey,
        auction: auctionPda,
        paymentMint: USDC_MINT,
        vault: vaultPda,
        paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
      .add(ix as never);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = kp.publicKey;
    tx.sign(kp);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction(sig, "confirmed");

    created++;
    console.log(
      `[${i + 1}/${AUCTIONS.length}] ${spec.memo} @ start $${spec.startPriceUsdc} — ${sig.slice(0, 8)}…`
    );
  }

  console.log(`\n✓ Auctions seeded — ${created} new, ${skipped} already-exist.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
