import Link from "next/link";

import { LandingProviders } from "../LandingProviders";
import { TelemetryStrip } from "../TelemetryStrip";

export const metadata = {
  title: "nodosol — Solana super-app for compliant RWA + creator payments",
  description:
    "Nodosol is a Solana super-app combining licenced RWA tokenisation with a creator-payments rail. UAE-incorporated, built by a founder who already ships sports-data infrastructure to Balkan federations and operates a 178K+ monthly-views distribution channel.",
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
          <Link href="/stats" style={navLinkStyle}>Live stats</Link>
          <Link href="/marketplace" style={navLinkStyle}>Open app</Link>
          <a href="mailto:office@nodosol.com?subject=nodosol%20—%20investor%20intro" style={ctaStyle}>
            Request intro
          </a>
        </div>
      </nav>

      <section style={{ marginBottom: "4rem" }}>
        <Eyebrow>Seed pitch · 2026</Eyebrow>
        <h1 style={h1Style}>
          A Solana super-app for <span style={{ color: "#9a9a9a" }}>licenced RWA</span> and creator payments —
          built by a founder who already ships production sports infrastructure to Balkan federations.
        </h1>
        <p style={leadStyle}>
          Nodosol combines two rails on one on-chain fee infrastructure:
          a <strong style={{ color: "#fff" }}>compliant RWA marketplace</strong> for tokenised
          commodities, debt, and real estate; and a <strong style={{ color: "#fff" }}>creator
          payments stack</strong> (tip jars, subscriptions, cNFT event tickets) with
          atomic USDC settlement.
          <br />
          <br />
          Seven Anchor programs are live on devnet today — full end-to-end flows,
          110+ LiteSVM tests passing. Incorporated as a UAE free-zone company.
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
        <h2 style={h2Style}>RWA tokenisation is the next trillion-dollar narrative — and nobody has shipped a compliant Solana-native stack at retail scale.</h2>
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
        <h2 style={h2Style}>RWA needs the cheapest clearing layer. Solana is the only L1 where atomic fee-splitting and cNFT issuance stay economical at retail scale.</h2>
        <ul style={listStyle}>
          <li><strong style={{ color: "#fff" }}>Settlement cost:</strong> ~$0.0001 per tx vs. $5–50 on Ethereum mainnet. A $10 ticket pays out 99.999%.</li>
          <li><strong style={{ color: "#fff" }}>Finality:</strong> &lt;1 s. Merchants never wait for confirmations.</li>
          <li><strong style={{ color: "#fff" }}>Token-2022 + Bubblegum:</strong> native compressed NFTs and transfer-hook extensions make RWA issuance + secondary markets first-class.</li>
          <li><strong style={{ color: "#fff" }}>Helius / Triton / Jito:</strong> production-grade RPC + MEV infra at commodity pricing.</li>
        </ul>
      </section>

      <section style={{ ...sectionStyle, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 14, padding: "1.75rem 2rem" }}>
        <Eyebrow>The moat — regulatory</Eyebrow>
        <h2 style={h2Style}>UAE operating company for scale. Balkan licensed subsidiary for RWA tokenisation.</h2>
        <p style={paragraphStyle}>
          Most Solana RWA plays hand-wave the legal layer. We are not. The
          operating company is incorporated in the UAE — giving us clean
          international contracting, low-friction banking, and a predictable
          tax base. For the regulated RWA issuance layer we are in the process
          of acquiring a Balkan-based licensed entity with active
          commodities-tokenisation permits; that subsidiary becomes the
          primary anchor issuer at mainnet launch.
        </p>
        <p style={paragraphStyle}>
          On-chain, Nodosol&apos;s <code style={inlineCode}>rwa_registry</code>{" "}
          whitelists issuers by jurisdiction × asset class; only Active issuers
          can mint. Additional issuers onboard one at a time after KYC. You
          cannot fork the licence — jurisdiction gating is enforced at the
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
          Counts refresh on each page load via <code style={inlineCode}>getProgramAccounts</code>. Full on-chain activity feed at{" "}
          <Link href="/stats" style={{ color: "#7b9cff" }}>/stats</Link>.
        </p>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Architecture</Eyebrow>
        <h2 style={h2Style}>Pure on-chain state + a thin web client. No backend mutates user funds.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1.5rem" }}>
          <ProgramCard label="tip_jar" role="Creator tips" high="Config + fee split + ElGamal slot reserved for V2 confidential transfers" />
          <ProgramCard label="subscription" role="Recurring billing" high="SPL token delegate pre-approves N cycles — one-click subscribe" />
          <ProgramCard label="events (legacy)" role="PDA-based tickets" high="Non-transferable; superseded by event_tickets" />
          <ProgramCard label="rwa_registry" role="Licenced issuer list" high="State machine (Pending → Active ↔ Suspended → Revoked); jurisdiction tags; asset class bitmap" />
          <ProgramCard label="rwa_mint" role="Asset tokenisation" high="Token-2022 fixed supply. Cross-program issuer check via seeds::program" />
          <ProgramCard label="marketplace" role="Public listings" high="Escrow vault pattern; atomic buy with fee split; live price updates" />
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
          10% on-chain. Treasury is a dedicated USDC ATA under multisig control
          at mainnet. Revenue scales linearly with marketplace volume; the
          creator rail adds long-tail steady-state cash flow.
        </p>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Competitive landscape</Eyebrow>
        <h2 style={h2Style}>No single platform combines RWA tokenisation, creator payments, and OTC escrow today. Incumbents are each locked into one vertical.</h2>
        <p style={paragraphStyle}>
          Closest direct analogue is <strong style={{ color: "#fff" }}>INX</strong>{" "}
          (tokenised securities marketplace) — but US-gated to accredited
          investors, no creator rail, peaked around $150M market cap. Below
          are the vertical leaders and what they miss.
        </p>

        <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <CompetitorBlock
            label="RWA tokenisation"
            body="INX, Ondo Finance, Centrifuge, Credix, Goldfinch, RealT, Arrived, Fundrise, ECX / NCX commodity exchanges."
            gap="All gated to accredited investors, institutional-only, or locked web2 fund structures. No retail commodity tokenisation with instant liquidity. No Solana-native compliant stack."
          />
          <CompetitorBlock
            label="Creator payments"
            body="Patreon (5–12% fee), Substack (10%), OnlyFans (20%), Twitch (50% on subs), Buy Me a Coffee, Ko-fi."
            gap="Per-platform processor, 2–3 day payouts, custodial balance risk, cross-border FX friction. Walled gardens — no interoperability between creator rails."
          />
          <CompetitorBlock
            label="Event tickets"
            body="Ticketmaster (20–30% take rate), Eventbrite (3.7% + $1.79 flat), StubHub, SeatGeek."
            gap="No native secondary market. Scalper monopolies. No royalty to event organiser on resale. Web2 ticket formats have no wallet-native display."
          />
          <CompetitorBlock
            label="OTC escrow"
            body="Escrow.com for generic B2B; Alibaba Trade Assurance for wholesale goods; Paxful for crypto OTC."
            gap="3-day clearing, $500+ minimums, manual dispute resolution, no atomic settlement. Crypto OTC is custodial and chain-fragmented."
          />
          <CompetitorBlock
            label="Solana-native RWA"
            body="Ondo, Maple (institutional lending), Helium (wireless tokenisation)."
            gap="None combine RWA with a creator payments rail. None offer compliant retail tokenisation of commodities / debt with a licensed issuer registry."
          />
        </div>

        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginTop: "2.25rem", marginBottom: "0.75rem" }}>
          What makes Nodosol structurally different
        </h3>
        <ul style={listStyle}>
          <li><strong style={{ color: "#fff" }}>Atomic settlement.</strong> Every trade is a single Solana tx — no T+2 clearing, no custodian holding funds.</li>
          <li><strong style={{ color: "#fff" }}>Retail-scale RWA, not accredited-only.</strong> Our licensed-issuer registry + jurisdiction gating is designed for public retail access from Day 1.</li>
          <li><strong style={{ color: "#fff" }}>RWA + creator on one rail.</strong> No incumbent combines these. The same fee infrastructure routes USDC for commodities trades and for $5 tip jars.</li>
          <li><strong style={{ color: "#fff" }}>cNFT tickets = built-in secondary market.</strong> Tensor / Magic Eden compatible from mainnet launch. Scalping becomes royalty-bearing for the event organiser.</li>
          <li><strong style={{ color: "#fff" }}>USDC-native cross-border.</strong> No FX friction on international trades — relevant for commodities markets typically denominated in USD anyway.</li>
        </ul>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.9rem", marginTop: "2rem" }}>
          <DataPoint headline="$8B" blurb="Patreon annual GMV — one vertical we substitute" />
          <DataPoint headline="$3.5B" blurb="Eventbrite annual GMV — one vertical we substitute" />
          <DataPoint headline="$50B+" blurb="Retail commodity exchange activity addressable via compliant tokenisation" />
        </div>
      </section>

      <section style={sectionStyle}>
        <Eyebrow>Founder</Eyebrow>
        <h2 style={h2Style}>Built by Mladen Rakić — 10+ years shipping production sports software used by federations, broadcasters, and licensing partners.</h2>
        <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: "1.4rem 1.5rem", marginTop: "1rem" }}>
          <h3 style={{ fontSize: "1.02rem", fontWeight: 600, marginBottom: "0.55rem" }}>Mladen Rakić · Founder, CEO</h3>
          <p style={{ fontSize: "0.92rem", color: "#b5b5b5", lineHeight: 1.65 }}>
            Solo founder with a decade of production-grade SaaS experience —
            Laravel / PostgreSQL / TypeScript / React / Next.js backbone,
            recently extended to Solana + Anchor. Warm introductions into the
            Solana Foundation network. Actively recruiting a Rust-native
            co-founder as part of the seed raise.
          </p>
          <h4 style={trackTitle}>Production systems already shipped and operating</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginTop: "0.75rem" }}>
            <TrackCard
              label="DScore.live"
              role="Live basketball scoring"
              body="Live scoring + play-by-play + box-score API. Embedded in federation operations across the Balkans. Public data API at new-api.dscore.live, scoresheet API at scoresheet-api.ds2.app."
            />
            <TrackCard
              label="DS2 (organizer.elomec.com)"
              role="Multi-tenant federation platform"
              body="FIBA-rules basketball federation SaaS: competitions, rosters, transfers, licensing, delegates, referees, scheduling, financials, discipline, integrations (Atrium, Genius Sports, Pixellot, YouTube)."
            />
            <TrackCard
              label="Scoresheet"
              role="Electronic scorer (web + mobile)"
              body="basket-ds.elomec.com. React + Vite + Capacitor + Electron for court-side operation. WebSocket scoring feed. Runs on real matches every week."
            />
            <TrackCard
              label="DS Scout"
              role="Video intelligence platform"
              body="ds-scout.com. 182+ matches indexed, auth, search, player profiles, video upload, clipping engine. Live streaming + OCR score detection on roadmap."
            />
            <TrackCard
              label="Sport Stats Admin + Desktop"
              role="Statistics pipeline"
              body="stats.ds2.app — web admin. Desktop app pushes events via match-key endpoints for offline-first scoring. PBP + box-score aggregation, league config."
            />
            <TrackCard
              label="Prediction-365"
              role="AI sports predictions"
              body="Basketball / volleyball / handball predictions. Laravel + Next.js + Python XGBoost ML engine; affiliate monetisation (Meridian, MaxBet, Mozzart, Bet365)."
            />
            <TrackCard
              label="DIGITAL Score TV"
              role="YouTube distribution"
              body="178K views / 28-day window. 3.7K+ subscribers. ~100 matches per week streamed. Pre-existing distribution funnel for Nodosol's creator rails."
            />
            <TrackCard
              label="Federation data contracts"
              role="Sports data B2B"
              body="Basketball (KSS M1/M2/F1/F2), volleyball (Sportradar non-compete expiring 2027), handball (ARKUS full rights). Direct commercial relationships with 5+ federations."
            />
          </div>
        </div>
      </section>

      <section style={{ ...sectionStyle, background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 14, padding: "1.75rem 2rem" }}>
        <Eyebrow>The ask</Eyebrow>
        <h2 style={h2Style}>$5M Seed round to ship mainnet, close the Balkan licence acquisition, and onboard the first five issuers.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginTop: "1.25rem" }}>
          <UseOfFunds
            percent="35%"
            title="Licence closing + legal"
            body="Finalise acquisition of the Balkan licensed entity under the UAE parent. Regulatory counsel in 2–3 secondary jurisdictions. UAE operating cost base keeps this efficient."
          />
          <UseOfFunds
            percent="30%"
            title="Engineering"
            body="Rust co-founder + two senior engineers (Solana mobile, data infra). External security audit across seven programs before mainnet."
          />
          <UseOfFunds
            percent="20%"
            title="Issuer + federation BD"
            body="First five anchor issuers (ag commodities, real estate, debt). Formalise federation partnerships so the sports creator rail switches on at mainnet."
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
          <Link href="/stats" style={ctaSecondaryStyle}>
            Live on-chain stats
          </Link>
          <Link href="/marketplace" style={ctaSecondaryStyle}>
            See the product
          </Link>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid #222", paddingTop: "2rem", marginTop: "2.5rem", fontSize: "0.8rem", color: "#6a6a6a", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>© 2026 Nodosol · Incorporated in the UAE · Built on Solana</div>
        <div>Last updated 2026-04-21</div>
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
      <div style={{ fontSize: "1.85rem", fontWeight: 600, letterSpacing: "-0.03em", marginBottom: "0.35rem" }}>{headline}</div>
      <div style={{ color: "#9a9a9a", fontSize: "0.88rem", lineHeight: 1.55 }}>{blurb}</div>
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

