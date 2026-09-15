import Link from "next/link";

export const metadata = {
  title: "Be right back · nodosol",
  description: "Nodosol is briefly under maintenance — back shortly.",
  robots: { index: false, follow: false },
};

// Static maintenance shell. Middleware (`web/middleware.ts`) rewrites
// every public route here when `NEXT_PUBLIC_MAINTENANCE_MODE=1`.
// `/admin/*` and `/api/health` skip the rewrite so ops can flip the
// flag back off and external monitors keep working.

export default function MaintenancePage() {
  return (
    <main className="nds-public-dark" style={SHELL}>
      <div style={CARD}>
        <div style={LOGO_LABEL}>nodosol</div>
        <div style={ICON} aria-hidden="true">
          <svg width={42} height={42} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <circle cx={12} cy={12} r={10} />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <h1 style={H1}>We&apos;ll be right back</h1>
        <p style={SUB}>
          Nodosol is briefly under maintenance — usually a deploy that
          touches on-chain state or a cache flush. Most windows close
          within 10 minutes.
        </p>
        <p style={SUB}>
          Already trading? On-chain state is unaffected — your tickets,
          subscriptions, listings, and balances are safe in your wallet
          regardless of what the web shell shows.
        </p>
        <div style={LINKS}>
          <a href="https://x.com/nodosol" target="_blank" rel="noreferrer" style={LINK}>
            Status updates on X ↗
          </a>
          <span style={DOT}>·</span>
          <a href="mailto:support@nodosol.com" style={LINK}>
            support@nodosol.com
          </a>
        </div>
        <div style={FOOT_LINKS}>
          <Link href="/security" style={SUBLINK}>
            Security
          </Link>
          <span style={DOT}>·</span>
          <Link href="/privacy" style={SUBLINK}>
            Privacy
          </Link>
          <span style={DOT}>·</span>
          <Link href="/terms" style={SUBLINK}>
            Terms
          </Link>
        </div>
      </div>
    </main>
  );
}

const SHELL: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#0b0d12",
  color: "#eef0f3",
  padding: "2rem 1rem",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const CARD: React.CSSProperties = {
  maxWidth: 520,
  width: "100%",
  background: "#11141a",
  border: "1px solid #1f242d",
  borderRadius: 14,
  padding: "2.5rem 2rem 2rem",
  textAlign: "center" as const,
};

const LOGO_LABEL: React.CSSProperties = {
  fontSize: "0.78rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "#7c8694",
  marginBottom: "1.5rem",
};

const ICON: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 16,
  background: "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.12) 100%)",
  border: "1px solid rgba(123,156,255,0.32)",
  color: "#a5b4fc",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: "1.4rem",
};

const H1: React.CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 600,
  letterSpacing: "-0.015em",
  marginBottom: "0.85rem",
};

const SUB: React.CSSProperties = {
  color: "#c5cbd4",
  fontSize: "0.95rem",
  lineHeight: 1.6,
  marginBottom: "1rem",
};

const LINKS: React.CSSProperties = {
  marginTop: "1.5rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  fontSize: "0.92rem",
  flexWrap: "wrap",
};

const FOOT_LINKS: React.CSSProperties = {
  marginTop: "1.4rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  fontSize: "0.78rem",
  flexWrap: "wrap",
};

const LINK: React.CSSProperties = {
  color: "#7b9cff",
  textDecoration: "underline",
};

const SUBLINK: React.CSSProperties = {
  color: "#7c8694",
  textDecoration: "underline",
};

const DOT: React.CSSProperties = {
  color: "#3a3f4a",
};
