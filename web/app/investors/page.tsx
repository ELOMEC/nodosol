import Link from "next/link";
import type { ReactNode } from "react";

import { PublicPageShell } from "@/components/PublicPageShell";

import { LandingProviders } from "../LandingProviders";
import { TelemetryStrip } from "../TelemetryStrip";

export const metadata = {
  title: "nodosol - investors",
  description:
    "Investor overview for Nodosol: compliant Solana RWA marketplace, creator payments, on-chain traction, architecture, and funding focus.",
};

export default function InvestorsPage() {
  return (
    <PublicPageShell active="investors">
      <section className="nds-investor-hero" style={heroStyle}>
        <div>
          <Eyebrow>Investor room</Eyebrow>
          <h1 style={h1Style}>
            Compliant RWA marketplace and creator payment rails on one Solana
            fee infrastructure.
          </h1>
          <p style={leadStyle}>
            Nodosol is built for issuers who need controlled tokenisation and
            buyers who need clear asset provenance before they connect a wallet.
            Devnet flows are live; mainnet opens after audit and regulated
            issuer gating.
          </p>
          <div style={ctaRowStyle}>
            <a
              href="mailto:office@nodosol.com?subject=nodosol%20investor%20intro"
              style={primaryCtaStyle}
            >
              Request intro
            </a>
            <Link href="/pitch" style={secondaryCtaStyle}>
              Open pitch
            </Link>
            <Link href="/marketplace" style={ghostCtaStyle}>
              View market
            </Link>
          </div>
        </div>

        <div style={memoStyle}>
          <div style={memoHeaderStyle}>
            <span style={dotStyle("#ef4444")} />
            <span style={dotStyle("#f59e0b")} />
            <span style={dotStyle("#22c55e")} />
            <span style={{ marginLeft: "auto", color: "#64748b", fontSize: "0.74rem" }}>
              investor://snapshot
            </span>
          </div>
          <Metric label="Programs" value="9" />
          <Metric label="Frontend verticals" value="7" />
          <Metric label="Settlement" value="USDC atomic" />
          <Metric label="Upgrade authority" value="Squads 2-of-3" />
        </div>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Why it matters</Eyebrow>
        <div className="nds-grid-3" style={{ gap: "1rem" }}>
          <Card
            title="Regulated issuance"
            body="Active issuers are checked on-chain before tokenisation. Asset class and jurisdiction are first-class data, not a marketing footnote."
          />
          <Card
            title="Liquidity surfaces"
            body="The same asset can move through public listings, OTC escrow, sealed-bid auctions, rentals, or portfolio tooling."
          />
          <Card
            title="Low-cost distribution"
            body="Solana settlement lets small-ticket real-world assets and creator payments clear without web2 processor drag."
          />
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <Eyebrow>Live devnet state</Eyebrow>
          <Link href="/stats" style={{ color: "#a5b4fc", fontSize: "0.86rem", fontWeight: 650 }}>
            Open full stats
          </Link>
        </div>
        <LandingProviders>
          <TelemetryStrip />
        </LandingProviders>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Funding focus</Eyebrow>
        <div className="nds-grid-2" style={{ gap: "1rem" }}>
          <Card
            title="Audit and launch"
            body="Fund the external security audit, mainnet launch controls, monitoring, and staged caps for the first regulated asset categories."
          />
          <Card
            title="Issuer pipeline"
            body="Onboard licensed issuers, legal review, market operations, and buyer education around asset risk and settlement guarantees."
          />
        </div>
      </section>
    </PublicPageShell>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={eyebrowStyle}>{children}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <span style={{ color: "#8b98ad", fontSize: "0.78rem" }}>{label}</span>
      <strong style={{ color: "#fff", fontSize: "1rem" }}>{value}</strong>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: "1rem", color: "#fff", marginBottom: "0.55rem" }}>{title}</h2>
      <p style={{ color: "#b8c1d1", lineHeight: 1.65, fontSize: "0.94rem" }}>{body}</p>
    </div>
  );
}

function dotStyle(color: string): React.CSSProperties {
  return { width: 9, height: 9, borderRadius: "50%", background: color };
}

const heroStyle: React.CSSProperties = {
  display: "grid",
  gap: "2rem",
  alignItems: "center",
  marginBottom: "3rem",
};

const h1Style: React.CSSProperties = {
  fontSize: "2.4rem",
  lineHeight: 1.08,
  letterSpacing: 0,
  fontWeight: 760,
  color: "#fff",
  maxWidth: 760,
  marginBottom: "1rem",
};

const leadStyle: React.CSSProperties = {
  fontSize: "1.02rem",
  color: "#c5cbd4",
  lineHeight: 1.7,
  maxWidth: 720,
};

const eyebrowStyle: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: "0.76rem",
  fontWeight: 760,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: "0.9rem",
};

const ctaRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginTop: "1.55rem",
};

const primaryCtaStyle: React.CSSProperties = {
  padding: "0.82rem 1.05rem",
  borderRadius: 8,
  background: "#f8fafc",
  color: "#0f172a",
  fontWeight: 780,
  textDecoration: "none",
};

const secondaryCtaStyle: React.CSSProperties = {
  padding: "0.82rem 1.05rem",
  borderRadius: 8,
  border: "1px solid rgba(165,180,252,0.32)",
  color: "#c7d2fe",
  fontWeight: 720,
  textDecoration: "none",
};

const ghostCtaStyle: React.CSSProperties = {
  padding: "0.82rem 1.05rem",
  color: "#a8b3c4",
  fontWeight: 700,
  textDecoration: "none",
};

const memoStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 16,
  background: "linear-gradient(180deg, rgba(15,23,42,0.86), rgba(2,6,23,0.94))",
  padding: "1rem",
  boxShadow: "0 24px 80px rgba(0,0,0,0.38)",
};

const memoHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  marginBottom: "1rem",
};

const metricStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "0.9rem 0",
  borderTop: "1px solid rgba(148,163,184,0.14)",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "3rem",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 16,
  background: "rgba(15,23,42,0.58)",
  padding: "1.25rem",
};
