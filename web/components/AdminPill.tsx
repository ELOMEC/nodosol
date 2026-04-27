"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Admin entry for the topbar. Visible only when the connected wallet
 * appears in `NEXT_PUBLIC_ADMIN_WALLETS` (comma-separated allowlist).
 *
 * Lives in the topbar alongside ThemeToggle / LocaleToggle so admins
 * always have a one-click jump regardless of which surface they're on.
 * Replaces the per-section Admin sidebar group that was here before.
 */

const ALLOW_ENV = process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "";
const ALLOW: ReadonlySet<string> = new Set(
  ALLOW_ENV.split(",").map((s) => s.trim()).filter(Boolean),
);

const ROUTES: Array<{ href: string; label: string; description?: string }> = [
  { href: "/admin", label: "Programs", description: "Volume, security events, panic button" },
  { href: "/admin/issuers", label: "Issuers", description: "RWA issuer registry — approve / suspend / revoke" },
  { href: "/admin/announcements", label: "Announcements", description: "Publish news / status / release notes" },
];

export function AdminPill() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = useMemo(() => Boolean(wallet && ALLOW.has(wallet)), [wallet]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  if (!isAdmin) return null;

  return (
    <div ref={wrapRef} style={WRAP}>
      <button
        type="button"
        aria-label="Admin menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          ...PILL,
          background: open ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.10)",
          borderColor: open ? "rgba(245,158,11,0.55)" : "rgba(245,158,11,0.32)",
        }}
        title="Admin"
      >
        <span aria-hidden="true" style={DOT} />
        Admin
      </button>
      {open ? (
        <div role="menu" style={DROPDOWN}>
          {ROUTES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              style={DROPDOWN_ITEM}
            >
              <div style={DROPDOWN_ITEM_LABEL}>{r.label}</div>
              {r.description ? (
                <div style={DROPDOWN_ITEM_DESC}>{r.description}</div>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const WRAP: React.CSSProperties = {
  position: "relative",
  display: "inline-block",
};

const PILL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.35rem 0.7rem",
  borderRadius: 999,
  border: "1px solid",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  cursor: "pointer",
  color: "#f5c97a",
  fontFamily: "inherit",
};

const DOT: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "#f59e0b",
  display: "inline-block",
};

const DROPDOWN: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 0.45rem)",
  right: 0,
  minWidth: 240,
  background: "var(--shell-card, #11141a)",
  border: "1px solid var(--shell-border, #1f242d)",
  borderRadius: 12,
  boxShadow: "0 12px 32px rgba(0,0,0,0.32)",
  padding: "0.4rem",
  zIndex: 60,
};

const DROPDOWN_ITEM: React.CSSProperties = {
  display: "block",
  padding: "0.55rem 0.7rem",
  borderRadius: 8,
  textDecoration: "none",
  color: "var(--shell-fg, #eef0f3)",
  fontSize: "0.85rem",
};

const DROPDOWN_ITEM_LABEL: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: "0.15rem",
};

const DROPDOWN_ITEM_DESC: React.CSSProperties = {
  fontSize: "0.74rem",
  color: "var(--shell-muted, #9a9a9a)",
  lineHeight: 1.4,
};
