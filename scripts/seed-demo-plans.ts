/**
 * Seed 5 subscription plans under the dev wallet for demo purposes.
 * Idempotent: skips plans whose PDAs already exist.
 */

import pkg from "@coral-xyz/anchor";
const { AnchorProvider, BN, Program, Wallet } = pkg;
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import subscriptionIdl from "../web/idl/subscription.json" with { type: "json" };

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.SOLANA_WALLET_PATH ?? `${homedir()}/.config/solana/id-devnet.json`;

const USDC_MINT = new PublicKey("73w3ocXSe2yDMWTHj1kwQxrbNjUY9tBJP9HYDkcpmh7h");
const USDC_DECIMALS = 6;
const USDC_UNIT = 10n ** BigInt(USDC_DECIMALS);

const PLAN_SEED = Buffer.from("plan");
const VAULT_SEED = Buffer.from("vault");

type PlanSpec = {
  label: string;
  priceUsdc: number;
  periodSeconds: number;
  periodLabel: string;
};

const PLANS: PlanSpec[] = [
  { label: "Daily pass",      priceUsdc: 1,   periodSeconds: 86_400,         periodLabel: "daily" },
  { label: "Weekly supporter", priceUsdc: 5,  periodSeconds: 7 * 86_400,     periodLabel: "weekly" },
  { label: "Bronze (monthly)", priceUsdc: 9,  periodSeconds: 30 * 86_400,    periodLabel: "monthly" },
  { label: "Silver (monthly)", priceUsdc: 25, periodSeconds: 30 * 86_400,    periodLabel: "monthly" },
  { label: "Gold VIP (monthly)", priceUsdc: 99, periodSeconds: 30 * 86_400,  periodLabel: "monthly" },
];

async function main() {
  const kp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(WALLET_PATH, "utf8")))
  );
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(kp), {
    commitment: "confirmed",
  });
  const program = new Program(subscriptionIdl as never, provider);
  const programId = new PublicKey((subscriptionIdl as { address: string }).address);

  console.log("Creator:", kp.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(kp.publicKey)) / 1e9, "SOL");

  // Deterministic ids — 1..5 — so re-runs are idempotent without clock drift.
  for (let i = 0; i < PLANS.length; i++) {
    const spec = PLANS[i];
    const planId = BigInt(i + 1);
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(planId);
    const [planPda] = PublicKey.findProgramAddressSync(
      [PLAN_SEED, kp.publicKey.toBuffer(), idBuf],
      programId
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, planPda.toBuffer()],
      programId
    );

    const existing = await connection.getAccountInfo(planPda);
    if (existing) {
      console.log(`[${i + 1}/${PLANS.length}] ${spec.label} already exists — ${planPda.toBase58().slice(0, 8)}…`);
      continue;
    }

    const priceBase = BigInt(Math.round(spec.priceUsdc * Number(USDC_UNIT)));
    const sig = await program.methods
      .createPlan(
        new BN(planId.toString()),
        new BN(priceBase.toString()),
        new BN(spec.periodSeconds)
      )
      .accounts({
        creator: kp.publicKey,
        mint: USDC_MINT,
        plan: planPda,
        vault: vaultPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as never)
      .rpc();
    console.log(
      `[${i + 1}/${PLANS.length}] ${spec.label} @ $${spec.priceUsdc}/${spec.periodLabel} — sig ${sig.slice(0, 8)}…`
    );
  }

  console.log("\n✓ Demo plans seeded.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
