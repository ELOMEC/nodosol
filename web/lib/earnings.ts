import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

import { USDC_UNIT } from "./constants";
import { creatorProfilePda } from "./tipJar";
import {
  eventsProgram,
  subscriptionProgram,
  tipJarProgram,
} from "./programs";

import eventTicketsIdl from "@/idl/event_tickets.json";

/**
 * Aggregated earnings export across the three revenue programs.
 *
 * What's *not* here: per-transaction breakdowns. Those require
 * `getTransaction` per signature (1 RPC per row) which is fine for a
 * small jar but breaks for any active creator. We surface the on-chain
 * lifetime totals + per-Subscription rows (which already store
 * `total_paid` + `subscriber`) and per-Event rows. A "per tip" CSV
 * needs a Helius enhanced transaction pull and ships in a follow-up.
 */

export type EarningsRow = {
  /** ISO 8601 date — derived from on-chain `created_at` / `started_at`. */
  date_iso: string;
  /** "tip_total" | "subscription" | "event_sales" */
  kind: string;
  /** plan_id for subscriptions, event_id for events, blank for tips. */
  plan_or_event_id: string;
  /** Subscriber wallet for subscriptions, blank otherwise (no per-tip data). */
  counterparty: string;
  /** Charge count / sold count / lifetime tip count. */
  charges_or_count: number;
  /** USDC amount earned (raw / USDC_UNIT). */
  amount_usdc: number;
  /** Source account PDA for traceability. */
  source_account: string;
};

type RawCreatorProfile = {
  totalTipCount: BN;
  totalTipsAmount: BN;
  createdAt: BN;
};

type RawPlan = {
  publicKey: { toBase58(): string };
  account: {
    creator: { toBase58(): string };
    planId: BN;
  };
};

type RawSubscription = {
  publicKey: { toBase58(): string };
  account: {
    plan: { toBase58(): string };
    subscriber: { toBase58(): string };
    startedAt: BN;
    chargeCount: BN;
    totalPaid: BN;
  };
};

type RawEvent = {
  publicKey: { toBase58(): string };
  account: {
    creator: { toBase58(): string };
    eventId: BN;
    sold: BN;
    totalRevenue: BN;
    createdAt: BN;
  };
};

function isoFromUnixSec(unixSec: number): string {
  if (!Number.isFinite(unixSec) || unixSec <= 0) return "";
  return new Date(unixSec * 1000).toISOString();
}

function bnToNumber(value?: BN): number {
  if (!value) return 0;
  return Number(value.toString());
}

function memcmp8(walletBase58: string) {
  return [{ memcmp: { offset: 8, bytes: walletBase58 } }] as const;
}

/**
 * Snapshots all earnings rows for a creator wallet across tip_jar +
 * subscription (Subscription accounts owned via Plan-creator filter)
 * + event_tickets. Best-effort: any program that throws is skipped
 * with a console warn so the rest still shows up.
 */
