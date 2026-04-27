"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { LegalPageRow, LegalSlug } from "@/lib/legalPages";

const ADMIN_LIST = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const SLUGS: { slug: LegalSlug; title: string; publicHref: string }[] = [
  { slug: "privacy", title: "Privacy policy", publicHref: "/privacy" },
  { slug: "terms", title: "Terms of service", publicHref: "/terms" },
];

export function AdminLegalListView() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const isAdmin = useMemo(() => Boolean(wallet && ADMIN_LIST.has(wallet)), [wallet]);
  const [rows, setRows] = useState<LegalPageRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!wallet || !isAdmin) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/legal", {
        headers: { "x-nodosol-admin-wallet": wallet },
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { ok: true; rows: LegalPageRow[] }
        | { ok: false; error?: string };
      if (!res.ok || !json.ok) {
        setError("error" in json ? json.error ?? "Load failed" : "Load failed");
        return;
      }
      setRows(json.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [wallet, isAdmin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!wallet) {
    return (
      <Centered>
        <h1 style={H1}>Legal pages admin</h1>
        <p style={P}>Connect an admin-allowlisted wallet to manage /privacy and /terms.</p>
        <WalletMultiButton />
      </Centered>
    );
  }
  if (!isAdmin) {
    return (
      <Centered>
        <h1 style={H1}>Not authorized</h1>
        <p style={P}>
          {wallet.slice(0, 4)}…{wallet.slice(-4)} isn&apos;t on the admin allowlist.
        </p>
      </Centered>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={H1}>Legal pages</h1>
        <p style={P}>
          Edit <code>/privacy</code> and <code>/terms</code> directly in Markdown.
          Saving snapshots the previous version into history. Until you save the
          first time, public routes keep serving the original hardcoded views.
        </p>
      </header>

      {error ? (
        <div style={ERROR_BOX}>{error}</div>
      ) : null}

      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {SLUGS.map((s) => {
          const row = rows?.find((r) => r.slug === s.slug) ?? null;
          return (
            <li key={s.slug} style={CARD}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem" }}>
                  <span style={{ fontSize: "1rem", fontWeight: 600 }}>{row?.title ?? s.title}</span>
                  {row ? (
                    <span style={BADGE_OK}>v{row.version}</span>
                  ) : (
                    <span style={BADGE_FALLBACK}>fallback view</span>
                  )}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#7a8190" }}>
                  {row
                    ? `Last updated ${new Date(row.last_updated).toLocaleString()}`
                    : "No DB row yet — public route renders the hardcoded React view."}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <Link href={s.publicHref} target="_blank" style={SECONDARY}>
                  View public
                </Link>
                <Link href={`/admin/legal/${s.slug}`} style={PRIMARY}>
                  {row ? "Edit" : "Create"}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {busy ? <p style={{ color: "#7a8190", marginTop: "1rem" }}>Loading…</p> : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1rem",
        padding: "4rem 1rem",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

const H1: React.CSSProperties = { fontSize: "1.5rem", fontWeight: 600, margin: 0, color: "var(--shell-fg)" };
const P: React.CSSProperties = { color: "var(--shell-muted)", fontSize: "0.9rem", margin: "0.5rem 0" };

const CARD: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  padding: "1rem 1.1rem",
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  flexWrap: "wrap",
};

const PRIMARY: React.CSSProperties = {
  background: "#7b9cff",
  color: "#0a0a0a",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  textDecoration: "none",
};

const SECONDARY: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border-strong)",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
  textDecoration: "none",
};

const BADGE_OK: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#10b981",
  background: "rgba(16,185,129,0.12)",
  padding: "0.15rem 0.5rem",
  borderRadius: 999,
};

const BADGE_FALLBACK: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#9aa1ad",
  background: "rgba(154,161,173,0.12)",
  padding: "0.15rem 0.5rem",
  borderRadius: 999,
};

const ERROR_BOX: React.CSSProperties = {
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.3)",
  color: "#ef4444",
  padding: "0.75rem 1rem",
  borderRadius: 8,
  marginBottom: "1rem",
  fontSize: "0.85rem",
};
