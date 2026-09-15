"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import {
  fetchRentalMetadataBatch,
  RentalMetadata,
} from "@/lib/rentalMetadata";
import { subscriptionProgram } from "@/lib/subscription";

type SubscriptionStatusKey = "active" | "cancelled" | "expired";

function decodeStatus(raw: Record<string, unknown>): SubscriptionStatusKey {
  if ("active" in raw) return "active";
  if ("cancelled" in raw) return "cancelled";
  return "expired";
}

type MyRental = {
  subscriptionAddress: string;
  planAddress: string;
  landlord: string;
  status: SubscriptionStatusKey;
  startedAt: number;
  lastChargedAt: number;
  nextChargeAt: number;
  chargeCount: number;
  totalPaidBase: bigint;
  priceUsdc: number;
  periodSeconds: number;
  metadata: RentalMetadata | null;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; rentals: MyRental[] }
  | { kind: "error"; message: string };

export function MyRentalsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<State>({ kind: "idle" });
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = subscriptionProgram(provider);

      // Fetch every Subscription account where subscriber = me.
      const subApi = (program.account as Record<string, {
        all: (filters: unknown[]) => Promise<Array<{
          publicKey: PublicKey;
          account: {
            plan: PublicKey;
            startedAt: BN;
            lastChargedAt: BN;
            nextChargeAt: BN;
            chargeCount: BN;
            totalPaid: BN;
            status: Record<string, unknown>;
          };
        }>>;
      }>).subscription;
      const subs = await subApi.all([
        // plan (32) sits right after discriminator (8); subscriber is the next 32.
        { memcmp: { offset: 8 + 32, bytes: publicKey.toBase58() } },
      ]);

      if (subs.length === 0) {
        setState({ kind: "ready", rentals: [] });
        return;
      }

      // Load each underlying plan in parallel.
      const planApi = (program.account as Record<string, {
        fetch: (addr: PublicKey) => Promise<{
          creator: PublicKey;
          pricePerPeriod: BN;
          periodSeconds: BN;
        }>;
      }>).subscriptionPlan;
      const planDocs = await Promise.all(
        subs.map((s) => planApi.fetch(s.account.plan))
      );

      const planAddrs = subs.map((s) => s.account.plan.toBase58());
      const metaMap = await fetchRentalMetadataBatch(planAddrs);

      const rentals: MyRental[] = subs
        .map((s, i) => {
          const plan = planDocs[i];
          const planAddress = s.account.plan.toBase58();
          const meta = metaMap.get(planAddress) ?? null;
          return {
            subscriptionAddress: s.publicKey.toBase58(),
            planAddress,
            landlord: plan.creator.toBase58(),
            status: decodeStatus(s.account.status),
            startedAt: s.account.startedAt.toNumber(),
            lastChargedAt: s.account.lastChargedAt.toNumber(),
            nextChargeAt: s.account.nextChargeAt.toNumber(),
            chargeCount: s.account.chargeCount.toNumber(),
            totalPaidBase: BigInt(s.account.totalPaid.toString()),
            priceUsdc: Number(plan.pricePerPeriod.toString()) / USDC_UNIT,
            periodSeconds: plan.periodSeconds.toNumber(),
            metadata: meta,
          };
        })
        // Only rentals (plans with rental metadata). Filters out generic
        // creator subscriptions so the page stays focused.
        .filter((r) => r.metadata !== null)
        .sort((a, b) => b.startedAt - a.startedAt);

      setState({ kind: "ready", rentals });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [connection, wallet, publicKey]);

  useEffect(() => {
    if (connected && publicKey) void load();
    else setState({ kind: "idle" });
  }, [connected, publicKey, load]);

  const summary = useMemo(() => {
    if (state.kind !== "ready") return null;
    const active = state.rentals.filter((r) => r.status === "active").length;
    const monthlyTotal = state.rentals
      .filter((r) => r.status === "active")
      .reduce((s, r) => s + r.priceUsdc, 0);
    const lifetimeTotal = state.rentals.reduce(
      (s, r) => s + Number(r.totalPaidBase) / USDC_UNIT,
      0
    );
    return { active, monthlyTotal, lifetimeTotal };
  }, [state]);

  return (
    <>
      <header style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.55rem", letterSpacing: 0, fontWeight: 600, marginBottom: "0.3rem" }}>
            My rentals
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.88rem" }}>
            All rental subscriptions tied to this wallet — next charge countdown,
            cumulative rent paid, and a link to each plan.
          </p>
        </div>
        <Link
          href="/marketplace/rentals"
          style={{
            padding: "0.55rem 1.1rem",
            borderRadius: 8,
            border: "1px solid var(--shell-border, #eef0f3)",
            background: "var(--shell-pill-bg, #f7f8fa)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.85rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Browse rentals →
        </Link>
      </header>

      {!connected ? (
        <Centered>
          <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
          <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
            Connect to see your rentals.
          </div>
          <WalletMultiButton />
        </Centered>
      ) : state.kind === "loading" ? (
        <Centered>Loading your rentals…</Centered>
      ) : state.kind === "error" ? (
        <Centered>{state.message}</Centered>
      ) : state.kind === "ready" ? (
        state.rentals.length === 0 ? (
          <Centered>
            <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>No rentals yet</div>
            <div style={{ fontSize: "0.82rem", color: "#6b7280" }}>
              Browse and subscribe on{" "}
              <Link href="/marketplace/rentals" style={{ color: "#4f46e5", fontWeight: 600 }}>
                the rentals page
              </Link>
              .
            </div>
          </Centered>
        ) : (
          <>
            {summary && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <StatCard label="Active rentals" value={summary.active.toString()} />
                <StatCard label="Monthly total" value={`$${summary.monthlyTotal.toFixed(2)}`} />
                <StatCard label="Paid lifetime" value={`$${summary.lifetimeTotal.toFixed(2)}`} />
              </div>
            )}
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {state.rentals.map((r: MyRental) => (
                <RentalRow key={r.subscriptionAddress} rental={r} now={now} />
              ))}
            </div>
          </>
        )
      ) : null}
    </>
  );
}

