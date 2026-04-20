import Link from "next/link";
import type { ReactNode } from "react";

import { WalletPill } from "./WalletPill";

type NavItem = { href: string; label: string; icon: ReactNode; active?: boolean };

export function MarketplaceShell({
  active,
  children,
}: {
  active: "marketplace" | "tokenize" | "assets" | "portfolio";
  children: ReactNode;
}) {
  const nav: NavItem[] = [
    { href: "/marketplace", label: "Marketplace", icon: IconGrid(), active: active === "marketplace" },
    { href: "/marketplace/tokenize", label: "Tokenize", icon: IconPlus(), active: active === "tokenize" },
    { href: "/marketplace/assets", label: "My assets", icon: IconWallet(), active: active === "assets" },
    { href: "/marketplace/portfolio", label: "Portfolio", icon: IconChart(), active: active === "portfolio" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        background: "#f7f8fa",
        color: "#111827",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid #eef0f3",
          background: "#ffffff",
          padding: "1.75rem 1rem",
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            padding: "0 0.5rem",
            marginBottom: "2rem",
            color: "#111827",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: "0.95rem",
            }}
          >
            n
          </span>
          <span style={{ fontSize: "1.05rem", fontWeight: 600, letterSpacing: "-0.015em" }}>nodosol</span>
        </Link>

        <SectionLabel>RWA</SectionLabel>
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem", marginBottom: "1.5rem" }}>
          {nav.map((item) => (
            <Link key={item.href} href={item.href} style={navLinkStyle(item.active)}>
              <span style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center" }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <SectionLabel>Creator tools</SectionLabel>
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
          <Link href="/" style={navLinkStyle(false)}>
            <span style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center" }}>{IconZap()}</span>
            Blinks
          </Link>
        </nav>

        <div
          style={{
            marginTop: "auto",
            padding: "0.85rem",
            background: "#f7f8fa",
            border: "1px solid #eef0f3",
            borderRadius: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 0 3px rgba(16,185,129,0.18)",
              }}
            />
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#111827" }}>Devnet</span>
          </div>
          <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>
            Connected to Solana devnet cluster
          </div>
        </div>
      </aside>

      <div>
        <Topbar />
        <main style={{ padding: "1.75rem 2.25rem", maxWidth: 1320 }}>{children}</main>
      </div>
    </div>
  );
}

function Topbar() {
  return (
    <header
      style={{
        height: 64,
        borderBottom: "1px solid #eef0f3",
        background: "#ffffff",
        padding: "0 2.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.85rem",
          background: "#f7f8fa",
          borderRadius: 8,
          width: 360,
          color: "#6b7280",
          fontSize: "0.88rem",
        }}
      >
        <span style={{ display: "inline-flex" }}>{IconSearch()}</span>
        <input
          placeholder="Search assets, issuers…"
          style={{
            border: "none",
            background: "transparent",
            outline: "none",
            width: "100%",
            color: "#111827",
            fontSize: "0.88rem",
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "#f7f8fa",
            border: "1px solid #eef0f3",
            color: "#4b5563",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {IconBell()}
        </button>
        <WalletPill />
      </div>
    </header>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.68rem",
        color: "#9ca3af",
        textTransform: "uppercase",
        letterSpacing: 1.2,
        margin: "0 0.5rem 0.5rem",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function navLinkStyle(active?: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    padding: "0.6rem 0.75rem",
    borderRadius: 8,
    color: active ? "#4338ca" : "#4b5563",
    background: active ? "#eef2ff" : "transparent",
    textDecoration: "none",
    fontSize: "0.9rem",
    fontWeight: active ? 600 : 500,
  };
}

// --- SVG icons (inline for zero-dep) ---

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 012-2h13a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path d="M16 12h4" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-5" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}
