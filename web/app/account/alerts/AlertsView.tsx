"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getCachedChatJwt, setCachedChatJwt } from "@/lib/chatSession";
import {
  PriceAlertRow,
  createPriceAlert,
  deletePriceAlert,
  fetchPriceAlerts,
  setPriceAlertActive,
} from "@/lib/priceAlerts";
import { requestChatJwt } from "@/lib/supabase";
import { useToast } from "@/components/ToastProvider";

const JWT_REFRESH_SLACK_S = 60;

const CATEGORIES = [
  { value: "", label: "Any category" },
  { value: "commodity", label: "Commodity" },
  { value: "real_estate", label: "Real estate" },
  { value: "debt", label: "Debt" },
  { value: "equity", label: "Equity" },
  { value: "ticket", label: "Ticket" },
  { value: "carbon", label: "Carbon" },
  { value: "other", label: "Other" },
];

export function AlertsView() {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const toast = useToast();

  const [rows, setRows] = useState<PriceAlertRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftQuery, setDraftQuery] = useState("");
  const [draftMaxPrice, setDraftMaxPrice] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [creating, setCreating] = useState(false);

  const ensureJwt = useCallback(async (): Promise<string> => {
    if (!wallet || !signMessage) {
      throw new Error("Connect a wallet that supports message signing.");
    }
    const now = Math.floor(Date.now() / 1000);
    const cached = getCachedChatJwt(wallet);
    if (cached && cached.expiresAt - now > JWT_REFRESH_SLACK_S) {
      return cached.jwt;
    }
    const timestamp = Date.now();
    const message = `nodosol-chat-auth:v1:${wallet}:${timestamp}`;
    const sigBytes = await signMessage(new TextEncoder().encode(message));
    const { jwt, expiresAt } = await requestChatJwt({
      wallet,
      message,
      signatureBase58: bs58.encode(sigBytes),
    });
    setCachedChatJwt(wallet, { jwt, expiresAt });
    return jwt;
  }, [wallet, signMessage]);

  const reload = useCallback(async () => {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      const jwt = await ensureJwt();
      const next = await fetchPriceAlerts(jwt);
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setBusy(false);
    }
  }, [wallet, ensureJwt]);

  useEffect(() => {
    if (wallet) void reload();
    else setRows(null);
  }, [wallet, reload]);

  async function create() {
    if (!wallet) return;
    const max = draftMaxPrice.trim();
    const maxNum = max === "" ? null : Number(max);
    if (maxNum != null && (!Number.isFinite(maxNum) || maxNum < 0)) {
      toast.error("Max price must be a non-negative number");
      return;
    }
    setCreating(true);
    try {
      const jwt = await ensureJwt();
      const r = await createPriceAlert(jwt, wallet, {
        query: draftQuery.trim() || null,
        max_price_usdc: maxNum,
        category: draftCategory || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setRows((prev) => (prev ? [r.row, ...prev] : [r.row]));
      setDraftQuery("");
      setDraftMaxPrice("");
      setDraftCategory("");
      toast.success("Alert saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!wallet) return;
    try {
      const jwt = await ensureJwt();
      const r = await deletePriceAlert(jwt, id);
      if (r.ok) {
        setRows((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
      }
    } catch (err) {
      console.warn("delete failed", err);
    }
  }

  async function toggle(row: PriceAlertRow) {
    if (!wallet) return;
    try {
      const jwt = await ensureJwt();
      const r = await setPriceAlertActive(jwt, row.id, !row.active);
      if (r.ok) {
        setRows((prev) =>
          prev ? prev.map((x) => (x.id === row.id ? { ...x, active: !row.active } : x)) : prev,
        );
      }
    } catch (err) {
      console.warn("toggle failed", err);
    }
  }

  if (!wallet) {
    return (
      <div style={CONNECT_PANEL}>
        <span style={EYEBROW}>Market intelligence</span>
        <h1 style={H1}>Price alerts</h1>
        <p style={SUB}>
          Connect a wallet to set up smart alerts for marketplace listings and
          follow the assets you care about.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div style={PAGE}>
      <header style={HEADER}>
        <div>
          <span style={EYEBROW}>Market intelligence</span>
          <h1 style={H1}>Price alerts</h1>
          <p style={SUB}>
            Get notified when a marketplace listing matches a saved
            predicate. Matching runs server-side via the helius-webhook
            decoder on new listings.
          </p>
        </div>
        <div style={HERO_ACTIONS}>
          <Link href="/marketplace" style={SECONDARY_LINK}>
            Browse market
          </Link>
        <button type="button" onClick={() => void reload()} disabled={busy} style={BTN}>
          {busy ? "Loading…" : "Refresh"}
        </button>
        </div>
      </header>

      <div style={STAT_GRID}>
        <MiniStat label="Alerts" value={rows ? rows.length.toLocaleString() : "—"} />
        <MiniStat
          label="Active"
          value={rows ? rows.filter((r) => r.active).length.toLocaleString() : "—"}
        />
        <MiniStat label="Wallet" value={shortPubkey(wallet)} />
      </div>

      {error ? <p style={ERROR}>{error}</p> : null}

      <section style={CARD}>
        <h2 style={H2}>New alert</h2>
        <div style={GRID}>
          <label style={LABEL}>
            <span style={LABEL_TEXT}>Query (optional)</span>
            <input
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="e.g. wheat futures, Belgrade studio"
              style={INPUT}
            />
          </label>
          <label style={LABEL}>
            <span style={LABEL_TEXT}>Max price (USDC)</span>
            <input
              value={draftMaxPrice}
              onChange={(e) => setDraftMaxPrice(e.target.value)}
              placeholder="e.g. 250"
              inputMode="decimal"
              style={INPUT}
            />
          </label>
          <label style={LABEL}>
            <span style={LABEL_TEXT}>Category (optional)</span>
            <select
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value)}
              style={INPUT}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.6rem" }}>
          <button type="button" onClick={() => void create()} disabled={creating} style={PRIMARY_BTN}>
            {creating ? "Saving…" : "Save alert"}
          </button>
        </div>
      </section>

      {!rows ? (
        <p style={SUB}>{busy ? "Loading…" : ""}</p>
      ) : rows.length === 0 ? (
        <div style={CARD}>
          <p style={CARD_SUB}>No alerts yet — set one above.</p>
        </div>
      ) : (
        <section style={CARD}>
          <header style={CARD_HEAD}>
            <h2 style={H2}>Active &amp; paused</h2>
            <span style={CARD_HINT}>{rows.length} total</span>
          </header>
          <table style={TABLE}>
            <thead>
              <tr>
                <th style={TH}>Predicate</th>
                <th style={TH}>State</th>
                <th style={TH}>Last match</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={TD}>
                    <PredicateCell row={r} />
                  </td>
                  <td style={TD}>
                    <button
                      type="button"
                      onClick={() => void toggle(r)}
                      style={r.active ? BADGE_ON : BADGE_OFF}
                    >
                      {r.active ? "active" : "paused"}
                    </button>
                  </td>
                  <td style={TD}>
                    {r.last_matched_at
                      ? new Date(r.last_matched_at).toLocaleString()
                      : "—"}
                  </td>
                  <td style={{ ...TD, textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => void remove(r.id)}
                      style={REMOVE_BTN}
                      aria-label="Delete alert"
                      title="Delete"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p style={NOTE}>
        Matching pipeline ships in a follow-up: the helius-webhook decoder
        will check active alerts on each <code>marketplace.list_asset</code>
        and a 15-min reconcile cron will sweep already-active listings so
        nothing slips through.
      </p>
    </div>
  );
}

function PredicateCell({ row }: { row: PriceAlertRow }) {
  const parts: string[] = [];
  if (row.query) parts.push(`“${row.query}”`);
  if (row.max_price_usdc != null) parts.push(`≤ $${row.max_price_usdc}`);
  if (row.category) parts.push(`in ${row.category}`);
  return <span>{parts.join(" · ") || "(no predicate?)"}</span>;
}

function shortPubkey(p: string): string {
  return p.length > 10 ? `${p.slice(0, 6)}…${p.slice(-6)}` : p;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={STAT_CARD}>
      <span style={STAT_LABEL}>{label}</span>
      <strong style={STAT_VALUE}>{value}</strong>
    </div>
  );
}

const PAGE: React.CSSProperties = {
  padding: "1.4rem 0 2.5rem",
};

const CONNECT_PANEL: React.CSSProperties = {
  margin: "1.5rem 0",
  maxWidth: 680,
  border: "1px solid var(--shell-border)",
  borderRadius: 18,
  padding: "1.45rem",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(241,245,249,0.9))",
  boxShadow: "0 20px 55px rgba(15, 23, 42, 0.08)",
};

const HEADER: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1.25rem",
  flexWrap: "wrap",
  marginBottom: "1rem",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 22,
  padding: "1.35rem",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(255,251,235,0.86))",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
};

const EYEBROW: React.CSSProperties = {
  display: "inline-flex",
  marginBottom: "0.55rem",
  color: "#b45309",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const H1: React.CSSProperties = {
  fontSize: "2.7rem",
  fontWeight: 800,
  marginBottom: "0.45rem",
  color: "var(--shell-fg)",
  lineHeight: 1.05,
};

const SUB: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.98rem",
  lineHeight: 1.6,
  maxWidth: 720,
};

const ERROR: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "0.85rem",
  marginBottom: "1rem",
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 16,
  padding: "1.15rem 1.2rem",
  marginBottom: "1.1rem",
  background: "var(--shell-card)",
  boxShadow: "0 16px 45px rgba(15, 23, 42, 0.06)",
  overflowX: "auto",
};

const CARD_HEAD: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "0.85rem",
  marginBottom: "0.75rem",
};

const CARD_HINT: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--shell-muted)",
  fontWeight: 700,
};

