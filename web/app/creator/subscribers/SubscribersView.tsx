"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import { subscriptionProgram } from "@/lib/programs";

type RawPlan = {
  publicKey: { toBase58(): string };
  account: {
    creator: { toBase58(): string };
    planId: BN;
    pricePerPeriod: BN;
    periodSeconds: BN;
    active: boolean;
    subscriberCount: BN;
    totalCollected: BN;
  };
};

type RawSubscription = {
  publicKey: { toBase58(): string };
  account: {
    plan: { toBase58(): string };
    subscriber: { toBase58(): string };
    startedAt: BN;
    nextChargeAt: BN;
    chargeCount: BN;
    totalPaid: BN;
    status: Record<string, unknown>;
    cancelledAt: BN;
  };
};

type PlanRow = {
  address: string;
  planId: number;
  priceUsdc: number;
  periodSeconds: number;
  active: boolean;
  subscriberCount: number;
  totalCollectedUsdc: number;
};

type SubRow = {
  address: string;
  plan: string;
  subscriber: string;
  status: "active" | "cancelled" | "expired" | "unknown";
  startedAt: number;
  nextChargeAt: number;
  chargeCount: number;
  totalPaidUsdc: number;
};

function statusFromAnchor(s: Record<string, unknown>): SubRow["status"] {
  if (!s || typeof s !== "object") return "unknown";
  if ("active" in s) return "active";
  if ("cancelled" in s) return "cancelled";
  if ("expired" in s) return "expired";
  return "unknown";
}

