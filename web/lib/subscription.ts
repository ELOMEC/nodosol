import { AnchorProvider, BN, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import subscriptionIdl from "../idl/subscription.json";

export const SUBSCRIPTION_PROGRAM_ID = new PublicKey(
  (subscriptionIdl as { address: string }).address
);

const CONFIG_SEED = Buffer.from("config");
const PLAN_SEED = Buffer.from("plan");
const VAULT_SEED = Buffer.from("vault");
const SUBSCRIPTION_SEED = Buffer.from("subscription");

export function subscriptionConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], SUBSCRIPTION_PROGRAM_ID);
}

export function planPda(creator: PublicKey, planId: bigint): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(planId);
  return PublicKey.findProgramAddressSync(
    [PLAN_SEED, creator.toBuffer(), idBuf],
    SUBSCRIPTION_PROGRAM_ID
  );
}

export function planVaultPda(plan: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, plan.toBuffer()],
    SUBSCRIPTION_PROGRAM_ID
  );
}

export function subscriptionProgram(provider: AnchorProvider): Program {
  return new Program(subscriptionIdl as Idl, provider);
}

export type PlanStatusKey = "active" | "paused" | "closed";

export function decodePlanStatus(raw: Record<string, unknown>): PlanStatusKey {
  if ("active" in raw) return "active";
  if ("paused" in raw) return "paused";
  if ("closed" in raw) return "closed";
  return "active";
}

export type PlanDoc = {
  address: string;
  creator: string;
  planId: string;
  mint: string;
  vault: string;
  pricePerPeriod: bigint;
  periodSeconds: number;
  subscriberCount: number;
  totalRevenue: bigint;
  totalWithdrawn: bigint;
  status: PlanStatusKey;
  createdAt: number;
};

export async function fetchPlansByCreator(
  program: Program,
  creator: PublicKey
): Promise<PlanDoc[]> {
  const api = (program.account as Record<string, {
    all: (filters: unknown[]) => Promise<Array<{
      publicKey: PublicKey;
      account: {
        creator: PublicKey;
        planId: BN;
        mint: PublicKey;
        vault: PublicKey;
        pricePerPeriod: BN;
        periodSeconds: BN;
        subscriberCount: BN;
        totalRevenue: BN;
        totalWithdrawn: BN;
        status: Record<string, unknown>;
        createdAt: BN;
      };
    }>>;
  }>).plan;
  // creator at offset 8 (first field after discriminator).
  const items = await api.all([
    { memcmp: { offset: 8, bytes: creator.toBase58() } },
  ]);
  return items
    .map(({ publicKey, account }) => ({
      address: publicKey.toBase58(),
      creator: account.creator.toBase58(),
      planId: account.planId.toString(),
      mint: account.mint.toBase58(),
      vault: account.vault.toBase58(),
      pricePerPeriod: BigInt(account.pricePerPeriod.toString()),
      periodSeconds: account.periodSeconds.toNumber(),
      subscriberCount: account.subscriberCount.toNumber(),
      totalRevenue: BigInt(account.totalRevenue.toString()),
      totalWithdrawn: BigInt(account.totalWithdrawn.toString()),
      status: decodePlanStatus(account.status),
      createdAt: account.createdAt.toNumber(),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function periodLabel(seconds: number): string {
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    if (days === 30) return "month";
    if (days === 7) return "week";
    if (days === 1) return "day";
    return `${days} days`;
  }
  if (seconds % 3_600 === 0) {
    return `${seconds / 3_600} hours`;
  }
  return `${seconds} seconds`;
}
