import Link from "next/link";

const LAST_UPDATED = "2026-04-27";

export function PrivacyView() {
  return (
    <div style={SHELL}>
      <article style={ARTICLE}>
        <h1 style={H1}>Privacy policy</h1>
        <p style={LEAD}>
          We try to collect as little as possible. This page is the
          accurate, plain-language list of what we do collect, why,
          where it lives, and how to make it go away.
        </p>
        <p style={STAMP}>Last updated {LAST_UPDATED}</p>

        <Section title="Who we are">
          <p>
            Nodosol is operated by ELOMEC (UAE DMCC, with El Salvador as
            backup jurisdiction). Contact for privacy questions:{" "}
            <a href="mailto:privacy@nodosol.com" style={LINK}>
              privacy@nodosol.com
            </a>
            . Security disclosures go to{" "}
            <a href="mailto:security@nodosol.com" style={LINK}>
              security@nodosol.com
            </a>
            . The full security posture lives at{" "}
            <Link href="/security" style={LINK}>
              /security
            </Link>
            .
          </p>
        </Section>

        <Section title="What we collect">
          <ul style={UL}>
            <li>
              <strong>Wallet public key.</strong> The base58 pubkey of
              every wallet you connect. This is public information on
              Solana itself.
            </li>
            <li>
              <strong>Email (optional).</strong> Only if you opt in to
              email notifications from{" "}
              <Link href="/settings/notifications" style={LINK}>
                /settings/notifications
              </Link>
              . Stored against your wallet pubkey; never sold or shared.
            </li>
            <li>
              <strong>IP address + user-agent.</strong> Captured by
              Vercel Edge for a few security paths
              (rate-limit on chat / signup / JWT issuance, error
              logging). Stored in{" "}
              <code>security_events</code> + <code>error_logs</code>{" "}
              tables.
            </li>
            <li>
              <strong>Profile content you post.</strong> Handle,
              display name, bio, avatar / banner URLs, social links,
              chat messages — all gated behind a wallet-signed JWT so
              only the owning wallet can write.
            </li>
            <li>
              <strong>On-chain transaction footprint.</strong> Every
              tip, listing, subscription, ticket purchase, OTC, and
              auction action is on-chain by design. We don&apos;t add
              anything beyond what Solana already records.
            </li>
            <li>
              <strong>Analytics (consent-gated).</strong> If
              configured, Google Analytics 4 measures aggregate
              traffic. We default consent to{" "}
              <em>denied</em> until you accept the consent banner.
              See <Link href="#analytics" style={LINK}>Analytics</Link>{" "}
              below.
            </li>
          </ul>
        </Section>

        <Section title="What we don't collect">
          <ul style={UL}>
            <li>
              <strong>No KYC.</strong> Nodosol is non-custodial. We
              never ask for legal name, ID document, or proof of
              address (the rights-marketplace vertical at{" "}
              <code>rights.nodosol.com</code> uses Sumsub for B2B KYC,
              but that&apos;s a separate product with its own privacy
              terms).
            </li>
            <li>
              <strong>No private keys / seed phrases.</strong> Your
              wallet signs everything; we never see private key
              material.
            </li>
            <li>
              <strong>No tracking pixels.</strong> No third-party
              ad-tech, no fingerprinting, no Facebook / TikTok /
              LinkedIn pixels.
            </li>
            <li>
              <strong>No analytics tied to wallet.</strong> If GA is
              enabled and you accept consent, the GA stream sees IP +
              UA + page paths but is never joined back to your wallet
              pubkey.
            </li>
          </ul>
        </Section>

        <Section title="Retention">
          <ul style={UL}>
            <li>
              <code>security_events</code>: 90 days, then auto-purged.
            </li>
            <li>
              <code>error_logs</code>: 30 days, then auto-purged.
            </li>
            <li>
              Wallet-signed JWTs: 15 minutes per token; rotated on
              every reconnect.
            </li>
            <li>
              <code>creator_profiles</code> / <code>notifications</code>{" "}
              / wishlist / price alerts: kept until you delete them or
              opt out (see <Link href="#rights" style={LINK}>your rights</Link>).
            </li>
            <li>
              On-chain state: permanent, by Solana&apos;s design. We
              cannot delete on-chain data.
            </li>
          </ul>
        </Section>

        <Section title="Sub-processors">
          <ul style={UL}>
            <li>
              <strong>Vercel</strong> — hosting + edge runtime + IP
              geolocation header.
            </li>
            <li>
              <strong>Supabase</strong> — Postgres + Edge Functions +
              storage bucket for profile media.
            </li>
            <li>
              <strong>Helius</strong> — Solana RPC + enhanced
              transaction webhook (for notifications).
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery
              (only when you opt in).
            </li>
            <li>
              <strong>Privy</strong> — embedded wallet for users who
              sign in with email.
            </li>
            <li>
              <strong>Cloudflare Turnstile</strong> — bot challenge on
              public chat writes (optional, env-gated).
            </li>
            <li>
              <strong>Google Analytics 4</strong> — consent-gated
              traffic measurement (optional, env-gated).
            </li>
          </ul>
        </Section>

        <Section title="Cookies + local storage">
          <p>
            We use <code>localStorage</code> for: wallet-signed JWT
            cache (so you don&apos;t re-sign every page), chat-thread
            signature cache (so you don&apos;t re-sign every channel),
            wishlist + onboarding-tour completion flags, locale
            preference, install-prompt dismissal. Nothing here goes to
            our servers.
          </p>
          <p>
            Server-set cookies are limited to: maintenance-bypass /
            analytics-consent / KYC-gate flags on{" "}
            <code>rights.nodosol.com</code> (separate product). The
            main app sets no tracking cookies.
          </p>
        </Section>

        <Section title="Analytics" id="analytics">
          <p>
            If <code>NEXT_PUBLIC_GA_MEASUREMENT_ID</code> is configured
            on the deployment, we ship Google Analytics 4 with{" "}
            <code>gtag(&apos;consent&apos;, &apos;default&apos;, &#123;
            ad_storage: &apos;denied&apos;, analytics_storage:
            &apos;denied&apos; &#125;)</code> set
            before any GA call fires. The consent banner only flips
            both flags to <em>granted</em> after you click Accept.
            Decline keeps GA disabled for that visit and persists in{" "}
            <code>localStorage</code> so we don&apos;t re-prompt for
            14 days. Plausible (cookieless analytics) is documented as
            an alternative for projects that prefer no consent banner
            at all.
          </p>
        </Section>

        <Section title="Your rights" id="rights">
          <ul style={UL}>
            <li>
              <strong>Export</strong> — request a JSON dump of every
              row keyed to your wallet via{" "}
              <a href="mailto:privacy@nodosol.com" style={LINK}>
                privacy@nodosol.com
              </a>
              . We aim to respond within 30 days.
            </li>
            <li>
              <strong>Delete</strong> — same channel. We&apos;ll wipe
              the off-chain rows (creator_profiles, notifications,
              wishlist, price_alerts, notification_preferences,
              chat_messages where you&apos;re sender). On-chain state
              is permanent and out of our reach.
            </li>
            <li>
              <strong>Email opt-out</strong> — every email has a
              one-click unsubscribe link. You can also disable email
              for specific notification types in{" "}
              <Link href="/settings/notifications" style={LINK}>
                /settings/notifications
              </Link>
              .
            </li>
            <li>
              <strong>Analytics opt-out</strong> — decline the
              consent banner, or set
              <code> Do Not Track</code> in your browser (we treat
              both as <em>denied</em>).
            </li>
          </ul>
        </Section>

        <Section title="Children">
          <p>
            Nodosol isn&apos;t designed for or directed at users under
            16. If you believe we have inadvertently collected data
            from a minor, email{" "}
            <a href="mailto:privacy@nodosol.com" style={LINK}>
              privacy@nodosol.com
            </a>{" "}
            and we&apos;ll delete it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            Material changes get 30 days&apos; notice via the
            announcements feed at{" "}
            <Link href="/announcements" style={LINK}>
              /announcements
            </Link>{" "}
            (when published). Smaller clarifications get a
            timestamp bump on this page.
          </p>
        </Section>

        <footer style={FOOTER}>
          {LAST_UPDATED} ·{" "}
          <Link href="/security" style={LINK}>
            Security
          </Link>{" "}
          ·{" "}
          <Link href="/terms" style={LINK}>
            Terms
          </Link>{" "}
          ·{" "}
          <a href="mailto:privacy@nodosol.com" style={LINK}>
            privacy@nodosol.com
          </a>
        </footer>
      </article>
    </div>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={SECTION}>
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
  gap: "0.4rem",
};

const H1: React.CSSProperties = {
  fontSize: "2.4rem",
  fontWeight: 800,
  letterSpacing: 0,
  marginBottom: "0.5rem",
};

const LEAD: React.CSSProperties = {
  fontSize: "1.05rem",
  lineHeight: 1.6,
  color: "var(--shell-muted, #b5b5b5)",
  marginBottom: "0.5rem",
};

const STAMP: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-faint, #6b6b6b)",
  letterSpacing: "0.04em",
  marginBottom: "1.5rem",
};

const SECTION: React.CSSProperties = {
  marginTop: "1.6rem",
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

const FOOTER: React.CSSProperties = {
  marginTop: "2.5rem",
  paddingTop: "1.5rem",
  borderTop: "1px solid var(--shell-border, #1a1a1a)",
  fontSize: "0.8rem",
  color: "var(--shell-faint, #6b6b6b)",
};
