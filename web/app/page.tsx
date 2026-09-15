import Link from "next/link";

import { OnboardingTour } from "@/components/OnboardingTour";
import { PublicPageShell } from "@/components/PublicPageShell";
import { TrendingPanel } from "@/components/TrendingPanel";
import { TrustSignals } from "@/components/TrustSignals";
import { WaitlistForm } from "@/components/WaitlistForm";

import { LandingProviders } from "./LandingProviders";
import { TelemetryStrip } from "./TelemetryStrip";

export default function HomePage() {
  return (
    <PublicPageShell active="home">
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 0 1rem" }}>
      <section className="nds-hero" style={{ marginBottom: "3rem", alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 540 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "rgba(37,99,235,0.12)",
              color: "#bfdbfe",
              padding: "0.35rem 0.8rem",
              borderRadius: 999,
              fontSize: "0.78rem",
              fontWeight: 600,
              marginBottom: "1.35rem",
              width: "fit-content",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
            Devnet live · mainnet gated on audit
          </div>
          <h1
            className="nds-landing-hero-title"
            style={{
              fontSize: "2.35rem",
              lineHeight: 1.04,
              letterSpacing: 0,
              fontWeight: 650,
              marginBottom: "1.25rem",
              maxWidth: 760,
            }}
          >
            Regulated asset marketplace OS
            <span style={{ color: "#94a3b8" }}> for Solana issuers.</span>
          </h1>
          <p style={{ fontSize: "1.08rem", color: "#c5cbd4", lineHeight: 1.65, marginBottom: "1.35rem", maxWidth: 680 }}>
            Nodosol gives licenced issuers the rails to tokenize real-world
            assets, sell in USDC, run OTC or sealed-bid markets, and give buyers
            a clear trust trail before they sign.
          </p>
          <TrustSignals />
          <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.2rem" }}>
            <Link href="/marketplace" style={primaryCtaStyle()}>
              Explore investable assets
            </Link>
            <Link href="/marketplace/tokenize" style={secondaryCtaStyle()}>
              Start issuer flow
            </Link>
          </div>
        </div>

        <HeroTerminal />
      </section>

      <section style={{ marginBottom: "2.5rem" }}>
        <LandingProviders>
          <TrendingPanel />
        </LandingProviders>
      </section>

      <section style={{ marginBottom: "4rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem" }}>
          <h2 style={{ fontSize: "0.88rem", letterSpacing: 1, textTransform: "uppercase", color: "#9a9a9a", fontWeight: 600 }}>
            Live network state (devnet)
          </h2>
          <span style={{ fontSize: "0.75rem", color: "#6a6a6a" }}>Reads on-chain every page load</span>
        </div>
        <LandingProviders>
          <TelemetryStrip />
        </LandingProviders>
      </section>

      <section style={{ marginBottom: "4rem" }}>
        <div className="nds-grid-2" style={{ gap: "1rem", alignItems: "stretch" }}>
          <WorkflowPanel
            eyebrow="For buyers"
            title="Inspect before you invest"
            body="Each asset page should make eligibility, issuer status, legal references, inventory, and settlement terms visible before the wallet prompt."
            href="/marketplace"
            cta="Browse marketplace"
          />
          <WorkflowPanel
            eyebrow="For issuers"
            title="Launch with controls"
            body="Register issuer status, mint fixed-supply Token-2022 assets, choose public listing, OTC escrow, or sealed-bid auction, then route fees on-chain."
            href="/marketplace/tokenize"
            cta="Open issuer tools"
          />
        </div>
      </section>

      <section style={{ marginBottom: "4rem" }}>
        <h2 style={{ fontSize: "0.88rem", letterSpacing: 1, textTransform: "uppercase", color: "#9a9a9a", fontWeight: 600, marginBottom: "1.25rem" }}>
          Marketplace trust layer
        </h2>
        <div className="nds-grid-3" style={{ gap: "1rem" }}>
          <ValueCard
            title="Issuer registry"
            body="Licenced entities are represented on-chain with status, jurisdiction, and asset-class permissions before they can mint real-world assets."
          />
          <ValueCard
            title="Atomic settlement"
            body="USDC, treasury fees, and asset tokens settle in one transaction. The platform does not custody buyer funds between matching and settlement."
          />
          <ValueCard
            title="Private deal rails"
            body="OTC escrow and sealed-bid auctions give issuers more than a simple listing page when the asset needs negotiation or price discovery."
          />
        </div>
      </section>

      <section style={{ marginBottom: "4rem" }}>
        <h2 style={{ fontSize: "0.88rem", letterSpacing: 1, textTransform: "uppercase", color: "#9a9a9a", fontWeight: 600, marginBottom: "1.25rem" }}>
          Product modules
        </h2>
        <div className="nds-grid-2" style={{ gap: "1rem" }}>
          <FeatureCard label="Invest" href="/marketplace" hint="Listings, auctions, rentals, properties, and asset detail pages" />
          <FeatureCard label="Issue" href="/marketplace/tokenize" hint="Issuer registry checks, Token-2022 minting, and listing workflows" />
          <FeatureCard label="Tickets" href="/marketplace/events" hint="cNFT event tickets, venue tiers, check-in, and resale board" />
          <FeatureCard label="Portfolio" href="/marketplace/portfolio" hint="Holdings, history, wishlist, alerts, and buyer account tools" />
        </div>
      </section>

      <section style={{ marginBottom: "4rem" }}>
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 8,
            padding: "1.75rem",
          }}
        >
          <h2 style={{ fontSize: "0.88rem", letterSpacing: 1, textTransform: "uppercase", color: "#93c5fd", fontWeight: 650, marginBottom: "0.75rem" }}>
            Get early access
          </h2>
          <p style={{ fontSize: "0.95rem", color: "#cbd5e1", lineHeight: 1.6, marginBottom: "1.25rem", maxWidth: 680 }}>
            Mainnet launch is gated on audit close. Join the waitlist as an
            issuer, buyer, creator, or partner so the beta route matches your
            role.
          </p>
          <WaitlistForm source="landing" />
        </div>
      </section>

      <section style={{ borderTop: "1px solid #222", paddingTop: "2rem", fontSize: "0.82rem", color: "#6a6a6a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            Seven public-facing program modules live on devnet · nine-program architecture underneath.
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <a href="https://explorer.solana.com/?cluster=devnet" target="_blank" rel="noreferrer" style={{ color: "#7b9cff" }}>
              Solana Explorer ↗
            </a>
          </div>
        </div>
      </section>
      <OnboardingTour />
      </div>
    </PublicPageShell>
  );
}

function HeroTerminal() {
  return (
    <div
      style={{
        minHeight: 540,
        borderRadius: 10,
        border: "1px solid #1e293b",
        background: "linear-gradient(180deg, #111827 0%, #020617 100%)",
        padding: "1rem",
        boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <span style={dotStyle("#ef4444")} />
          <span style={dotStyle("#f59e0b")} />
          <span style={dotStyle("#22c55e")} />
        </div>
        <span style={{ color: "#64748b", fontSize: "0.72rem", fontFamily: "SF Mono, Menlo, monospace" }}>asset://NDS-042</span>
      </div>

      <div
        style={{
          border: "1px solid #243244",
          borderRadius: 8,
          overflow: "hidden",
          background: "#0b1120",
        }}
      >
        <div
          style={{
            minHeight: 190,
            background:
              "radial-gradient(circle at 30% 25%, rgba(96,165,250,0.34), transparent 34%), linear-gradient(135deg, #1e3a8a 0%, #0f172a 56%, #14532d 100%)",
            display: "flex",
            alignItems: "flex-end",
            padding: "1rem",
          }}
        >
          <div>
            <div style={{ color: "#dbeafe", fontSize: "0.78rem", fontWeight: 650, marginBottom: "0.35rem" }}>Verified issuer</div>
            <h2 style={{ fontSize: "1.35rem", lineHeight: 1.15, maxWidth: 280 }}>Fractional commodity-backed note</h2>
          </div>
        </div>
        <div style={{ padding: "1rem" }}>
          <HeroMetric label="Settlement" value="USDC atomic" />
          <HeroMetric label="Jurisdictions" value="SRB · MNE · EU review" />
          <HeroMetric label="Market route" value="Listing + OTC + auction" />
        </div>
      </div>

      <div className="nds-grid-2" style={{ gap: "0.75rem", marginTop: "1rem" }}>
        <SignalCard label="Issuer status" value="Active" tone="#22c55e" />
        <SignalCard label="Treasury fee" value="Config PDA" tone="#60a5fa" />
        <SignalCard label="Supply" value="Fixed + revoked" tone="#f59e0b" />
        <SignalCard label="Proofs" value="Docs pending" tone="#94a3b8" />
      </div>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.55rem 0", borderBottom: "1px solid #1e293b", fontSize: "0.82rem" }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ color: "#f8fafc", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function SignalCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ border: "1px solid #1e293b", background: "#0b1120", borderRadius: 8, padding: "0.85rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", color: "#94a3b8", fontSize: "0.72rem", marginBottom: "0.35rem" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: tone }} />
        {label}
      </div>
      <div style={{ color: "#f8fafc", fontSize: "0.9rem", fontWeight: 650 }}>{value}</div>
    </div>
  );
}

function WorkflowPanel({
  eyebrow,
  title,
  body,
  href,
  cta,
}: {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 8,
        padding: "1.5rem",
      }}
    >
      <div style={{ color: "#60a5fa", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 1, fontWeight: 650, marginBottom: "0.6rem" }}>
        {eyebrow}
      </div>
      <h2 style={{ fontSize: "1.35rem", lineHeight: 1.2, marginBottom: "0.65rem" }}>{title}</h2>
      <p style={{ color: "#a8b0bd", fontSize: "0.92rem", lineHeight: 1.65, marginBottom: "1.1rem" }}>{body}</p>
      <Link href={href} style={secondaryCtaStyle()}>
        {cta}
      </Link>
    </div>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 8,
        padding: "1.3rem 1.4rem",
      }}
    >
      <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.6rem" }}>{title}</h3>
      <p style={{ color: "#9a9a9a", fontSize: "0.9rem", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function FeatureCard({ label, href, hint }: { label: string; href: string; hint: string }) {
  return (
    <Link
      href={href}
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 8,
        padding: "1.1rem 1.25rem",
        textDecoration: "none",
        color: "#fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
      }}
    >
      <div>
        <div style={{ fontSize: "0.98rem", fontWeight: 600, marginBottom: "0.15rem" }}>{label}</div>
        <div style={{ fontSize: "0.78rem", color: "#8a8a8a" }}>{hint}</div>
      </div>
      <span style={{ color: "#93c5fd", fontSize: "0.85rem", fontWeight: 600 }}>Open →</span>
    </Link>
  );
}

function dotStyle(color: string): React.CSSProperties {
  return {
    width: 9,
    height: 9,
    borderRadius: "50%",
    background: color,
  };
}

function primaryCtaStyle(): React.CSSProperties {
  return {
    background: "#f8fafc",
    color: "#0b0d11",
    padding: "0.85rem 1.4rem",
    borderRadius: 8,
    fontSize: "0.92rem",
    fontWeight: 650,
    textDecoration: "none",
    minHeight: 44,
    display: "inline-flex",
    alignItems: "center",
  };
}

function secondaryCtaStyle(): React.CSSProperties {
  return {
    background: "transparent",
    border: "1px solid #334155",
    color: "#e2e8f0",
    padding: "0.82rem 1.2rem",
    borderRadius: 8,
    fontSize: "0.9rem",
    fontWeight: 600,
    textDecoration: "none",
    minHeight: 42,
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
  };
}