function RentalRow({ rental, now }: { rental: MyRental; now: number }) {
  const periodDays = Math.round(rental.periodSeconds / 86400);
  const untilCharge = rental.nextChargeAt - now;
  const hero = rental.metadata?.gallery?.[0];
  return (
    <Link
      href={`/marketplace/rentals/${rental.planAddress}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          background: "var(--shell-card, #fff)",
          border: "1px solid var(--shell-border, #eef0f3)",
          borderRadius: 12,
          padding: "0.9rem 1.05rem",
          display: "grid",
          gridTemplateColumns: "100px 1fr auto",
          gap: "0.9rem",
          alignItems: "center",
        }}
      >
        <div
          style={{
            aspectRatio: "4/3",
            borderRadius: 8,
            background: hero
              ? `center / cover no-repeat url(${hero})`
              : "linear-gradient(135deg, #4f46e5, #0ea5e9)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            {rental.metadata?.title ?? `Plan ${rental.planAddress.slice(0, 8)}…`}
          </div>
          {rental.metadata?.location?.address && (
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              📍 {rental.metadata.location.address}
            </div>
          )}
          <div style={{ fontSize: "0.78rem", color: "#6b7280", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <StatusPill status={rental.status} />
            <span>${rental.priceUsdc.toFixed(2)} / {periodDays}d</span>
            <span>{rental.chargeCount} charge{rental.chargeCount === 1 ? "" : "s"}</span>
            <span>Paid ${(Number(rental.totalPaidBase) / USDC_UNIT).toFixed(2)} total</span>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: "0.78rem", color: "#6b7280" }}>
          {rental.status === "active" ? (
            <>
              <div style={{ fontWeight: 600, color: untilCharge > 0 ? "#3730a3" : "#b91c1c" }}>
                {untilCharge > 0 ? `Next in ${formatDur(untilCharge)}` : "Charge due"}
              </div>
              <div style={{ fontSize: "0.7rem", marginTop: "0.15rem" }}>
                {new Date(rental.nextChargeAt * 1000).toLocaleDateString()}
              </div>
            </>
          ) : (
            <div style={{ fontWeight: 600 }}>{rental.status}</div>
          )}
        </div>
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: SubscriptionStatusKey }) {
  const palette: Record<SubscriptionStatusKey, { bg: string; fg: string }> = {
    active: { bg: "#dcfce7", fg: "#166534" },
    cancelled: { bg: "#fef3c7", fg: "#92400e" },
    expired: { bg: "#f3f4f6", fg: "#4b5563" },
  };
  const c = palette[status];
  return (
    <span
      style={{
        fontSize: "0.66rem",
        padding: "0.1rem 0.45rem",
        borderRadius: 4,
        background: c.bg,
        color: c.fg,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "0.95rem 1.05rem",
      }}
    >
      <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.35rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.3rem", fontWeight: 700, letterSpacing: 0 }}>{value}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#6b7280", background: "var(--shell-card, #fff)", border: "1px solid var(--shell-border, #eef0f3)", borderRadius: 12 }}>
      {children}
    </div>
  );
}

function formatDur(secs: number): string {
  if (secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