export function SubscribersView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [subs, setSubs] = useState<SubRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = subscriptionProgram(provider);

      // Anchor account discriminator is the first 8 bytes; the next 32
      // bytes for SubscriptionPlan are the `creator` field, so a memcmp
      // at offset 8 with the wallet pubkey filters to plans we own.
      type PlanAccountApi = {
        all: (
          filters?: Array<{ memcmp: { offset: number; bytes: string } }>,
        ) => Promise<RawPlan[]>;
      };
      type SubAccountApi = {
        all: (
          filters?: Array<{ memcmp: { offset: number; bytes: string } }>,
        ) => Promise<RawSubscription[]>;
      };

      const accounts = program.account as Record<string, unknown>;
      const planApi = accounts.subscriptionPlan as PlanAccountApi | undefined;
      const subApi = accounts.subscription as SubAccountApi | undefined;

      if (!planApi || !subApi) {
        setError("Subscription program accounts are missing from the IDL");
        return;
      }

      const ownedPlans = await planApi.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]);

      const planRows: PlanRow[] = ownedPlans
        .map((p) => ({
          address: p.publicKey.toBase58(),
          planId: Number(p.account.planId?.toString?.() ?? 0),
          priceUsdc: Number(p.account.pricePerPeriod?.toString?.() ?? 0) / USDC_UNIT,
          periodSeconds: Number(p.account.periodSeconds?.toString?.() ?? 0),
          active: Boolean(p.account.active),
          subscriberCount: Number(p.account.subscriberCount?.toString?.() ?? 0),
          totalCollectedUsdc:
            Number(p.account.totalCollected?.toString?.() ?? 0) / USDC_UNIT,
        }))
        .sort((a, b) => a.planId - b.planId);

      // Subscription has 8-byte discriminator + 32-byte `plan` pubkey at
      // offset 8 — but doing N memcmps would mean N RPC round-trips.
      // Cheaper: pull every Subscription once, then filter in-memory by
      // the plan addresses we just fetched.
      const planSet = new Set(planRows.map((p) => p.address));
      const allSubs = planSet.size === 0 ? [] : await subApi.all();

      const subRows: SubRow[] = allSubs
        .filter((s) => planSet.has(s.account.plan.toBase58()))
        .map((s) => ({
          address: s.publicKey.toBase58(),
          plan: s.account.plan.toBase58(),
          subscriber: s.account.subscriber.toBase58(),
          status: statusFromAnchor(s.account.status),
          startedAt: Number(s.account.startedAt?.toString?.() ?? 0),
          nextChargeAt: Number(s.account.nextChargeAt?.toString?.() ?? 0),
          chargeCount: Number(s.account.chargeCount?.toString?.() ?? 0),
          totalPaidUsdc:
            Number(s.account.totalPaid?.toString?.() ?? 0) / USDC_UNIT,
        }))
        .sort((a, b) => b.totalPaidUsdc - a.totalPaidUsdc);

      setPlans(planRows);
      setSubs(subRows);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load subscribers");
    } finally {
      setBusy(false);
    }
  }, [publicKey, connection, wallet]);

  useEffect(() => {
    if (connected && publicKey) void reload();
    else {
      setPlans(null);
      setSubs(null);
    }
  }, [connected, publicKey, reload]);

  const subsByPlan = useMemo(() => {
    if (!subs) return new Map<string, SubRow[]>();
    const m = new Map<string, SubRow[]>();
    for (const s of subs) {
      const arr = m.get(s.plan);
      if (arr) arr.push(s);
      else m.set(s.plan, [s]);
    }
    return m;
  }, [subs]);

  if (!connected || !publicKey) {
    return (
      <div style={{ padding: "2rem 0", maxWidth: 560 }}>
        <h1 style={H1}>Subscribers</h1>
        <p style={SUB}>
          Connect a wallet to see who&apos;s subscribed across your plans.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem 0" }}>
      <header style={HEADER}>
        <div>
          <h1 style={H1}>Subscribers</h1>
          <p style={SUB}>
            On-chain Subscription accounts grouped by your plans. Sorted
            by total paid (lifetime) within each plan.
          </p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={busy} style={BTN}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </header>

      {error ? <p style={ERROR}>{error}</p> : null}

      {!plans || !subs ? (
        <p style={SUB}>{busy ? "Loading…" : ""}</p>
      ) : plans.length === 0 ? (
        <div style={CARD}>
          <h2 style={H2}>No plans yet</h2>
          <p style={CARD_SUB}>
            Create a subscription plan in{" "}
            <a href="/creator/plans" style={LINK}>
              Creator → Subscriptions
            </a>{" "}
            to start collecting recurring USDC.
          </p>
        </div>
      ) : (
        plans.map((plan) => (
          <PlanCard
            key={plan.address}
            plan={plan}
            subs={subsByPlan.get(plan.address) ?? []}
          />
        ))
      )}
    </div>
  );
}

