"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";

import auctionsIdl from "@/idl/auctions.json";
import eventTicketsIdl from "@/idl/event_tickets.json";
import eventsIdl from "@/idl/events.json";
import marketplaceIdl from "@/idl/marketplace.json";
import otcIdl from "@/idl/otc_deals.json";
import rwaMintIdl from "@/idl/rwa_mint.json";
import rwaRegistryIdl from "@/idl/rwa_registry.json";
import subscriptionIdl from "@/idl/subscription.json";
import tipJarIdl from "@/idl/tip_jar.json";

type ProgramId = { label: string; id: string };

const PROGRAMS: ProgramId[] = [
  { label: "tip_jar", id: (tipJarIdl as { address: string }).address },
  { label: "subscription", id: (subscriptionIdl as { address: string }).address },
  { label: "events", id: (eventsIdl as { address: string }).address },
  { label: "event_tickets", id: (eventTicketsIdl as { address: string }).address },
  { label: "marketplace", id: (marketplaceIdl as { address: string }).address },
  { label: "otc_deals", id: (otcIdl as { address: string }).address },
  { label: "rwa_registry", id: (rwaRegistryIdl as { address: string }).address },
  { label: "rwa_mint", id: (rwaMintIdl as { address: string }).address },
  { label: "auctions", id: (auctionsIdl as { address: string }).address },
];

const DAY = 86_400;

type ProgramVolume = {
  label: string;
  programId: string;
  fetched: number;
  failed: boolean;
  last24h: number;
  prev24h: number;
  last7d: number;
  last30d: number;
  oldestSec: number | null;
};

type WidgetState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; rows: ProgramVolume[]; refreshedAt: number }
  | { kind: "error"; message: string };

function bucketize(sigs: ConfirmedSignatureInfo[], nowSec: number): Omit<ProgramVolume, "label" | "programId" | "failed"> {
  let last24h = 0;
  let prev24h = 0;
  let last7d = 0;
  let last30d = 0;
  let oldest: number | null = null;
  for (const s of sigs) {
    const t = s.blockTime ?? null;
    if (t === null) continue;
    if (oldest === null || t < oldest) oldest = t;
    const age = nowSec - t;
    if (age < DAY) last24h += 1;
    else if (age < 2 * DAY) prev24h += 1;
    if (age < 7 * DAY) last7d += 1;
    if (age < 30 * DAY) last30d += 1;
  }
  return { fetched: sigs.length, last24h, prev24h, last7d, last30d, oldestSec: oldest };
}

