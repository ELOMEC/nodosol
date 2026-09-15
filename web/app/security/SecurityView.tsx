const CONTACT_EMAIL = "security@nodosol.com";
const GITHUB_URL = "https://github.com/ELOMEC/nodosol";
const PROGRAM_IDS: Array<{ name: string; id: string }> = [
  { name: "tip_jar", id: "C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P" },
  { name: "subscription", id: "8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w" },
  { name: "events", id: "4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax" },
  { name: "event_tickets", id: "FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE" },
  { name: "marketplace", id: "69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ" },
  { name: "otc_deals", id: "FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz" },
  { name: "rwa_registry", id: "7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT" },
  { name: "rwa_mint", id: "HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU" },
  { name: "auctions", id: "6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v" },
];

export function SecurityView() {
  return (
    <div style={SHELL}>
      <article style={ARTICLE}>
        <h1 style={H1}>Security</h1>
        <p style={LEAD}>
          Nodosol takes security seriously. This page summarises our posture,
          how to report vulnerabilities, and the contact channel under which
          we coordinate disclosure.
        </p>

        <Section title="Contact">
          <p>
            Email <a href={`mailto:${CONTACT_EMAIL}`} style={LINK}>{CONTACT_EMAIL}</a> with the subject
            line <code>[security]</code> and a reproduction. PGP not yet
            published — coordination over email is acceptable for the
            current devnet phase.
          </p>
        </Section>

        <Section title="Responsible disclosure">
          <ul style={UL}>
            <li>
              Email us <em>before</em> any public posting, social, or write-up.
              We aim to acknowledge within 48h and patch high-impact issues
              within 14 days.
            </li>
            <li>
              Do not run destructive tests against accounts you don&apos;t own.
              On devnet, fund-loss tests against your own wallets are fine
              and welcome.
            </li>
            <li>
              We do not currently run a paid bounty programme. Severe
              issues that materially protect user funds are eligible for a
              discretionary reward — discussed case-by-case at disclosure.
            </li>
            <li>
              Once patched, we credit reporters in the README + CHANGELOG
              unless you ask to remain anonymous.
            </li>
          </ul>
        </Section>

        <Section title="Audit status">
          <p>
            Pre-engagement. We are in active outreach with{" "}
            <a href="https://osec.io/" target="_blank" rel="noreferrer" style={LINK}>OtterSec</a>,{" "}
            <a href="https://neodyme.io/" target="_blank" rel="noreferrer" style={LINK}>Neodyme</a>,{" "}
            and{" "}
            <a href="https://www.zellic.io/" target="_blank" rel="noreferrer" style={LINK}>Zellic</a>{" "}
            for a Q3 2026 engagement window. Scope: nine Anchor programs
            covering tipping, subscriptions, ticketed events, RWA
            tokenisation + marketplace, OTC escrow, and sealed-bid
            auctions. Mainnet deploy is gated on audit close.
          </p>
        </Section>

        <Section title="On-chain authority model">
          <ul style={UL}>
            <li>
              <strong>Squads 2-of-3 multisig</strong> holds the upgrade
              authority on every Anchor program (devnet). The single
              dev keypair retains zero unilateral upgrade power. Mainnet
              will use a 3-of-5 with hardware signers.
            </li>
            <li>
              <strong>Global pause kill-switch</strong> on seven
              fund-moving programs (tip_jar, subscription, events,
              event_tickets, marketplace, otc_deals, auctions). The
              Squads-controlled config authority can pause every fund
              flow with a single multisig proposal.
            </li>
            <li>
              <strong>Per-program <code>solana_security_txt</code></strong>{" "}
              embeds this page + the contact email directly in each
              program binary so explorers / scanners discover them
              automatically.
            </li>
          </ul>
        </Section>

        <Section title="Off-chain hardening">
          <ul style={UL}>
            <li>
              <strong>Wallet-signed JWTs</strong> gate every authenticated
              Supabase write (HS256, 15-minute TTL).
            </li>
            <li>
              <strong>RLS-by-default</strong> on every Supabase table
              keyed off <code>auth.jwt()-&gt;&gt;&apos;sub&apos;</code>{" "}
              matching wallet pubkey. Edge Functions use the service-role
              key only when the action requires bypass (e.g. audit
              logging).
            </li>
            <li>
              <strong>security_events</strong> append-only log captures
              <code>sig_verify_fail</code>, <code>rate_limit_hit</code>,{" "}
              <code>turnstile_fail</code>, <code>jwt_issued</code>,{" "}
              <code>email_unsubscribed</code>. Visible to ops via the
              admin panel.
            </li>
            <li>
              <strong>CSP + security headers</strong> (X-Content-Type-Options,
              X-Frame-Options, Referrer-Policy, Permissions-Policy) ship
              on every route. CSP is currently in report-only mode with
              an enforcement flip planned after the public-traffic
              shake-out.
            </li>
            <li>
              <strong>Cloudflare Turnstile</strong> protects group-chat
              writes (configurable; gracefully skips when env unset).
            </li>
          </ul>
        </Section>

        <Section title="Program IDs">
          <p style={{ marginBottom: "0.6rem", color: "var(--shell-muted)" }}>
            Devnet — mainnet IDs publish at audit close.
          </p>
          <ul style={UL}>
            {PROGRAM_IDS.map((p) => (
              <li key={p.name}>
                <code style={MONO}>{p.name}</code>
                {" — "}
                <a
                  href={`https://explorer.solana.com/address/${p.id}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  style={LINK}
                >
                  {p.id}
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Out of scope">
          <ul style={UL}>
            <li>Issues affecting third-party wallets (Phantom, Backpack) — report upstream.</li>
            <li>Rate-limiting / brute-force on RPC endpoints we don&apos;t operate.</li>
            <li>Devnet-only economic exploits (no real value at risk).</li>
            <li>Reports requiring physical access, social engineering of the team, or stolen secrets.</li>
          </ul>
        </Section>

        <footer style={FOOTER}>
          Last updated 2026-04-27. Source:{" "}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" style={LINK}>
            github.com/ELOMEC/nodosol
          </a>
          .
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={SECTION}>
      <h2 style={H2}>{title}</h2>
      <div style={SECTION_BODY}>{children}</div>
    </section>
  );
}

const SHELL: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "0 0 1rem",
  color: "var(--shell-fg, #e8e8e8)",
  background: "transparent",
};

const ARTICLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

const H1: React.CSSProperties = {
  fontSize: "2.4rem",
  fontWeight: 800,
  letterSpacing: 0,
  marginBottom: "0.6rem",
};

const LEAD: React.CSSProperties = {
  fontSize: "1.05rem",
  lineHeight: 1.6,
  color: "var(--shell-muted, #b5b5b5)",
  marginBottom: "1.5rem",
};

const SECTION: React.CSSProperties = {
  marginTop: "1.4rem",
};

const H2: React.CSSProperties = {
  fontSize: "1.15rem",
  fontWeight: 600,
  marginBottom: "0.6rem",
  color: "var(--shell-fg, #eef0f3)",
};

const SECTION_BODY: React.CSSProperties = {
  fontSize: "0.95rem",
  lineHeight: 1.6,
  color: "var(--shell-muted, #c5cbd4)",
};

const UL: React.CSSProperties = {
  paddingLeft: "1.2rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const LINK: React.CSSProperties = {
  color: "#7b9cff",
  textDecoration: "underline",
};

const MONO: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.86rem",
  color: "var(--shell-fg, #eef0f3)",
};

const FOOTER: React.CSSProperties = {
  marginTop: "2.5rem",
  paddingTop: "1.5rem",
  borderTop: "1px solid var(--shell-border, #1a1a1a)",
  fontSize: "0.8rem",
  color: "var(--shell-faint, #6b6b6b)",
};
