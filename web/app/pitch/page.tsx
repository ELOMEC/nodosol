import Link from "next/link";

import { LandingProviders } from "../LandingProviders";
import { TelemetryStrip } from "../TelemetryStrip";

export const metadata = {
  title: "nodosol — Solana super-app for compliant RWA + creator economy",
  description:
    "Nodosol is building the only Solana super-app that combines licenced real-world-asset tokenisation with a creator-payments rail. Seven Anchor programs live on devnet with end-to-end fee infrastructure.",
};

export default function PitchPage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
      <nav style={navStyle}>
        <Link href="/" style={brandStyle}>
          <span style={logoMarkStyle}>n</span>
          <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>nodosol</span>
        </Link>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Link href="/marketplace" style={navLinkStyle}>Open app</Link>
          <a href="mailto:office@nodosol.com" style={ctaStyle}>
            Request intro
          </a>
        </div>
      </nav>

      <section style={{ marginBottom: "4rem" }}>
        <Eyebrow>Seed pitch · 2026</Eyebrow>
        <h1 style={h1Style}>
          The Solana super-app for <span style={{ color: "#9a9a9a" }}>licenced RWA</span> and creator payments.
        </h1>
        <p style={leadStyle}>
          Nodosol combines two rails that share the same USDC-native Solana fee infrastructure:
          a <strong style={{ color: "#fff" }}>compliant RWA marketplace</strong> for tokenised
          commodities, debt, and real estate; and a <strong style={{ color: "#fff" }}>creator
          payments stack</strong> (tip jars, subscriptions, cNFT event tickets).
          Seven Anchor programs are live on devnet today, end-to-end flows with atomic settlement.
        </p>
        <div style={{ display: "flex", gap: "0.8rem", marginTop: "2rem", flexWrap: "wrap" }}>
          <a href="mailto:office@nodosol.com?subject=nodosol%20—%20investor%20intro" style={ctaPrimaryStyle}>
            Request an investor meeting
          </a>
          <Link href="/marketplace" style={ctaSecondaryStyle}>
            See the live product
          </Link>
        </div>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>The opportunity</Eyebrow>
        <h2 style={h2Style}>RWA tokenisation is the next trillion-dollar narrative — nobody has shipped a compliant Solana-native stack.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1.5rem" }}>
          <DataPoint headline="$30T" blurb="addressable RWA market size by 2030 per BCG / Citi estimates" />
          <DataPoint headline="<$10B" blurb="currently tokenised on-chain across all chains (0.03% penetration)" />
          <DataPoint headline="Zero" blurb="Solana-native RWA marketplaces with a real licensing posture today" />
          <DataPoint headline="2 days" blurb="our end-to-end tokenise → list → atomic buy path on devnet" />
        </div>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>The product — three pillars on one fee rail</Eyebrow>
        <h2 style={h2Style}>One Solana super-app, three monetisation surfaces.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginTop: "1.5rem" }}>
          <Pillar
            title="Compliant RWA"
            body="Tokenise commodities, real estate, or debt as Token-2022 assets — but only if the issuer is in our on-chain licence registry. Every sale atomically splits USDC between seller and platform treasury. Open marketplace listings + bilateral OTC escrow for private deals."
          />
          <Pillar
            title="Creator payments"
            body="Drop-in Solana Actions (Blinks) for tip jars, recurring subscriptions (SPL delegate pattern pre-approves 12 cycles), and event tickets. Same Config-PDA fee infrastructure used by the RWA programs; no custodian, no Stripe."
          />
          <Pillar
            title="cNFT event tickets"
            body="Events issue tickets as Metaplex Bubblegum compressed NFTs — transferable, Phantom-visible, Tensor / Magic Eden compatible. Fees ~$0.00005 per ticket. Immediate secondary market."
          />
        </div>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Why Solana</Eyebrow>
        <h2 style={h2Style}>RWA needs the cheapest clearing layer. Solana is the only L1 where atomic fee-splitting + cNFT issuance stays economical at retail scale.</h2>
        <ul style={listStyle}>
          <li><strong style={{ color: "#fff" }}>Settlement cost:</strong> $0.0001 per tx vs. $5–50 on Ethereum mainnet. A $10 ticket pays out 99.999%.</li>
          <li><strong style={{ color: "#fff" }}>Finality:</strong> &lt;1 s. Merchants never have to wait for confirmations.</li>
          <li><strong style={{ color: "#fff" }}>Token-2022 + Bubblegum:</strong> native compressed NFTs and transfer-hook extensions make RWA issuance + secondary markets first-class.</li>
          <li><strong style={{ color: "#fff" }}>Helius / Triton / Jito:</strong> production-grade RPC + MEV infra at commodity pricing.</li>
        </ul>
      </section>

      <section style={{ ...sectionStyle, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 14, padding: "1.75rem 2rem" }}>
        <Eyebrow>The moat — regulatory</Eyebrow>
        <h2 style={h2Style}>We are acquiring a licenced entity in a Balkan jurisdiction with active commodities-tokenisation permits.</h2>
        <p style={paragraphStyle}>
          Most Solana RWA plays hand-wave the legal layer. We are not. Nodosol&apos;s
          on-chain issuer registry whitelists wallets by jurisdiction × asset class;
          only Active issuers can mint. The underlying licensed entity becomes the
          primary anchor issuer at mainnet launch. Additional issuers onboard one at
          a time after KYC.
        </p>
        <p style={paragraphStyle}>
          This gives us a structural defensibility other Solana dApps don&apos;t
          have: <strong style={{ color: "#fff" }}>regulated supply</strong>. You
          cannot fork the licence. The registry enforces jurisdiction gating at the
          transaction level.
        </p>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>What&apos;s live today — on devnet</Eyebrow>
        <h2 style={h2Style}>Seven Anchor programs, 110+ LiteSVM tests passing, full client flows.</h2>
        <div style={{ marginTop: "1.25rem" }}>
          <LandingProviders>
            <TelemetryStrip />
          </LandingProviders>
        </div>
        <p style={{ fontSize: "0.85rem", color: "#8a8a8a", marginTop: "0.75rem" }}>
          Counts refresh on each page load via <code style={inlineCode}>getProgramAccounts</code>.
        </p>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Architecture</Eyebrow>
        <h2 style={h2Style}>Pure on-chain state + a thin web / mobile client. No backend mutates user funds.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1.5rem" }}>
          <ProgramCard label="tip_jar" role="Creator tips" high="Config + fee split + ElGamal-reserve for V2 confidential transfers" />
          <ProgramCard label="subscription" role="Recurring billing" high="SPL token delegate pre-approves N cycles — one-click subscribe" />
          <ProgramCard label="events (legacy)" role="PDA-based tickets" high="Non-transferable; superseded by event_tickets" />
          <ProgramCard label="rwa_registry" role="Licenced issuer list" high="Status machine (Pending → Active ↔ Suspended → Revoked); jurisdiction tags; asset class bitmap" />
          <ProgramCard label="rwa_mint" role="Asset tokenisation" high="Token-2022 fixed supply. Cross-program issuer check via seeds::program" />
          <ProgramCard label="marketplace" role="Public listings" high="Escrow vault pattern; atomic buy with fee split; listing price updates" />
          <ProgramCard label="otc_deals" role="Bilateral escrow" high="Counter-party-specific proposal; 1-min to 30-day expiry; permissionless expire crank" />
          <ProgramCard label="event_tickets" role="Compressed NFT tickets" high="Bubblegum CPI — mint_v1 + create_tree. Event PDA is tree delegate" />
        </div>
        <p style={{ fontSize: "0.85rem", color: "#8a8a8a", marginTop: "1.25rem" }}>
          Shared Config-PDA pattern across programs: one authority-gated admin surface per program ({" "}
          <code style={inlineCode}>initialize_config</code>, <code style={inlineCode}>update_fee_bps</code>,{" "}
          <code style={inlineCode}>update_treasury</code>, <code style={inlineCode}>update_authority</code>). Admin dashboard at{" "}
          <Link href="/admin" style={{ color: "#7b9cff" }}>/admin</Link> is a thin client over these instructions.
        </p>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Business model</Eyebrow>
        <h2 style={h2Style}>Platform fee on every USDC flow that clears through a nodosol program.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginTop: "1.25rem" }}>
          <DataPoint headline="2.5%" blurb="default marketplace fee on every buy_listing" />
          <DataPoint headline="3%" blurb="default OTC fee on every accept_deal" />
          <DataPoint headline="0–1%" blurb="creator programs — tuned per vertical" />
        </div>
        <p style={paragraphStyle}>
          Fees are programmable per Config PDA via the admin dashboard, capped at
          10% on-chain. Treasury is a dedicated USDC ATA under multi-sig control at
          mainnet. Revenue scales linearly with marketplace volume; the creator
          rail adds long-tail steady-state cash flow.
        </p>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Team</Eyebrow>
        <h2 style={h2Style}>Founder-led. Pre-seed solo founder with 10+ years in shipping production web infrastructure.</h2>
        <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: "1.4rem 1.5rem", marginTop: "1rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>Mladen Rakić — Founder, CEO</h3>
          <p style={{ fontSize: "0.9rem", color: "#b5b5b5", lineHeight: 1.6 }}>
            Solo founder. Background in Laravel / PostgreSQL / TypeScript; shipping
            production systems for a decade. Solana + Anchor since 2026. Warm
            introductions into Solana Foundation network. Actively recruiting a
            Rust-native co-founder as part of the seed raise.
          </p>
        </div>
      </section>

      <section style={{ ...sectionStyle, background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 14, padding: "1.75rem 2rem" }}>
        <Eyebrow>The ask</Eyebrow>
        <h2 style={h2Style}>$5M Seed round to ship mainnet, close the licence acquisition, and onboard the first five issuers.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginTop: "1.25rem" }}>
          <UseOfFunds
            percent="35%"
            title="Licence closing + legal"
            body="Finalise acquisition of the Balkan licensed entity. Regulatory counsel in 3 secondary jurisdictions."
          />
          <UseOfFunds
            percent="30%"
            title="Engineering"
            body="Rust co-founder + two senior engineers (mobile, infra). External security audit across seven programs."
          />
          <UseOfFunds
            percent="20%"
            title="Issuer BD"
            body="First five anchor issuers (ag commodities, real estate, debt). On-boarding + KYC operational work."
          />
          <UseOfFunds
            percent="15%"
            title="Treasury + ops"
            body="18-month runway buffer. RPC / infra subscriptions. Solana Foundation grant match."
          />
        </div>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Talk to us</Eyebrow>
        <h2 style={h2Style}>Warm intros through the Solana Foundation network preferred. Cold email works too.</h2>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "1.25rem" }}>
          <a href="mailto:office@nodosol.com?subject=nodosol%20—%20investor%20intro" style={ctaPrimaryStyle}>
            office@nodosol.com
          </a>
          <a href="https://www.nodosol.com/marketplace" style={ctaSecondaryStyle}>
            www.nodosol.com/marketplace
          </a>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid #222", paddingTop: "2rem", marginTop: "2.5rem", fontSize: "0.8rem", color: "#6a6a6a", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>© 2026 Nodosol · Built on Solana</div>
        <div>Last updated 2026-04-20</div>
      </footer>
    </main>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        background: "rgba(123,156,255,0.12)",
        color: "#a5b4fc",
        padding: "0.3rem 0.75rem",
        borderRadius: 999,
        fontSize: "0.74rem",
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        marginBottom: "1rem",
      }}
    >
      {children}
    </div>
  );
}