export function AdminVolumeWidget() {
  const { connection } = useConnection();
  const [state, setState] = useState<WidgetState>({ kind: "idle" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    const nowSec = Math.floor(Date.now() / 1000);
    try {
      const rows = await Promise.all(
        PROGRAMS.map(async ({ label, id }): Promise<ProgramVolume> => {
          try {
            const sigs = await connection.getSignaturesForAddress(new PublicKey(id), { limit: 100 });
            const buckets = bucketize(sigs, nowSec);
            return { label, programId: id, failed: false, ...buckets };
          } catch (err) {
            console.warn(`volume widget: ${label} fetch failed`, err);
            return {
              label,
              programId: id,
              fetched: 0,
              failed: true,
              last24h: 0,
              prev24h: 0,
              last7d: 0,
              last30d: 0,
              oldestSec: null,
            };
          }
        })
      );
      setState({ kind: "ready", rows, refreshedAt: nowSec });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Volume fetch failed",
      });
    }
  }, [connection]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totals = useMemo(() => {
    if (state.kind !== "ready") return null;
    const sum = (k: keyof Pick<ProgramVolume, "last24h" | "prev24h" | "last7d" | "last30d">) =>
      state.rows.reduce((acc, r) => acc + r[k], 0);
    return {
      last24h: sum("last24h"),
      prev24h: sum("prev24h"),
      last7d: sum("last7d"),
      last30d: sum("last30d"),
    };
  }, [state]);

  return (
    <section
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        padding: "1.1rem 1.3rem",
        marginBottom: "1.5rem",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "0.85rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.2rem" }}>
            Program volume
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--shell-muted)" }}>
            Last 100 signatures per program from the RPC. 24h delta vs prior 24h shown next to today&apos;s count.
          </p>
        </div>
        <button
          onClick={() => void reload()}
          disabled={state.kind === "loading"}
          style={btnSecondary}
        >
          {state.kind === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {state.kind === "ready" && totals ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.6rem",
            marginBottom: "1rem",
          }}
        >
          <Tile label="All programs · 24h" value={totals.last24h} delta={totals.last24h - totals.prev24h} />
          <Tile label="All programs · 7d" value={totals.last7d} />
          <Tile label="All programs · 30d" value={totals.last30d} />
          <Tile label="Refreshed" value={timeAgo(state.refreshedAt)} mono />
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div style={{ fontSize: "0.85rem", color: "#b91c1c" }}>Failed: {state.message}</div>
      ) : null}

      {state.kind === "loading" || state.kind === "idle" ? (
        <div style={{ fontSize: "0.85rem", color: "var(--shell-muted)" }}>Loading volume…</div>
      ) : null}

      {state.kind === "ready" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.6rem",
          }}
        >
          {state.rows.map((row) => (
            <ProgramTile key={row.programId} row={row} nowSec={state.refreshedAt} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProgramTile({ row, nowSec }: { row: ProgramVolume; nowSec: number }) {
  const delta = row.last24h - row.prev24h;
  const windowDays =
    row.oldestSec !== null ? Math.max(1, Math.round((nowSec - row.oldestSec) / DAY)) : null;
  return (
    <div
      style={{
        background: "var(--shell-pill-bg)",
        border: "1px solid var(--shell-border)",
        borderRadius: 10,
        padding: "0.75rem 0.85rem",
        opacity: row.failed ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
        <code
          style={{
            fontFamily: "'SF Mono', Menlo, monospace",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "var(--shell-fg)",
          }}
        >
          {row.label}
        </code>
        <DeltaBadge delta={delta} disabled={row.failed} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginTop: "0.35rem" }}>
        <div style={{ fontSize: "1.45rem", fontWeight: 600 }}>{row.last24h}</div>
        <div style={{ fontSize: "0.72rem", color: "var(--shell-muted)" }}>tx · 24h</div>
      </div>
      <div
        style={{
          display: "flex",
          gap: "0.85rem",
          marginTop: "0.45rem",
          fontSize: "0.74rem",
          color: "var(--shell-muted)",
        }}
      >
        <span>
          7d <strong style={{ color: "var(--shell-fg)" }}>{row.last7d}</strong>
        </span>
        <span>
          30d <strong style={{ color: "var(--shell-fg)" }}>{row.last30d}</strong>
        </span>
        <span>
          fetched <strong style={{ color: "var(--shell-fg)" }}>{row.fetched}</strong>
        </span>
      </div>
      {row.failed ? (
        <div style={{ fontSize: "0.7rem", color: "#b45309", marginTop: "0.4rem" }}>RPC fetch failed</div>
      ) : windowDays !== null && row.fetched >= 100 ? (
        <div style={{ fontSize: "0.68rem", color: "var(--shell-faint)", marginTop: "0.4rem" }}>
          window ≈ {windowDays}d (RPC limit hit — older counts truncated)
        </div>
      ) : null}
    </div>
  );
}

function DeltaBadge({ delta, disabled }: { delta: number; disabled: boolean }) {
  if (disabled) {
    return <span style={{ fontSize: "0.7rem", color: "var(--shell-faint)" }}>—</span>;
  }
  if (delta === 0) {
    return (
      <span
        style={{
          fontSize: "0.68rem",
          color: "var(--shell-muted)",
          background: "var(--shell-card)",
          border: "1px solid var(--shell-border)",
          padding: "0.1rem 0.4rem",
          borderRadius: 4,
          fontWeight: 600,
        }}
      >
        flat
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      style={{
        fontSize: "0.68rem",
        color: positive ? "#059669" : "#b91c1c",
        background: positive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
        padding: "0.1rem 0.4rem",
        borderRadius: 4,
        fontWeight: 600,
      }}
    >
      {positive ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

function Tile({
  label,
  value,
  delta,
  mono,
}: {
  label: string;
  value: number | string;
  delta?: number;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--shell-pill-bg)",
        border: "1px solid var(--shell-border)",
        borderRadius: 8,
        padding: "0.6rem 0.75rem",
      }}
    >
      <div
        style={{
          fontSize: "0.66rem",
          color: "var(--shell-muted)",
          marginBottom: "0.2rem",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            fontSize: mono ? "0.85rem" : "1.25rem",
            fontWeight: 600,
            color: "var(--shell-fg)",
            fontFamily: mono ? "'SF Mono', Menlo, monospace" : "inherit",
          }}
        >
          {value}
        </div>
        {typeof delta === "number" ? <DeltaBadge delta={delta} disabled={false} /> : null}
      </div>
    </div>
  );
}

function timeAgo(unixSec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const btnSecondary: React.CSSProperties = {
  background: "var(--shell-card)",
  color: "var(--shell-fg)",
  border: "1px solid var(--shell-border-strong)",
  padding: "0.4rem 0.85rem",
  borderRadius: 8,
  fontSize: "0.78rem",
  fontWeight: 600,
  cursor: "pointer",
};
