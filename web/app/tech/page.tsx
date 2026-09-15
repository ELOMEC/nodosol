import Link from "next/link";

import { PublicPageShell } from "@/components/PublicPageShell";

import { LandingProviders } from "../LandingProviders";
import { TelemetryStrip } from "../TelemetryStrip";

export const metadata = {
  title: "nodosol — tech & security",
  description:
    "What Nodosol has shipped: nine Anchor programs, Token-2022 rails, cNFT tickets, Helius DAS, Privy embedded wallets, Squads-governed upgrades, emergency pause, signed chat, and security event telemetry.",
};

export default function TechPage() {
  return (
    <PublicPageShell active="tech">
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 0 1rem" }}>
      <section style={{ marginBottom: "3.5rem" }}>
        <Eyebrow>Tech & security</Eyebrow>
        <h1 style={h1Style}>
          Nine Anchor programs. Seven frontend verticals. One fee rail. Every
          upgrade path, pause switch, and chat message is{" "}
          <span style={{ color: "#a5b4fc" }}>signed on-chain or in a wallet</span>.
        </h1>
        <p style={leadStyle}>
          This page is for VCs doing technical DD and developers skimming
          scope. Snapshots show devnet state. Mainnet architecture is the
          same minus: audited programs, Squads multisig signers on hardware
          keys, and staged position caps.
        </p>
        <div style={{ marginTop: "1.5rem" }}>
          <LandingProviders>
            <TelemetryStrip />
          </LandingProviders>
        </div>
        <p style={{ fontSize: "0.8rem", color: "#8a8a8a", marginTop: "0.6rem" }}>
          Live on-chain counts — refresh on page load. Full activity feed at{" "}
          <Link href="/stats" style={linkStyle}>/stats</Link>.
        </p>
      </section>

      <Section title="On-chain — nine Anchor programs" eyebrow="Programs">
        <p style={paragraphStyle}>
          All nine compile on Anchor 1.0 with Solana 2.x tooling. 110+ LiteSVM
          tests pass locally; every program publishes a{" "}
          <code style={inlineCode}>security.txt</code> metadata section for
          contact on disclosure. Seven handle value flows and carry a global{" "}
          <code style={inlineCode}>paused</code> kill-switch admin instruction.
        </p>
        <div className="nds-grid-2" style={{ gap: "1rem", marginTop: "1.25rem" }}>
          <ProgramCard
            name="tip_jar"
            purpose="Creator tips"
            detail="CreatorProfile PDA + Token-2022 vault. ElGamal pubkey slot reserved for V2 confidential transfers. Paused instructions: send_tip."
          />
          <ProgramCard
            name="subscription"
            purpose="Recurring billing"
            detail="SPL token delegate pre-approves N cycles — subscriber one-click signs once for ~12 months. Plans + subscriptions + permissionless charge crank. Paused: subscribe, charge."
          />
          <ProgramCard
            name="events"
            purpose="Legacy PDA tickets"
            detail="Original non-transferable ticket PDA. Superseded by event_tickets (cNFT). Retained for existing deployments. Paused: buy_ticket."
          />
          <ProgramCard
            name="event_tickets"
            purpose="Compressed NFT tickets"
            detail="Metaplex Bubblegum cNFT leaves. Tier + seat + shareable deep-links. Atomic resale with royalty split. Private-price resale via keccak256 commit/reveal. Paused: buy_ticket (×2), buy_tier_ticket, buy_ticket_resale, buy_ticket_resale_private."
          />
          <ProgramCard
            name="rwa_registry"
            purpose="Licenced issuer list"
            detail="State machine: Pending → Active ↔ Suspended → Revoked. Per-issuer jurisdiction tags (max 8 × ISO codes) + asset class bitmap (Commodity, RealEstate, Debt, Equity, Ticket, Carbon, Other)."
          />
          <ProgramCard
            name="rwa_mint"
            purpose="Asset tokenisation"
            detail="Token-2022 fixed supply. Mint authority revoked on tokenize (set_authority → None). Cross-program issuer verification via seeds::program — only Active issuers for the category can mint."
          />
          <ProgramCard
            name="marketplace"
            purpose="Public listings"
            detail="Escrow vault pattern. Atomic buy with fee split. Admin-configurable fee (capped 10%), default 2.5%. update_listing_price + cancel_listing. Paused: buy_listing."
          />
          <ProgramCard
            name="otc_deals"
            purpose="Bilateral escrow"
            detail="Counter-party-specific proposal, dual-party escrow, 1-min to 30-day expiry window. memo_hash slot for Supabase chat thread reference. Permissionless expire crank. Paused: accept_deal."
          />
          <ProgramCard
            name="auctions"
            purpose="Sealed-bid auctions"
            detail="Commit phase (keccak256 of bid + nonce) → reveal phase → permissionless settle. USDC escrow with fee split. Refund path for losing bidders. Paused: settle_auction."
          />
        </div>
      </Section>

      <Section title="Shared on-chain patterns" eyebrow="Architecture">
        <div className="nds-grid-2" style={{ gap: "1rem", marginTop: "1rem" }}>
          <Pattern
            title="Config PDA per program"
            body="Single authority-gated admin surface: initialize_config, update_fee_bps, update_treasury, update_config_authority, update_pause. Treasury is a USDC ATA; authority will be a Squads multisig on mainnet. Backward-compat layout — new paused flag slots into reserved bytes."
          />
          <Pattern
            title="Fee split on every value flow"
            body="fee = amount × fee_bps / 10_000. Stats track creator-share (not gross) so analytics stay accurate. Fee cap 1000 bps (10%) enforced on-chain."
          />
          <Pattern
            title="Escrow vault PDA"
            body="Used by marketplace, otc_deals, auctions, event_tickets resale. Tokens park in a program-owned ATA. Settlement is a single transaction — no custodian window. Programmatic signer seeds prevent any path to drain-by-authority."
          />
          <Pattern
            title="Permissionless cranks"
            body="Subscription charges, auction settlement, OTC deal expiry, and tier-seat GC (pg_cron) all crank on demand from any wallet. No central scheduler."
          />
          <Pattern
            title="Keccak256 commit / reveal"
            body="Used by private-price ticket resale and sealed-bid auctions. Hides price / bid until reveal. Bonus: MEV-resistant for auctions."
          />
          <Pattern
            title="Emergency pause (new)"
            body="Every fund-moving instruction gated on config.paused. Squads multisig can pause a program in one transaction while a patch rolls out. Withdraw-type instructions stay open so creators can drain their vaults."
          />
        </div>
      </Section>

      <Section title="Frontend — seven marketplace surfaces" eyebrow="Product">
        <div className="nds-grid-2" style={{ gap: "1rem" }}>
          <Surface
            name="/marketplace"
            role="RWA tile browse"
            detail="Category + delivery + jurisdiction filters. Sort by price / newest / supply. Live counts from getProgramAccounts. Listing cards show issuer jurisdictions as compliance-at-a-glance chips."
          />
          <Surface
            name="/marketplace/assets/[mint]"
            role="Asset detail"
            detail="Full metadata (gallery, video, location with polygon overlay, attributes). All active + closed listings. OTC activity history. Self-list flow with modal. Edit price + cancel for own listings. Contact owner DM."
          />
          <Surface
            name="/marketplace/events"
            role="Event browse"
            detail="Live selling + upcoming events. cNFT ticket with seat picker for venues with a floor plan. Per-event dashboard for creators."
          />
          <Surface
            name="/marketplace/auctions"
            role="Sealed-bid auctions"
            detail="Phase-aware UI (commit / reveal / settle-ready / terminal). Your bid envelope cached locally so you never lose the reveal. Permissionless settle + refund buttons."
          />
          <Surface
            name="/marketplace/rentals"
            role="Rental plans"
            detail="Monthly / custom-period rental subscriptions on the subscription program. Landlord dashboard for withdrawal. Tenant My Rentals page with next-charge countdown."
          />
          <Surface
            name="/marketplace/otc"
            role="Bilateral deals"
            detail="Propose / accept / cancel with per-deal Supabase chat. Private-price envelope mode. Expiry presets (1h → 30d) with SHA-256 memo linking to chat thread."
          />
          <Surface
            name="/marketplace/portfolio"
            role="Wallet-aware dashboard"
            detail="Unified view: RWA holdings (ATA balances joined with Asset PDAs), event tickets (Helius DAS), active listings. One page to see everything your wallet owns."
          />
        </div>
      </Section>

      <Section title="Chat — signed, persisted, rate-limited" eyebrow="Community">
        <p style={paragraphStyle}>
          In-app chat runs on Supabase with strict RLS gated by wallet-signed
          JWTs. Nothing mutates on the server without a valid wallet signature.
          Three thread kinds cover every conversation surface:
        </p>
        <div className="nds-grid-3" style={{ gap: "1rem", marginTop: "1rem" }}>
          <ChatKind
            label="otc_deal"
            body="Per on-chain OTC deal. Seller and buyer only. memo_hash is the on-chain deal key."
          />
          <ChatKind
            label="listing_dm"
            body="Private 1:1 between any buyer and any listing's seller. memo_hash = sha256(listing:<kind>:<pda>:<min>:<max>) — server re-derives and rejects mismatches."
          />
          <ChatKind
            label="group"
            body="Seven seeded public channels (#general, #tickets, #rentals, #auctions, #rwa, #showcase, #deals). Turnstile anti-spam + per-sender rate limit."
          />
        </div>
        <p style={paragraphStyle}>
          Writes go through an Edge Function that verifies an ed25519 signature
          over a challenge tied to the thread and a ~15-minute timestamp. Reads
          use a short-lived JWT (15 min TTL) minted after a separate signed
          challenge. Both artefacts cache in localStorage per-wallet so one
          wallet interaction bootstraps an hour of browsing without further
          popups.
        </p>
      </Section>

      <Section title="Security posture" eyebrow="Ops">
        <div className="nds-grid-2" style={{ gap: "1rem" }}>
          <SecurityBlock
            title="Upgrade authority"
            body="All nine programs' upgrade authority live on a Squads 2-of-3 multisig. Every deploy is a proposal that needs two independent signatures. Single-key compromise no longer hijacks programs. Runbook at docs/SECURITY_RUNBOOK.md."
          />
          <SecurityBlock
            title="Emergency pause"
            body="Authority-gated update_pause instruction on seven programs freezes all fund-moving entry points in a single Squads proposal. Withdraw / close paths stay open so users can still drain vaults. No custodian flag-flip."
          />
          <SecurityBlock
            title="Signed chat auth"
            body="Every chat write is an ed25519 signature over a thread-bound, time-bound challenge. Reads are gated by a Supabase JWT minted only after a separate signature. JWT is rotatable in minutes."
          />
          <SecurityBlock
            title="Turnstile + rate limit"
            body="Group chat writes gate on Cloudflare Turnstile (managed mode; invisible for trusted traffic) plus a per-wallet 30-messages-per-5-minutes cap. Sybil requires funded wallets — not free."
          />
          <SecurityBlock
            title="Security event telemetry"
            body="security_events table logs sig_verify_fail, challenge_expired, rate_limit_hit, turnstile_fail, jwt_issued. Two convenience views for hot-wallet burst detection and 24h abuse triage. Service-role only."
          />
          <SecurityBlock
            title="security.txt"
            body="All nine programs embed the Squads security.txt format with disclosure contact (security@nodosol.com). Lets researchers reach us without guessing."
          />
        </div>
        <p style={{ fontSize: "0.85rem", color: "#8a8a8a", marginTop: "1.25rem" }}>
          Pending, in order of priority: external audit (OtterSec / Neodyme /
          Zellic, 4-8 week wait list), mainnet multisig with hardware signers,
          staged rollout with position caps. Bug bounty program post-audit.
        </p>
      </Section>

      <Section title="Stack & infrastructure" eyebrow="Tech stack">
        <StackTable
          rows={[
            ["Programs", "Anchor 1.0, Solana program SDK 2.x, Rust 1.89"],
            ["Tokens", "Token-2022 (fixed supply, confidential-ready)"],
            ["cNFT", "Metaplex Bubblegum + SPL Account Compression"],
            ["Indexer", "Helius DAS API for wallet-owned cNFT lookups"],
            ["Frontend", "Next.js 15 + React 19 + TypeScript (strict)"],
            ["Wallets", "@solana/wallet-adapter (Phantom, Backpack) + Privy embedded"],
            ["RPC", "Devnet default; Helius / Triton on mainnet"],
            ["Off-chain", "Supabase: Postgres + RLS, Edge Functions (Deno), Storage for media"],
            ["Maps", "Google Maps JS API + Places + Drawing (for polygons)"],
            ["Tests", "LiteSVM (program tests), Vitest (TS)"],
            ["CI", "GitHub Actions: anchor build + cargo test + web typecheck/lint/build"],
            ["Hosting", "Vercel (web), Supabase (backend)"],
            ["Monitoring", "security_events Supabase table + queries; console telemetry"],
          ]}
        />
      </Section>

      <Section title="What shipped since last update" eyebrow="Changelog · 2026-04-24">
        <ul style={listStyle}>
          <li><strong>In-app chat:</strong> OTC threads, per-listing DMs, and seven public channels. Signed ed25519 writes, JWT-gated reads, localStorage persistence.</li>
          <li><strong>Asset detail page:</strong> gallery + video + location + attributes + OTC activity + self-list flow + edit/cancel for own listings + Contact owner DM.</li>
          <li><strong>Marketplace jurisdictions filter:</strong> joins issuer PDAs into the listing index, filters by ISO code, compliance chips on cards.</li>
          <li><strong>Emergency pause across 7 programs:</strong> update_pause admin ix gated on Config authority (Squads multisig).</li>
          <li><strong>Squads multisig migration:</strong> upgrade authority of all 9 programs moved to 2-of-3 Squads vault on devnet.</li>
          <li><strong>Security event log:</strong> security_events table + Edge Function writes + hot-wallet views.</li>
          <li><strong>UX hardening:</strong> toast system + friendly error decoder, unified dark theme, responsive stat grids, search + chat in sidebar nav, 65+ alerts migrated to toasts.</li>
          <li><strong>Chat session persistence:</strong> JWT + per-thread sig cached per-wallet in localStorage — one wallet popup per hour of active chat instead of per page load.</li>
        </ul>
      </Section>

      <footer style={footerStyle}>
        <div>© 2026 Nodosol · Incorporated in the UAE · Built on Solana</div>
        <div>Last updated 2026-04-24</div>
      </footer>
      </div>
    </PublicPageShell>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "3.5rem" }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 style={h2Style}>{title}</h2>
      {children}
    </section>
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

function ProgramCard({
  name,
  purpose,
  detail,
}: {
  name: string;
  purpose: string;
  detail: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.45rem", flexWrap: "wrap" }}>
        <code style={programLabelStyle}>{name}</code>
        <span style={{ fontSize: "0.78rem", color: "#8a8a8a" }}>{purpose}</span>
      </div>
      <div style={{ fontSize: "0.85rem", color: "#b5b5b5", lineHeight: 1.6 }}>{detail}</div>
    </div>
  );
}

function Pattern({ title, body }: { title: string; body: string }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: "0.98rem", fontWeight: 600, marginBottom: "0.5rem" }}>{title}</h3>
      <p style={{ color: "#b5b5b5", fontSize: "0.88rem", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function Surface({ name, role, detail }: { name: string; role: string; detail: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
        <code style={{ ...programLabelStyle, color: "#c7d2fe" }}>{name}</code>
        <span style={{ fontSize: "0.76rem", color: "#8a8a8a" }}>{role}</span>
      </div>
      <div style={{ fontSize: "0.85rem", color: "#b5b5b5", lineHeight: 1.6 }}>{detail}</div>
    </div>
  );
}

function ChatKind({ label, body }: { label: string; body: string }) {
  return (
    <div style={cardStyle}>
      <code style={{ ...programLabelStyle, marginBottom: "0.4rem", display: "inline-block" }}>{label}</code>
      <div style={{ fontSize: "0.85rem", color: "#b5b5b5", lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function SecurityBlock({ title, body }: { title: string; body: string }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem", color: "#c7d2fe" }}>{title}</h3>
      <p style={{ color: "#b5b5b5", fontSize: "0.86rem", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function StackTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div
      style={{
        ...cardStyle,
        padding: "0.4rem 0",
      }}
    >
      {rows.map(([k, v], i) => (
        <div
          key={k}
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "1rem",
            padding: "0.7rem 1.2rem",
            borderBottom: i === rows.length - 1 ? "none" : "1px solid rgba(255,255,255,0.06)",
            fontSize: "0.86rem",
          }}
        >
          <span style={{ color: "#8a8a8a", fontWeight: 500 }}>{k}</span>
          <span style={{ color: "#b5b5b5" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

const h1Style: React.CSSProperties = {
  fontSize: "2rem",
  lineHeight: 1.15,
  letterSpacing: 0,
  fontWeight: 600,
  marginBottom: "1.25rem",
};

const h2Style: React.CSSProperties = {
  fontSize: "1.55rem",
  lineHeight: 1.25,
  letterSpacing: 0,
  fontWeight: 600,
  marginBottom: "0.75rem",
};

const leadStyle: React.CSSProperties = {
  fontSize: "1.05rem",
  color: "#b5b5b5",
  lineHeight: 1.65,
  maxWidth: 760,
};

const paragraphStyle: React.CSSProperties = {
  fontSize: "0.95rem",
  color: "#b5b5b5",
  lineHeight: 1.7,
  marginTop: "0.75rem",
};

const listStyle: React.CSSProperties = {
  marginTop: "0.75rem",
  paddingLeft: "1.25rem",
  color: "#b5b5b5",
  fontSize: "0.92rem",
  lineHeight: 1.75,
};

const cardStyle: React.CSSProperties = {
  background: "#0f0f0f",
  border: "1px solid #1a1a1a",
  borderRadius: 12,
  padding: "1.1rem 1.25rem",
};

const programLabelStyle: React.CSSProperties = {
  fontFamily: "'SF Mono', Menlo, monospace",
  fontSize: "0.92rem",
  fontWeight: 600,
  color: "#7b9cff",
};

const inlineCode: React.CSSProperties = {
  background: "#1a1a1a",
  color: "#a5b4fc",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.82em",
  fontFamily: "'SF Mono', Menlo, monospace",
};

const linkStyle: React.CSSProperties = {
  color: "#7b9cff",
  textDecoration: "none",
};

const footerStyle: React.CSSProperties = {
  borderTop: "1px solid #222",
  paddingTop: "2rem",
  marginTop: "2.5rem",
  fontSize: "0.8rem",
  color: "#6a6a6a",
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "1rem",
};