export async function fetchEarnings(
  provider: AnchorProvider,
  walletStr: string,
): Promise<EarningsRow[]> {
  const rows: EarningsRow[] = [];
  const owner = new PublicKey(walletStr);

  // 1. Tip jar lifetime totals.
  try {
    const tip = tipJarProgram(provider);
    const [pda] = creatorProfilePda(owner);
    const accApi = (
      tip.account as Record<string, { fetchNullable: (a: PublicKey) => Promise<RawCreatorProfile | null> }>
    ).creatorProfile;
    if (accApi) {
      const profile = await accApi.fetchNullable(pda);
      if (profile) {
        const amount = bnToNumber(profile.totalTipsAmount) / USDC_UNIT;
        const count = bnToNumber(profile.totalTipCount);
        if (count > 0) {
          rows.push({
            date_iso: isoFromUnixSec(bnToNumber(profile.createdAt)),
            kind: "tip_total",
            plan_or_event_id: "",
            counterparty: "",
            charges_or_count: count,
            amount_usdc: amount,
            source_account: pda.toBase58(),
          });
        }
      }
    }
  } catch (err) {
    console.warn("earnings: tip_jar fetch failed", err);
  }

  // 2. Subscriptions: filter own plans, then pull subs with plan in our set.
  try {
    const sub = subscriptionProgram(provider);
    type PlanApi = {
      all: (filters?: ReadonlyArray<{ memcmp: { offset: number; bytes: string } }>) => Promise<RawPlan[]>;
    };
    type SubApi = {
      all: () => Promise<RawSubscription[]>;
    };
    const planApi = (sub.account as Record<string, unknown>).subscriptionPlan as PlanApi | undefined;
    const subApi = (sub.account as Record<string, unknown>).subscription as SubApi | undefined;
    if (planApi && subApi) {
      const ownedPlans = await planApi.all(memcmp8(walletStr));
      const planIdByAddr = new Map<string, number>();
      for (const p of ownedPlans) {
        planIdByAddr.set(p.publicKey.toBase58(), bnToNumber(p.account.planId));
      }
      const allSubs = planIdByAddr.size === 0 ? [] : await subApi.all();
      for (const s of allSubs) {
        const planAddr = s.account.plan.toBase58();
        const planId = planIdByAddr.get(planAddr);
        if (planId === undefined) continue;
        const totalPaid = bnToNumber(s.account.totalPaid) / USDC_UNIT;
        const charges = bnToNumber(s.account.chargeCount);
        if (charges === 0 || totalPaid === 0) continue;
        rows.push({
          date_iso: isoFromUnixSec(bnToNumber(s.account.startedAt)),
          kind: "subscription",
          plan_or_event_id: String(planId),
          counterparty: s.account.subscriber.toBase58(),
          charges_or_count: charges,
          amount_usdc: totalPaid,
          source_account: s.publicKey.toBase58(),
        });
      }
    }
  } catch (err) {
    console.warn("earnings: subscription fetch failed", err);
  }

  // 3. Events (free + ticketed): ticketed events live in event_tickets,
  // legacy single-tier events live in `events`. Pull from both.
  type EventApi = {
    all: (filters?: ReadonlyArray<{ memcmp: { offset: number; bytes: string } }>) => Promise<RawEvent[]>;
  };
  for (const programLoader of [eventsProgram, () => loadEventTicketsProgram(provider)]) {
    try {
      const program = programLoader(provider);
      const evApi = (program.account as Record<string, unknown>).event as EventApi | undefined;
      if (!evApi) continue;
      const evs = await evApi.all(memcmp8(walletStr));
      for (const e of evs) {
        const sold = bnToNumber(e.account.sold);
        const revenue = bnToNumber(e.account.totalRevenue) / USDC_UNIT;
        if (sold === 0 || revenue === 0) continue;
        rows.push({
          date_iso: isoFromUnixSec(bnToNumber(e.account.createdAt)),
          kind: "event_sales",
          plan_or_event_id: bnToNumber(e.account.eventId).toString(),
          counterparty: "",
          charges_or_count: sold,
          amount_usdc: revenue,
          source_account: e.publicKey.toBase58(),
        });
      }
    } catch (err) {
      console.warn("earnings: events fetch failed", err);
    }
  }

  // Most recent first.
  rows.sort((a, b) => (b.date_iso || "").localeCompare(a.date_iso || ""));
  return rows;
}

function loadEventTicketsProgram(provider: AnchorProvider): Program {
  return new Program(eventTicketsIdl as never, provider);
}

const CSV_HEADERS = [
  "date_iso",
  "kind",
  "plan_or_event_id",
  "counterparty",
  "charges_or_count",
  "amount_usdc",
  "source_account",
];

function escapeCell(v: string | number): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function earningsToCsv(rows: EarningsRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escapeCell(r.date_iso),
        escapeCell(r.kind),
        escapeCell(r.plan_or_event_id),
        escapeCell(r.counterparty),
        escapeCell(r.charges_or_count),
        escapeCell(r.amount_usdc.toFixed(2)),
        escapeCell(r.source_account),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

// Re-export so callers don't need a second import.
export type { Wallet, TransactionInstruction };
