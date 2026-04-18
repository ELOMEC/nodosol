import { PublicKey } from "@solana/web3.js";

import { planPda } from "./pdas";
import { subscriptionProgram } from "./programs";

export type Plan = {
  address: PublicKey;
  creator: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  planId: bigint;
  pricePerPeriod: bigint;
  periodSeconds: bigint;
  active: boolean;
  subscriberCount: bigint;
  totalCollected: bigint;
};

export async function fetchPlan(
  creator: PublicKey,
  planId: bigint
): Promise<Plan | null> {
  const [address] = planPda(creator, planId);
  const program = subscriptionProgram();
  try {
    const plan = await (
      program.account as unknown as {
        subscriptionPlan: {
          fetchNullable: (addr: PublicKey) => Promise<{
            creator: PublicKey;
            mint: PublicKey;
            vault: PublicKey;
            planId: { toString: () => string };
            pricePerPeriod: { toString: () => string };
            periodSeconds: { toString: () => string };
            active: boolean;
            subscriberCount: { toString: () => string };
            totalCollected: { toString: () => string };
          } | null>;
        };
      }
    ).subscriptionPlan.fetchNullable(address);
    if (!plan) return null;
    return {
      address,
      creator: plan.creator,
      mint: plan.mint,
      vault: plan.vault,
      planId: BigInt(plan.planId.toString()),
      pricePerPeriod: BigInt(plan.pricePerPeriod.toString()),
      periodSeconds: BigInt(plan.periodSeconds.toString()),
      active: plan.active,
      subscriberCount: BigInt(plan.subscriberCount.toString()),
      totalCollected: BigInt(plan.totalCollected.toString()),
    };
  } catch (err) {
    console.error("fetchPlan failed", err);
    return null;
  }
}

export function formatPeriod(seconds: bigint): string {
  const s = Number(seconds);
  const day = 86_400;
  const hour = 3_600;
  if (s >= day && s % day === 0) {
    const days = s / day;
    if (days === 30) return "month";
    if (days === 7) return "week";
    if (days === 365) return "year";
    return `${days} days`;
  }
  if (s >= hour && s % hour === 0) return `${s / hour} hours`;
  return `${s} seconds`;
}