function DataPoint({ headline, blurb }: { headline: string; blurb: string }) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 12,
        padding: "1.2rem 1.3rem",
      }}
    >
      <div style={{ fontSize: "1.9rem", fontWeight: 600, letterSpacing: "-0.03em", marginBottom: "0.35rem" }}>{headline}</div>
      <div style={{ color: "#9a9a9a", fontSize: "0.9rem", lineHeight: 1.55 }}>{blurb}</div>
    </div>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 12,
        padding: "1.3rem 1.4rem",
      }}
    >
      <h3 style={{ fontSize: "1.02rem", fontWeight: 600, marginBottom: "0.6rem" }}>{title}</h3>
      <p style={{ color: "#9a9a9a", fontSize: "0.9rem", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function ProgramCard({ label, role, high }: { label: string; role: string; high: string }) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 12,
        padding: "1rem 1.15rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.35rem" }}>
        <code style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: "0.92rem", fontWeight: 600, color: "#7b9cff" }}>
          {label}
        </code>
        <span style={{ fontSize: "0.78rem", color: "#8a8a8a" }}>{role}</span>
      </div>
      <div style={{ fontSize: "0.82rem", color: "#b5b5b5", lineHeight: 1.55 }}>{high}</div>
    </div>
  );
}

function UseOfFunds({
  percent,
  title,
  body,
}: {
  percent: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.3rem" }}>
        <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "#7b9cff" }}>{percent}</div>
        <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{title}</div>
      </div>
      <p style={{ color: "#9a9a9a", fontSize: "0.86rem", lineHeight: 1.55 }}>{body}</p>
    </div>
  );
}

const navStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "3rem",
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  color: "#fff",
  textDecoration: "none",
};

const logoMarkStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontWeight: 700,
};

const navLinkStyle: React.CSSProperties = {
  padding: "0.5rem 0.85rem",
  borderRadius: 7,
  color: "#e8e8e8",
  textDecoration: "none",
  fontSize: "0.88rem",
};

const ctaStyle: React.CSSProperties = {
  ...navLinkStyle,
  background: "#7b9cff",
  color: "#0a0a0a",
  fontWeight: 600,
};

const h1Style: React.CSSProperties = {
  fontSize: "clamp(2.3rem, 5vw, 3.5rem)",
  lineHeight: 1.05,
  letterSpacing: "-0.035em",
  fontWeight: 600,
  marginBottom: "1.25rem",
};

const h2Style: React.CSSProperties = {
  fontSize: "clamp(1.35rem, 2.5vw, 1.75rem)",
  lineHeight: 1.2,
  letterSpacing: "-0.02em",
  fontWeight: 600,
  marginBottom: "0.75rem",
};

const leadStyle: React.CSSProperties = {
  fontSize: "1.1rem",
  color: "#b5b5b5",
  lineHeight: 1.65,
  maxWidth: 720,
};

const paragraphStyle: React.CSSProperties = {
  fontSize: "0.95rem",
  color: "#b5b5b5",
  lineHeight: 1.7,
  marginTop: "0.75rem",
};

const listStyle: React.CSSProperties = {
  marginTop: "1rem",
  paddingLeft: "1.25rem",
  color: "#b5b5b5",
  fontSize: "0.95rem",
  lineHeight: 1.8,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "3.5rem",
};

const ctaPrimaryStyle: React.CSSProperties = {
  background: "#7b9cff",
  color: "#0a0a0a",
  padding: "0.75rem 1.35rem",
  borderRadius: 8,
  fontSize: "0.92rem",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};

const ctaSecondaryStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #333",
  color: "#e8e8e8",
  padding: "0.75rem 1.35rem",
  borderRadius: 8,
  fontSize: "0.92rem",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};

const inlineCode: React.CSSProperties = {
  background: "#1a1a1a",
  color: "#a5b4fc",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.82em",
  fontFamily: "'SF Mono', Menlo, monospace",
};
