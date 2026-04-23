import Link from "next/link";
import type { ReactNode } from "react";

import { ChatBell } from "./ChatBell";
import { NotificationsBell } from "./NotificationsBell";
import { PrivyLoginButton } from "./PrivyLoginButton";
import { ThemeToggle } from "./ThemeToggle";
import { WalletPill } from "./WalletPill";

type NavItem = { href: string; label: string; icon: ReactNode; active?: boolean };

export function MarketplaceShell({
  active,
  children,
}: {
  active:
    | "marketplace"
    | "tokenize"
    | "otc"
    | "auctions"
    | "rentals"
    | "properties"
    | "events"
    | "tickets"
    | "resale"
    | "assets"
    | "portfolio"
    | "creator"
    | "creator-tips"
    | "creator-plans"
    | "creator-events"
    | "creator-venues"
    | "admin"
    | "admin-issuers"
    | "chat";
  children: ReactNode;
}) {
  const nav: NavItem[] = [
    { href: "/marketplace", label: "Marketplace", icon: IconGrid(), active: active === "marketplace" },
    { href: "/marketplace/tokenize", label: "Tokenize", icon: IconPlus(), active: active === "tokenize" },
    { href: "/marketplace/otc", label: "OTC deals", icon: IconHandshake(), active: active === "otc" },
    { href: "/marketplace/auctions", label: "Auctions", icon: IconChart(), active: active === "auctions" },
    { href: "/marketplace/rentals", label: "Rentals", icon: IconRepeat(), active: active === "rentals" },
    { href: "/marketplace/properties", label: "Properties", icon: IconGrid(), active: active === "properties" },
    { href: "/marketplace/events", label: "Events", icon: IconTicket(), active: active === "events" },
    { href: "/marketplace/tickets", label: "My tickets", icon: IconTicket(), active: active === "tickets" },
    { href: "/marketplace/resale", label: "Resale board", icon: IconHandshake(), active: active === "resale" },
    { href: "/marketplace/assets", label: "My assets", icon: IconWallet(), active: active === "assets" },
    { href: "/marketplace/portfolio", label: "Portfolio", icon: IconChart(), active: active === "portfolio" },
  ];
  const creatorNav: NavItem[] = [
    { href: "/creator", label: "Overview", icon: IconChart(), active: active === "creator" },
    { href: "/creator/tips", label: "Tip jar", icon: IconCoins(), active: active === "creator-tips" },
    { href: "/creator/plans", label: "Subscriptions", icon: IconRepeat(), active: active === "creator-plans" },
    { href: "/creator/events", label: "Events", icon: IconTicket(), active: active === "creator-events" },
    { href: "/creator/venues", label: "Venue layouts", icon: IconGrid(), active: active === "creator-venues" },
  ];
  const adminNav: NavItem[] = [
    { href: "/admin", label: "Programs", icon: IconShield(), active: active === "admin" },
    { href: "/admin/issuers", label: "Issuers", icon: IconUsers(), active: active === "admin-issuers" },
  ];

  return (
    <div
      className="nds-shell-layout"
      style={{
        background: "var(--shell-bg)",
        color: "var(--shell-fg)",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <aside
        className="nds-shell-sidebar"
        style={{
          borderRight: "1px solid var(--shell-border)",
          background: "var(--shell-card)",
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
            color: "var(--shell-fg)",
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

        <SectionLabel>Creator</SectionLabel>
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem", marginBottom: "1.5rem" }}>
          {creatorNav.map((item) => (
            <Link key={item.href} href={item.href} style={navLinkStyle(item.active)}>
              <span style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center" }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <SectionLabel>Admin</SectionLabel>
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem", marginBottom: "1.5rem" }}>
          {adminNav.map((item) => (
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
            background: "var(--shell-pill-bg)",
            border: "1px solid var(--shell-border)",
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
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--shell-fg)" }}>Devnet</span>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--shell-muted)" }}>
            Connected to Solana devnet cluster
          </div>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <Topbar
          nav={nav}
          creatorNav={creatorNav}
          adminNav={adminNav}
        />
        <main className="nds-shell-main">{children}</main>
      </div>
    </div>
  );
}

function Topbar({
  nav,
  creatorNav,
  adminNav,
}: {
  nav: NavItem[];
  creatorNav: NavItem[];
  adminNav: NavItem[];
}) {
  return (
    <header className="nds-topbar">
      <details className="nds-mobile-menu">
        <summary aria-label="Menu" style={mobileMenuButtonStyle}>
          {IconMenu()}
        </summary>
        <div style={mobileMenuPanelStyle}>
          <SectionLabel>RWA</SectionLabel>
          <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem", marginBottom: "1rem" }}>
            {nav.map((item) => (
              <Link key={item.href} href={item.href} style={navLinkStyle(item.active)}>
                <span style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center" }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <SectionLabel>Creator</SectionLabel>
          <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem", marginBottom: "1rem" }}>
            {creatorNav.map((item) => (
              <Link key={item.href} href={item.href} style={navLinkStyle(item.active)}>
                <span style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center" }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <SectionLabel>Admin</SectionLabel>
          <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            {adminNav.map((item) => (
              <Link key={item.href} href={item.href} style={navLinkStyle(item.active)}>
                <span style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center" }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </details>

      <form action="/search" method="GET" className="nds-topbar-search">
        <span style={{ display: "inline-flex" }}>{IconSearch()}</span>
        <input
          name="q"
          placeholder="Search assets, issuers, wallets…"
          style={{
            border: "none",
            background: "transparent",
            outline: "none",
            width: "100%",
            color: "var(--shell-fg)",
            fontSize: "0.88rem",
          }}
        />
      </form>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <ThemeToggle />
        <ChatBell />
        <NotificationsBell />
        <PrivyLoginButton />
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
        color: "var(--shell-faint)",
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
    color: active ? "var(--shell-active-fg)" : "var(--shell-muted)",
    background: active ? "var(--shell-active-bg)" : "transparent",
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

function IconTicket() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 100-4V8z" />
      <path d="M10 6v12" strokeDasharray="2 2" />
    </svg>
  );
}

function IconHandshake() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 17l2 2 4-4" />
      <path d="M3 10l5-5 3 3" />
      <path d="M21 10l-5-5-3 3" />
      <path d="M3 10l6 6 3-3 3 3 6-6" />
    </svg>
  );
}

function IconCoins() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="9" r="5" />
      <circle cx="16" cy="15" r="5" />
    </svg>
  );
}

function IconRepeat() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5.5-3.5 10-8 10s-8-4.5-8-10V6l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
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

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

const mobileMenuButtonStyle: React.CSSProperties = {
  listStyle: "none",
  cursor: "pointer",
  width: 40,
  height: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  color: "var(--shell-fg)",
};

const mobileMenuPanelStyle: React.CSSProperties = {
  position: "absolute",
  top: 64,
  left: 0,
  right: 0,
  background: "var(--shell-card)",
  borderBottom: "1px solid var(--shell-border)",
  padding: "1rem 1rem 1.5rem",
  maxHeight: "calc(100vh - 64px)",
  overflowY: "auto",
  zIndex: 20,
};

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}
