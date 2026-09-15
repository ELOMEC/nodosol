import Link from "next/link";
import type { ReactNode } from "react";

import { AdminPill } from "./AdminPill";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { ChatBell } from "./ChatBell";
import { LocaleToggle } from "./LocaleToggle";
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
    | "list"
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
    | "chat"
    | "search"
    | "settings"
    | "settings-notifications"
    | "creators"
    | "ops"
    | "history"
    | "wishlist"
    | "alerts";
  children: ReactNode;
}) {
  const investNav: NavItem[] = [
    { href: "/marketplace", label: "Market", icon: IconGrid(), active: active === "marketplace" },
    { href: "/marketplace/auctions", label: "Auctions", icon: IconChart(), active: active === "auctions" },
    { href: "/marketplace/otc", label: "OTC", icon: IconHandshake(), active: active === "otc" },
    { href: "/marketplace/rentals", label: "Rentals", icon: IconRepeat(), active: active === "rentals" },
    { href: "/marketplace/properties", label: "Properties", icon: IconGrid(), active: active === "properties" },
  ];
  const issueNav: NavItem[] = [
    { href: "/marketplace/tokenize", label: "Tokenize", icon: IconPlus(), active: active === "tokenize" },
    { href: "/marketplace/list", label: "List asset", icon: IconTag(), active: active === "list" },
  ];
  const ticketNav: NavItem[] = [
    { href: "/marketplace/events", label: "Events", icon: IconTicket(), active: active === "events" },
    { href: "/marketplace/tickets", label: "My tickets", icon: IconTicket(), active: active === "tickets" },
    { href: "/marketplace/resale", label: "Resale", icon: IconHandshake(), active: active === "resale" },
  ];
  const portfolioNav: NavItem[] = [
    { href: "/marketplace/assets", label: "Assets", icon: IconWallet(), active: active === "assets" },
    { href: "/marketplace/portfolio", label: "Portfolio", icon: IconChart(), active: active === "portfolio" },
    { href: "/account/history", label: "History", icon: IconClock(), active: active === "history" },
    { href: "/account/wishlist", label: "Wishlist", icon: IconHeart(), active: active === "wishlist" },
    { href: "/account/alerts", label: "Alerts", icon: IconBell(), active: active === "alerts" },
  ];
  const creatorNav: NavItem[] = [
    { href: "/creator", label: "Overview", icon: IconChart(), active: active === "creator" },
    { href: "/creator/tips", label: "Tip jar", icon: IconCoins(), active: active === "creator-tips" },
    { href: "/creator/plans", label: "Subscriptions", icon: IconRepeat(), active: active === "creator-plans" },
    { href: "/creator/events", label: "Events", icon: IconTicket(), active: active === "creator-events" },
    { href: "/creator/venues", label: "Venue layouts", icon: IconGrid(), active: active === "creator-venues" },
  ];
  const opsNav: NavItem[] = [
    { href: "/ops", label: "Overview", icon: IconChart(), active: active === "ops" },
    { href: "/ops/creators", label: "Creators", icon: IconUsers(), active: active === "creators" },
    { href: "/ops/channels", label: "Channels", icon: IconChat(), active: active === "chat" },
    { href: "/ops/search", label: "Search", icon: IconSearch(), active: active === "search" },
    { href: "/ops/notifications", label: "Notifications", icon: IconBell(), active: active === "settings-notifications" },
  ];
  const navGroups = [
    { key: "market", href: "/marketplace", label: "Market", items: investNav },
    { key: "issue", href: "/marketplace/tokenize", label: "Issue", items: issueNav },
    { key: "tickets", href: "/marketplace/events", label: "Tickets", items: ticketNav },
    { key: "portfolio", href: "/marketplace/portfolio", label: "Portfolio", items: portfolioNav },
    { key: "creator", href: "/creator", label: "Creator", items: creatorNav },
    { key: "ops", href: "/ops", label: "Ops", items: opsNav },
  ];
  const activeGroup =
    navGroups.find((group) => group.items.some((item) => item.active)) ??
    (active === "admin" || active === "admin-issuers" ? navGroups[5] : navGroups[0]);

  return (
    <div
      className="nds-shell-layout nds-shell-layout-modern"
      style={{
        background: "var(--shell-bg)",
        color: "var(--shell-fg)",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <AnnouncementBanner />
      <header className="nds-product-topbar">
        <div className="nds-product-topbar-inner">
          <div className="nds-product-brand-row">
            <Link href="/" className="nds-product-brand" aria-label="Nodosol home">
              <span className="nds-product-logo">n</span>
              <span>
                <span className="nds-product-name">nodosol</span>
                <span className="nds-product-tagline">regulated market OS</span>
              </span>
            </Link>
            <nav className="nds-product-nav" aria-label="Product">
              {navGroups.map((group) => (
                <Link
                  key={group.key}
                  href={group.href}
                  className={group.key === activeGroup.key ? "nds-product-nav-link is-active" : "nds-product-nav-link"}
                >
                  {group.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="nds-product-actions">
            <details className="nds-mobile-menu">
              <summary aria-label="Menu" style={mobileMenuButtonStyle}>
                {IconMenu()}
              </summary>
              <div style={mobileMenuPanelStyle}>
                {navGroups.map((group) => (
                  <div key={group.key} style={{ marginBottom: "1rem" }}>
                    <SectionLabel>{group.label}</SectionLabel>
                    <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                      {group.items.map((item) => (
                        <Link key={item.href} href={item.href} style={navLinkStyle(item.active)}>
                          <span style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center" }}>{item.icon}</span>
                          {item.label}
                        </Link>
                      ))}
                    </nav>
                  </div>
                ))}
              </div>
            </details>
            <AdminPill />
            <LocaleToggle />
            <ThemeToggle />
            <ChatBell />
            <NotificationsBell />
            <PrivyLoginButton />
            <WalletPill />
          </div>
        </div>
      </header>

      <div className="nds-secondary-rail">
        <div className="nds-secondary-rail-inner">
          <form action="/ops/search" method="GET" className="nds-topbar-search nds-topbar-search-modern">
            <span style={{ display: "inline-flex" }}>{IconSearch()}</span>
            <input
              name="q"
              placeholder="Search assets, issuers, wallets..."
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
          <nav className="nds-secondary-nav" aria-label={`${activeGroup.label} navigation`}>
            {activeGroup.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={item.active ? "nds-secondary-link is-active" : "nds-secondary-link"}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="nds-env-pill">
            <span />
            Devnet
          </div>
        </div>
      </div>

      <main id="main-content" className="nds-shell-main nds-shell-main-modern">{children}</main>
    </div>
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

function IconTag() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 13.5l-7 7a2 2 0 01-2.83 0L3 12.83V3h9.83l7.67 7.67a2 2 0 010 2.83z" />
      <circle cx="8" cy="8" r="1.5" />
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

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" />
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

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}
