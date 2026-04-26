"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { useCallback, useState } from "react";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase";

type SecurityEventRow = {
  id: number;
  created_at: string;
  event_type: string;
  severity: "info" | "warn" | "error";
  wallet: string | null;
  client_ip: string | null;
  details: Record<string, unknown> | null;
};

type AdminEventsResponse = {
  ok: true;
  recent: SecurityEventRow[];
  counts: Record<string, number>;
  windowStart: string;
  countWindowHours: number;
  generatedAt: string;
};

type WidgetState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "loading" }
  | { kind: "ready"; data: AdminEventsResponse }
  | { kind: "error"; message: string };

export function AdminSecurityEventsWidget() {
  const { publicKey, signMessage } = useWallet();
  const [state, setState] = useState<WidgetState>({ kind: "idle" });

  const load = useCallback(async () => {
    if (!publicKey) {
      setState({ kind: "error", message: "Wallet not connected" });
      return;
    }
    if (!signMessage) {
      setState({
        kind: "error",
        message: "Connected wallet does not support signMessage",
      });
      return;
    }
    setState({ kind: "signing" });
    try {
      const wallet = publicKey.toBase58();
      const ts = Date.now();
      const message = `nodosol-admin:v1:${wallet}:${ts}`;
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const signatureBase58 = bs58.encode(sigBytes);

      setState({ kind: "loading" });
      const resp = await fetch(`${getSupabaseUrl()}/functions/v1/admin-events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: getSupabaseAnonKey(),
          authorization: `Bearer ${getSupabaseAnonKey()}`,
        },
        body: JSON.stringify({ wallet, message, signature: signatureBase58 }),
      });
      const body = (await resp.json().catch(() => ({}))) as
        | AdminEventsResponse
        | { error?: string };
      if (!resp.ok || !("ok" in body)) {
        const errMsg = (body as { error?: string }).error ?? `HTTP ${resp.status}`;
        setState({ kind: "error", message: errMsg });
        return;
      }
      setState({ kind: "ready", data: body });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fetch failed";
      setState({ kind: "error", message: msg });
    }
  }, [publicKey, signMessage]);

  const sortedCounts =
    state.kind === "ready"
      ? Object.entries(state.data.counts).sort((a, b) => b[1] - a[1])
      : [];

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
            Security events
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--shell-muted)" }}>
            Fresh-signature read of <code style={codeInline}>security_events</code>. Top {RECENT_LABEL} most recent rows plus per-type counts over the last 24h.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={state.kind === "signing" || state.kind === "loading"}
          style={btnSecondary}
        >
          {state.kind === "signing"
            ? "Sign in wallet…"
            : state.kind === "loading"
              ? "Loading…"
              : state.kind === "ready"
                ? "Re-sign & refresh"
                : "Sign & load"}
        </button>
      </header>

      {state.kind === "idle" ? (
        <div style={{ fontSize: "0.85rem", color: "var(--shell-muted)" }}>
          Click <strong>Sign &amp; load</strong> to authenticate with your wallet and pull the latest events.
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div style={{ fontSize: "0.85rem", color: "#b91c1c" }}>Failed: {state.message}</div>
      ) : null}

      {state.kind === "ready" ? (
        <>
          {sortedCounts.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "0.6rem",
                marginBottom: "1rem",
              }}
            >
              {sortedCounts.map(([type, count]) => (
                <CountTile key={type} label={type} value={count} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "0.82rem", color: "var(--shell-muted)", marginBottom: "0.9rem" }}>
              No events in the last {state.data.countWindowHours}h.
            </div>
          )}

          {state.data.recent.length === 0 ? (
            <div style={{ fontSize: "0.82rem", color: "var(--shell-muted)" }}>
              No recent rows.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {state.data.recent.map((row) => (
                <EventRow key={row.id} row={row} />
              ))}
            </div>
          )}

          <div style={{ marginTop: "0.85rem", fontSize: "0.7rem", color: "var(--shell-faint)" }}>
            Generated {new Date(state.data.generatedAt).toLocaleString()}
          </div>
        </>
      ) : null}
    </section>
  );
}

const RECENT_LABEL = "20";

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "var(--shell-pill-bg)",
        border: "1px solid var(--shell-border)",
        borderRadius: 8,
        padding: "0.55rem 0.7rem",
      }}
    >
      <div
        style={{
          fontSize: "0.66rem",
          color: "var(--shell-muted)",
          marginBottom: "0.18rem",
          fontFamily: "'SF Mono', Menlo, monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--shell-fg)" }}>
        {value}
      </div>
    </div>
  );
}

function EventRow({ row }: { row: SecurityEventRow }) {
  const sevColor =
    row.severity === "error"
      ? "#b91c1c"
      : row.severity === "warn"
        ? "#b45309"
        : "var(--shell-muted)";
  const sevBg =
    row.severity === "error"
      ? "rgba(239,68,68,0.10)"
      : row.severity === "warn"
        ? "rgba(245,158,11,0.10)"
        : "var(--shell-pill-bg)";
  const detailsStr =
    row.details && Object.keys(row.details).length > 0
      ? JSON.stringify(row.details)
      : null;
  return (
    <div
      style={{
        background: "var(--shell-pill-bg)",
        border: "1px solid var(--shell-border)",
        borderRadius: 8,
        padding: "0.55rem 0.75rem",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: "0.6rem",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: "0.65rem",
          fontWeight: 700,
          color: sevColor,
          background: sevBg,
          border: "1px solid var(--shell-border)",
          padding: "0.12rem 0.42rem",
          borderRadius: 4,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {row.severity}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'SF Mono', Menlo, monospace",
            fontSize: "0.82rem",
            fontWeight: 600,
            color: "var(--shell-fg)",
          }}
        >
          {row.event_type}
        </div>
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--shell-muted)",
            marginTop: "0.15rem",
            display: "flex",
            gap: "0.6rem",
            flexWrap: "wrap",
          }}
        >
          {row.wallet ? <span title={row.wallet}>wallet {shorten(row.wallet)}</span> : null}
          {row.client_ip ? <span>ip {row.client_ip}</span> : null}
          {detailsStr ? (
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 360,
              }}
              title={detailsStr}
            >
              {detailsStr}
            </span>
          ) : null}
        </div>
      </div>
      <span style={{ fontSize: "0.7rem", color: "var(--shell-faint)", whiteSpace: "nowrap" }}>
        {timeAgo(row.created_at)}
      </span>
    </div>
  );
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function timeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
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

const codeInline: React.CSSProperties = {
  fontFamily: "'SF Mono', Menlo, monospace",
  fontSize: "0.78rem",
  background: "var(--shell-pill-bg)",
  padding: "0.05rem 0.35rem",
  borderRadius: 4,
};
