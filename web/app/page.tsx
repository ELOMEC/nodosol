import Link from "next/link";

import { WaitlistForm } from "@/components/WaitlistForm";

import { LandingProviders } from "./LandingProviders";
import { TelemetryStrip } from "./TelemetryStrip";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "3.5rem 1.5rem 5rem" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "4rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            n
          </span>
          <span style={{ fontSize: "1.1rem", fontWeight: 600, letterSpacing: "-0.015em" }}>nodosol</span>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <Link href="/marketplace" style={navLinkStyle()}>
            Marketplace
          </Link>
          <Link href="/marketplace/tokenize" style={navLinkStyle()}>
            Tokenize
          </Link>
          <Link href="/stats" style={navLinkStyle()}>
            Stats
          </Link>
          <Link href="/pitch" style={navLinkStyle()}>
            Investors
          </Link>
          <Link
            href="/welcome"
            style={{
              ...navLinkStyle(),
              background: "#7b9cff",
              color: "#0a0a0a",
              fontWeight: 600,
            }}
          >
            Get started →
          </Link>
        </div>
      </nav>

      <section style={{ marginBottom: "3.5rem", maxWidth: 780 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(123,156,255,0.12)",
            color: "#a5b4fc",
            padding: "0.3rem 0.75rem",
            borderRadius: 999,
            fontSize: "0.78rem",
            fontWeight: 500,
            marginBottom: "1.5rem",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1" }} />
          Compliant RWA + creator economy on Solana
        </div>
        <h1
          style={{
            fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
            lineHeight: 1.05,
            letterSpacing: "-0.035em",
            fontWeight: 600,
            marginBottom: "1.25rem",
          }}
        >
          On-chain marketplace for tokenised real-world assets,
          <span style={{ color: "#9a9a9a" }}> built for licenced issuers.</span>
        </h1>
        <p style={{ fontSize: "1.08rem", color: "#b5b5b5", lineHeight: 1.6, marginBottom: "2rem", maxWidth: 660 }}>
          Nodosol is a Solana super-app combining creator payments (tips,
          subscriptions, event tickets) with an RWA marketplace where licenced
          issuers can tokenise commodities, tickets, and debt — and trade them
          instantly in USDC with on-chain settlement, platform fee routing, and
          OTC escrow for private deals.
        </p>
        <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/marketplace"
            style={{
              background: "#7b9cff",
              color: "#0a0a0a",
              padding: "0.75rem 1.35rem",
              borderRadius: 8,
              fontSize: "0.92rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Explore the marketplace
          </Link>
          <Link
            href="/marketplace/tokenize"
            style={{
              background: "transparent",
              border: "1px solid #333",
              color: "#e8e8e8",
              padding: "0.75rem 1.35rem",
              borderRadius: 8,
              fontSize: "0.92rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Tokenize an asset
          </Link>
        </div>
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
        <div
          style={{
            background: "#0f0f0f",
            border: "1px solid #1a1a1a",
            borderRadius: 12,
            padding: "1.75rem 1.75rem 1.6rem",
          }}
        >
          <h2 style={{ fontSize: "0.88rem", letterSpacing: 1, textTransform: "uppercase", color: "#9a9a9a", fontWeight: 600, marginBottom: "0.75rem" }}>
            Get early access
          </h2>
          <p style={{ fontSize: "0.95rem", color: "#b5b5b5", lineHeight: 1.6, marginBottom: "1.25rem", maxWidth: 640 }}>
            Mainnet launch is gated on audit close. Drop your email and we&apos;ll
            ping you before issuer onboarding opens — pick a role so we can route
            the right beta invite.
          </p>
          <WaitlistForm source="landing" />
        </div>
      </section>

      <section style={{ marginBottom: "4rem" }}>
        <h2 style={{ fontSize: "0.88rem", letterSpacing: 1, textTransform: "uppercase", color: "#9a9a9a", fontWeight: 600, marginBottom: "1.25rem" }}>
          Why Nodosol
        </h2>
        <div className="nds-grid-3" style={{ gap: "1rem" }}>
          <ValueCard
            title="Regulatory moat"
            body="Licenced-issuer registry enforced on-chain: only whitelisted entities can tokenise, filtered by jurisdiction and asset class. Rare on Solana, core to institutional adoption."
          />
          <ValueCard
            title="Atomic settlement"
            body="Every trade is a single Solana tx: USDC from buyer splits to seller and treasury, tokens release from vault to buyer. No clearing, no custody risk, no settlement lag."
          />
          <ValueCard
            title="Creator rail included"
            body="Same app, same fee infra: tip jars, recurring subscriptions (SPL delegate), and event tickets with check-in. All monetization on Solana's fastest RPC."
          />
        </div>
      </section>

      <section style={{ marginBottom: "4rem" }}>
        <h2 style={{ fontSize: "0.88rem", letterSpacing: 1, textTransform: "uppercase", color: "#9a9a9a", fontWeight: 600, marginBottom: "1.25rem" }}>
          What&apos;s live today
        </h2>
        <div className="nds-grid-2" style={{ gap: "1rem" }}>
          <FeatureCard label="Tokenize RWA" href="/marketplace/tokenize" hint="Fixed-supply Token-2022, mint authority auto-revoked" />
          <FeatureCard label="Marketplace" href="/marketplace" hint="Public listings with escrow vault, 2.5% platform fee" />
          <FeatureCard label="OTC deals" href="/marketplace/otc" hint="Bilateral escrow with 1 min–30 day expiry window" />
          <FeatureCard label="Portfolio" href="/marketplace/portfolio" hint="Live Token-2022 holdings joined with RWA metadata" />
        </div>
      </section>

      <section style={{ borderTop: "1px solid #222", paddingTop: "2rem", fontSize: "0.82rem", color: "#6a6a6a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            Seven Anchor programs live on Solana devnet · 110+ LiteSVM tests passing.
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <a href="https://explorer.solana.com/?cluster=devnet" target="_blank" rel="noreferrer" style={{ color: "#7b9cff" }}>
              Solana Explorer ↗
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 12,
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
        borderRadius: 12,
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
      <span style={{ color: "#7b9cff", fontSize: "0.85rem", fontWeight: 600 }}>Open →</span>
    </Link>
  );
}

function navLinkStyle(): React.CSSProperties {
  return {
    padding: "0.5rem 0.85rem",
    borderRadius: 7,
    color: "#e8e8e8",
    textDecoration: "none",
    fontSize: "0.88rem",
  };
}