function PlanCard({ plan, subs }: { plan: PlanRow; subs: SubRow[] }) {
  return (
    <section style={CARD}>
      <header style={CARD_HEAD}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <h2 style={H2}>Plan #{plan.planId}</h2>
            <span style={plan.active ? BADGE_OK : BADGE_OFF}>
              {plan.active ? "Active" : "Paused"}
            </span>
          </div>
          <div style={CARD_HINT}>
            ${plan.priceUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} every {humanizePeriod(plan.periodSeconds)} ·{" "}
            {plan.subscriberCount} subscriber{plan.subscriberCount === 1 ? "" : "s"} ·{" "}
            ${plan.totalCollectedUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} collected
          </div>
        </div>
      </header>

      {subs.length === 0 ? (
        <p style={CARD_SUB}>No subscribers on this plan yet.</p>
      ) : (
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={TH}>Subscriber</th>
              <th style={TH}>Status</th>
              <th style={{ ...TH, textAlign: "right" }}>Charges</th>
              <th style={{ ...TH, textAlign: "right" }}>Total paid</th>
              <th style={{ ...TH, textAlign: "right" }}>Next charge</th>
              <th style={TH}>Started</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.address}>
                <td style={TD}>
                  <code style={MONO}>{shortPubkey(s.subscriber)}</code>
                </td>
                <td style={TD}>{statusBadge(s.status)}</td>
                <td style={{ ...TD, textAlign: "right" }}>{s.chargeCount}</td>
                <td style={{ ...TD, textAlign: "right" }}>
                  ${s.totalPaidUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td style={{ ...TD, textAlign: "right" }}>
                  {s.status === "active" ? formatDate(s.nextChargeAt) : "—"}
                </td>
                <td style={TD}>{formatDate(s.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function statusBadge(status: SubRow["status"]) {
  const map: Record<SubRow["status"], { label: string; bg: string; color: string }> = {
    active: { label: "Active", bg: "rgba(16,185,129,0.12)", color: "#059669" },
    cancelled: { label: "Cancelled", bg: "rgba(245,158,11,0.12)", color: "#b45309" },
    expired: { label: "Expired", bg: "rgba(239,68,68,0.12)", color: "#b91c1c" },
    unknown: { label: "Unknown", bg: "rgba(148,163,184,0.16)", color: "#64748b" },
  };
  const m = map[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.45rem",
        borderRadius: 999,
        fontSize: "0.7rem",
        fontWeight: 600,
        background: m.bg,
        color: m.color,
      }}
    >
      {m.label}
    </span>
  );
}

function shortPubkey(p: string): string {
  return p.length > 10 ? `${p.slice(0, 4)}…${p.slice(-4)}` : p;
}

function formatDate(unixSec: number): string {
  if (!unixSec) return "—";
  return new Date(unixSec * 1000).toLocaleDateString();
}

function humanizePeriod(seconds: number): string {
  if (seconds <= 0) return "—";
  const day = 86_400;
  if (seconds % (day * 365) === 0) return `${seconds / (day * 365)}y`;
  if (seconds % (day * 30) === 0) return `${seconds / (day * 30)}mo`;
  if (seconds % (day * 7) === 0) return `${seconds / (day * 7)}w`;
  if (seconds % day === 0) return `${seconds / day}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  return `${seconds}s`;
}

const HEADER: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "1.5rem",
};

const H1: React.CSSProperties = {
  fontSize: "1.55rem",
  fontWeight: 600,
  marginBottom: "0.35rem",
  color: "var(--shell-fg)",
};

const SUB: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.9rem",
  lineHeight: 1.5,
  maxWidth: 600,
};

const ERROR: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "0.85rem",
  marginBottom: "1rem",
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  padding: "1.1rem 1.2rem",
  marginBottom: "1.1rem",
  background: "var(--shell-card-bg)",
};

const CARD_HEAD: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "0.85rem",
  marginBottom: "0.85rem",
};

const CARD_HINT: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-muted)",
  marginTop: "0.25rem",
};

const CARD_SUB: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--shell-muted)",
  lineHeight: 1.5,
};

const H2: React.CSSProperties = {
  fontSize: "1.05rem",
  fontWeight: 600,
  color: "var(--shell-fg)",
};

const LINK: React.CSSProperties = {
  color: "var(--shell-link)",
  textDecoration: "underline",
};

const TABLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.84rem",
};

const TH: React.CSSProperties = {
  textAlign: "left",
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "var(--shell-faint)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0.4rem 0.5rem",
  borderBottom: "1px solid var(--shell-divider)",
};

const TD: React.CSSProperties = {
  padding: "0.45rem 0.5rem",
  borderBottom: "1px solid var(--shell-divider)",
  color: "var(--shell-fg)",
};

const MONO: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8rem",
};

const BADGE_OK: React.CSSProperties = {
  display: "inline-block",
  padding: "0.1rem 0.45rem",
  borderRadius: 999,
  fontSize: "0.7rem",
  fontWeight: 600,
  background: "rgba(16,185,129,0.12)",
  color: "#059669",
};

const BADGE_OFF: React.CSSProperties = {
  display: "inline-block",
  padding: "0.1rem 0.45rem",
  borderRadius: 999,
  fontSize: "0.7rem",
  fontWeight: 600,
  background: "rgba(148,163,184,0.16)",
  color: "#64748b",
};

const BTN: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};