const CARD_SUB: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--shell-muted)",
};

const H2: React.CSSProperties = {
  fontSize: "1.02rem",
  fontWeight: 800,
  color: "var(--shell-fg)",
  marginBottom: "0.5rem",
};

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "0.75rem",
};

const LABEL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const LABEL_TEXT: React.CSSProperties = {
  fontSize: "0.76rem",
  color: "var(--shell-muted)",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const INPUT: React.CSSProperties = {
  padding: "0.72rem 0.8rem",
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  background: "#fff",
  color: "var(--shell-fg)",
  fontSize: "0.92rem",
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
  color: "var(--shell-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "0.65rem 0.55rem",
  borderBottom: "1px solid var(--shell-divider)",
};

const TD: React.CSSProperties = {
  padding: "0.72rem 0.55rem",
  borderBottom: "1px solid var(--shell-divider)",
  color: "var(--shell-fg)",
};

const BADGE_ON: React.CSSProperties = {
  background: "rgba(16,185,129,0.12)",
  color: "#059669",
  border: "none",
  padding: "0.18rem 0.5rem",
  borderRadius: 999,
  fontSize: "0.72rem",
  fontWeight: 600,
  cursor: "pointer",
};

const BADGE_OFF: React.CSSProperties = {
  background: "rgba(148,163,184,0.16)",
  color: "#64748b",
  border: "none",
  padding: "0.18rem 0.5rem",
  borderRadius: 999,
  fontSize: "0.72rem",
  fontWeight: 600,
  cursor: "pointer",
};

const PRIMARY_BTN: React.CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
  borderRadius: 999,
  padding: "0.68rem 1rem",
  fontSize: "0.85rem",
  fontWeight: 800,
  cursor: "pointer",
};

