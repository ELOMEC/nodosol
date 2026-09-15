import Link from "next/link";

const LINK: React.CSSProperties = {
  color: "#7b9cff",
  textDecoration: "underline",
};

const QUESTIONS: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: "What is Nodosol?",
    a: (
      <>
        Nodosol is a Solana super-app for compliant real-world-asset
        marketplaces and creator payments. Tip in USDC, sell event
        tickets as cNFTs, run subscription plans, list rentals, trade
        OTC, run sealed-bid auctions, and tokenize commodities under
        a registered issuer — all with on-chain settlement and
        Squads-multisig-governed program upgrades.
      </>
    ),
  },
  {
    q: "Do I need crypto knowledge to use it?",
    a: (
      <>
        No. The <Link href="/welcome" style={LINK}>Get started</Link>{" "}
        flow lets you sign in with email — Privy creates an embedded
        Solana wallet under the hood. You never see seed phrases.
        Power users can connect Phantom or Backpack instead.
      </>
    ),
  },
  {
    q: "What chains does it support?",
    a: (
      <>
        Solana only. Token-2022 USDC is the payment rail across every
        program. Cross-chain bridges are out of scope; if you hold
        ETH or SOL, the on-ramp inside Privy quotes you a Solana USDC
        purchase directly.
      </>
    ),
  },
  {
    q: "Is it audited?",
    a: (
      <>
        Pre-engagement. We&apos;re in active outreach with OtterSec,
        Neodyme, and Zellic for a Q3 2026 audit window covering all
        nine Anchor programs. Mainnet deploy is gated on audit close.
        Full security posture at{" "}
        <Link href="/security" style={LINK}>/security</Link>.
      </>
    ),
  },
  {
    q: "How do tips work?",
    a: (
      <>
        Each creator has an on-chain Token-2022 vault. Visitors hit
        the <strong>Tip in USDC</strong> button on{" "}
        <code>nodosol.com/c/&lt;handle&gt;</code>, sign a single
        transaction, and USDC moves directly into the vault. The
        creator withdraws to their wallet whenever — no
        platform-side custody.
      </>
    ),
  },
  {
    q: "What does Nodosol charge?",
    a: (
      <>
        Devnet: 0%. The fee infrastructure is fully wired (Config
        PDA per program, treasury-routed USDC split) but{" "}
        <code>fee_bps</code> is set to <strong>0</strong> on every
        program. We turn it on incrementally per surface post-audit
        — likely 1–3% on the marketplace + auctions, lower on
        creator-economy paths.
      </>
    ),
  },
  {
    q: "Are tickets transferable?",
    a: (
      <>
        Events that initialise a Bubblegum compressed-NFT tree mint
        transferable cNFTs into buyer wallets — those work in
        Phantom Collectibles, Tensor, Magic Eden, etc. Events
        without a tree fall back to non-transferable PDA tickets
        (creator&apos;s call at event creation).
      </>
    ),
  },
  {
    q: "What happens if a subscription plan creator goes inactive?",
    a: (
      <>
        Subscriptions live on the SPL delegate authorisation the
        subscriber pre-approved at signup time (default 12 cycles).
        If the creator does nothing, charges keep firing on schedule
        until the delegate runs out. Subscribers can cancel any
        time from <code>/marketplace/rentals/my</code> or the
        plan&apos;s subscription detail.
      </>
    ),
  },
  {
    q: "Can I refund a tip or cancel a sale?",
    a: (
      <>
        No. Tips, ticket purchases, and accepted OTC deals are
        atomic on-chain and final. We don&apos;t hold an escrow
        layer that could reverse them — that&apos;s a deliberate
        choice to stay non-custodial. Reach out to the seller
        directly if it was a mistake.
      </>
    ),
  },
  {
    q: "What is the OTC desk for?",
    a: (
      <>
        Private 1-on-1 deals between two specific wallets. Useful
        for negotiated RWA sales, off-list ticket transfers, or any
        trade where the parties want chat-mediated terms before
        committing on-chain. The deal vault holds both sides until
        the buyer accepts; cancel or expiry refunds atomically.
      </>
    ),
  },
  {
    q: "How do I become a licenced issuer?",
    a: (
      <>
        Issuer onboarding is gated on jurisdiction-specific licences
        we hold. Contact <strong>licencing@nodosol.com</strong> with
        your asset class (commodity, real estate, debt, etc.) and
        target jurisdiction. We&apos;ll route you to the right
        contract template and the registry-side onboarding flow.
      </>
    ),
  },
  {
    q: "I think I found a bug. Where do I report it?",
    a: (
      <>
        Security issues:{" "}
        <a href="mailto:security@nodosol.com" style={LINK}>
          security@nodosol.com
        </a>{" "}
        with the subject line <code>[security]</code> — see{" "}
        <Link href="/security" style={LINK}>/security</Link> for the
        full responsible-disclosure policy. Other bugs / feature
        requests: GitHub issues at{" "}
        <a
          href="https://github.com/ELOMEC/nodosol/issues"
          target="_blank"
          rel="noreferrer"
          style={LINK}
        >
          ELOMEC/nodosol
        </a>
        .
      </>
    ),
  },
];

export function FaqView() {
  return (
    <div style={SHELL}>
      <article style={ARTICLE}>
        <h1 style={H1}>FAQ</h1>
        <p style={LEAD}>
          The 12 questions we hear most. Need something not covered
          here? Reach <strong>support@nodosol.com</strong>.
        </p>

        {QUESTIONS.map((row, i) => (
          <details key={row.q} style={DETAILS} open={i === 0}>
            <summary style={SUMMARY}>{row.q}</summary>
            <div style={ANSWER}>{row.a}</div>
          </details>
        ))}

        <footer style={FOOTER}>
          More: <Link href="/security" style={LINK}>/security</Link>.
        </footer>
      </article>
    </div>
  );
}

const SHELL: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "0 0 1rem",
  color: "var(--shell-fg, #e8e8e8)",
  background: "transparent",
};

const ARTICLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
};

const H1: React.CSSProperties = {
  fontSize: "2.4rem",
  fontWeight: 800,
  letterSpacing: 0,
  marginBottom: "0.5rem",
};

const LEAD: React.CSSProperties = {
  fontSize: "1rem",
  lineHeight: 1.6,
  color: "var(--shell-muted, #b5b5b5)",
  marginBottom: "1.5rem",
};

const DETAILS: React.CSSProperties = {
  border: "1px solid var(--shell-border, #1f242d)",
  borderRadius: 16,
  padding: "0.95rem 1.1rem",
  background: "var(--shell-card, #11141a)",
  boxShadow: "0 16px 45px rgba(15, 23, 42, 0.06)",
};

const SUMMARY: React.CSSProperties = {
  cursor: "pointer",
  fontSize: "1rem",
  fontWeight: 600,
  color: "var(--shell-fg, #eef0f3)",
  listStyle: "none",
  outline: "none",
};

const ANSWER: React.CSSProperties = {
  marginTop: "0.75rem",
  paddingTop: "0.75rem",
  borderTop: "1px solid var(--shell-divider, #1a1a1a)",
  fontSize: "0.95rem",
  lineHeight: 1.6,
  color: "var(--shell-muted, #c5cbd4)",
};

const FOOTER: React.CSSProperties = {
  marginTop: "2.5rem",
  paddingTop: "1.5rem",
  borderTop: "1px solid var(--shell-border, #1a1a1a)",
  fontSize: "0.85rem",
  color: "var(--shell-muted, #b5b5b5)",
  textAlign: "center" as const,
};