function CompetitorBlock({
  label,
  body,
  gap,
}: {
  label: string;
  body: string;
  gap: string;
}) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 12,
        padding: "1.1rem 1.25rem",
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: "1rem",
      }}
    >
      <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "#fff" }}>{label}</div>
      <div>
        <div style={{ fontSize: "0.86rem", color: "#b5b5b5", lineHeight: 1.55, marginBottom: "0.45rem" }}>
          <span style={{ color: "#8a8a8a", fontSize: "0.72rem", letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600 }}>
            Today
          </span>
          <br />
          {body}
        </div>
        <div style={{ fontSize: "0.86rem", color: "#a5b4fc", lineHeight: 1.55 }}>
          <span style={{ color: "#a5b4fc", fontSize: "0.72rem", letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600 }}>
            What they miss
          </span>
          <br />
          {gap}
        </div>
      </div>
    </div>
  );
}

function TrackCard({ label, role, body }: { label: string; role: string; body: string }) {
  return (
    <div
      style={{
        background: "#141414",
        border: "1px solid #1f1f1f",
        borderRadius: 10,
        padding: "0.9rem 1.05rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>{label}</span>
        <span style={{ fontSize: "0.74rem", color: "#8a8a8a" }}>{role}</span>
      </div>
      <div style={{ fontSize: "0.8rem", color: "#9a9a9a", lineHeight: 1.55 }}>{body}</div>
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
  fontSize: "clamp(2.2rem, 4.5vw, 3.2rem)",
  lineHeight: 1.1,
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

const trackTitle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "#8a8a8a",
  letterSpacing: 1,
  textTransform: "uppercase",
  fontWeight: 600,
  marginTop: "1.5rem",
};