const BTN: React.CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
  borderRadius: 999,
  padding: "0.68rem 1rem",
  fontSize: "0.85rem",
  fontWeight: 800,
  cursor: "pointer",
};

const REMOVE_BTN: React.CSSProperties = {
  background: "#fff",
  border: "1px solid var(--shell-border)",
  color: "var(--shell-muted)",
  width: 30,
  height: 30,
  borderRadius: 999,
  fontSize: "0.95rem",
  lineHeight: 1,
  cursor: "pointer",
};

const NOTE: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-muted)",
  marginTop: "1rem",
  lineHeight: 1.5,
  maxWidth: 620,
};

const HERO_ACTIONS: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem",
  flexWrap: "wrap",
};

const SECONDARY_LINK: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 999,
  padding: "0.68rem 1rem",
  color: "var(--shell-fg)",
  background: "rgba(255,255,255,0.78)",
  textDecoration: "none",
  fontSize: "0.85rem",
  fontWeight: 800,
};

const STAT_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.85rem",
  marginBottom: "1.15rem",
};

const STAT_CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 16,
  padding: "0.95rem 1rem",
  background: "rgba(255,255,255,0.9)",
  boxShadow: "0 14px 36px rgba(15, 23, 42, 0.05)",
};

const STAT_LABEL: React.CSSProperties = {
  display: "block",
  color: "var(--shell-muted)",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: "0.35rem",
};

const STAT_VALUE: React.CSSProperties = {
  color: "var(--shell-fg)",
  fontSize: "1.2rem",
  lineHeight: 1.1,
  overflowWrap: "anywhere",
};
