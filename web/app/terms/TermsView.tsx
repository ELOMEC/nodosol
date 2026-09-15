import Link from "next/link";

const LAST_UPDATED = "2026-04-27";

export function TermsView() {
  return (
    <div style={SHELL}>
      <article style={ARTICLE}>
        <h1 style={H1}>Terms of service</h1>
        <p style={LEAD}>
          Plain-language summary first, formal language where the
          legal points need it. By using nodosol.com you agree to
          everything below.
        </p>
        <p style={STAMP}>Last updated {LAST_UPDATED}</p>

        <Section title="1. Eligibility">
          <p>
            You must be at least 16 years old to use Nodosol and at
            least 18 to participate in any flow that involves payment
            (tipping, subscriptions, ticket purchases, marketplace
            trades, OTC, auctions). You must not be:
          </p>
          <ul style={UL}>
            <li>
              A resident of the United States. We block US traffic at
              the edge until our licencing path closes; bypassing the
              block (VPN, falsified location) is a breach of these
              terms.
            </li>
            <li>
              A resident of any OFAC-sanctioned country (currently
              Cuba, Iran, North Korea, Russia, Syria) or any
              jurisdiction where the service is otherwise prohibited.
            </li>
            <li>
              A person on any sanctions list (OFAC SDN, EU consolidated,
              UN Security Council).
            </li>
          </ul>
          <p>
            By connecting a wallet you represent and warrant that
            none of the above apply to you.
          </p>
        </Section>

        <Section title="2. What Nodosol provides">
          <p>
            Nodosol is a Solana super-app combining creator payments
            (tipping, subscriptions, ticketed events) with a
            real-world-asset marketplace (RWA tokenisation, fixed-price
            listings, OTC escrow, sealed-bid auctions). All settlement
            is on-chain and denominated in USDC; we never custody user
            funds.
          </p>
          <p>
            See <Link href="/security" style={LINK}>/security</Link> for
            the security posture and program IDs.
          </p>
        </Section>

        <Section title="3. Wallets + self-custody">
          <ul style={UL}>
            <li>
              Your wallet is your responsibility. We never see private
              keys, seed phrases, or recovery material.
            </li>
            <li>
              We are not a money services business, money transmitter,
              broker-dealer, custodian, or exchange. Funds move
              directly between user wallets and on-chain program
              vaults.
            </li>
            <li>
              Lost or compromised wallets cannot be reset by us. If
              you sign a malicious transaction, we cannot reverse it.
            </li>
          </ul>
        </Section>

        <Section title="4. No investment advice">
          <p>
            Nothing on Nodosol is investment, legal, accounting, or
            tax advice. Tokenised RWAs, sealed-bid auctions, and
            subscription plans may carry risk we don&apos;t mitigate.
            Do your own research; talk to qualified professionals.
          </p>
        </Section>

        <Section title="5. Prohibited uses">
          <p>You agree not to:</p>
          <ul style={UL}>
            <li>
              Operate from a country where the service is prohibited
              (see Eligibility).
            </li>
            <li>
              Use Nodosol to launder funds, finance terrorism, evade
              sanctions, or violate any law.
            </li>
            <li>
              Mix, tumble, or layer transactions through Nodosol —
              the platform is not a privacy tool, and we will report
              suspected mixing to the relevant authorities.
            </li>
            <li>
              Run scams, fraud schemes, fake events, or paid-for
              endorsements without disclosure.
            </li>
            <li>
              Attempt to break the platform: exploit smart-contract
              bugs, brute-force endpoints, scrape at high volume,
              spoof headers to evade geo-blocks, etc. Responsible
              disclosure of vulnerabilities is welcome via{" "}
              <a href="mailto:security@nodosol.com" style={LINK}>
                security@nodosol.com
              </a>{" "}
              (see <Link href="/security" style={LINK}>/security</Link>{" "}
              for the policy).
            </li>
            <li>
              Impersonate another person, project, or entity. Handle
              squatting on a creator profile may be reclaimed.
            </li>
            <li>
              List or trade content you don&apos;t own / don&apos;t
              have rights to (counterfeit goods, pirated media,
              unlicenced securities).
            </li>
          </ul>
        </Section>

        <Section title="6. Creator content + IP">
          <ul style={UL}>
            <li>
              You retain ownership of everything you post: handle,
              display name, bio, avatars, ticket art, asset metadata,
              chat messages.
            </li>
            <li>
              By posting, you grant Nodosol a non-exclusive,
              royalty-free licence to display, host, and serve your
              content as part of the service. Strictly the minimum
              needed to render your profile + listings to the public.
              We don&apos;t resell, repurpose, or train ML on your
              content.
            </li>
            <li>
              If you tokenise an RWA, the legal ownership of the
              underlying asset is governed by the issuer&apos;s
              registration paperwork — Nodosol is the on-chain rail,
              not the title authority.
            </li>
          </ul>
        </Section>

        <Section title="7. Fees">
          <p>
            Devnet: 0% on every program. Mainnet (post-audit) we may
            charge a per-surface platform fee, capped at 10% by the
            on-chain Config PDA. Any change is on-chain
            (an <code>update_fee_bps</code> tx, multisig-governed) and
            announced via{" "}
            <Link href="/announcements" style={LINK}>
              /announcements
            </Link>{" "}
            with at least 14 days&apos; notice.
          </p>
        </Section>

        <Section title="8. Account termination">
          <p>
            We may suspend or remove off-chain content (creator profile,
            chat, wishlist, alerts) for breach of these terms,
            sanction-list match, or sustained abuse — with notice to
            the email on file when one exists. On-chain state is not
            ours to remove; you retain whatever rights the underlying
            programs grant.
          </p>
        </Section>

        <Section title="9. Warranty disclaimer">
          <p>
            The service is provided <strong>as-is</strong> without
            warranties of any kind. Solana RPC outages, deploy
            windows, third-party wallet bugs, and market volatility
            are out of our control. We don&apos;t warrant that
            specific transactions confirm at specific times or that
            specific listings remain available.
          </p>
        </Section>

        <Section title="10. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Nodosol&apos;s
            aggregate liability for any claim arising from your use of
            the service is capped at <strong>USD 100 or the platform
            fees you actually paid us in the 12 months preceding the
            claim, whichever is greater</strong>. We are not liable for
            indirect, consequential, exemplary, or punitive damages —
            including lost profits, lost data, or lost wallet contents
            — even if advised of the possibility.
          </p>
        </Section>

        <Section title="11. Governing law + disputes">
          <p>
            These terms are governed by the laws of the United Arab
            Emirates (DMCC free zone). Any dispute will be resolved by
            binding arbitration at the DIAC (Dubai International
            Arbitration Centre) seated in Dubai, in English, by a
            single arbitrator. If our headquarters move to El Salvador
            (the documented backup jurisdiction) the governing law
            and seat shift accordingly with at least 30 days&apos;
            notice via <Link href="/announcements" style={LINK}>
              /announcements
            </Link>
            .
          </p>
          <p>
            You waive any right to bring a claim as part of a class or
            collective proceeding.
          </p>
        </Section>

        <Section title="12. Changes to these terms">
          <p>
            Material changes get 30 days&apos; notice via{" "}
            <Link href="/announcements" style={LINK}>
              /announcements
            </Link>
            . Continued use after the notice window is acceptance of
            the new terms. If you don&apos;t accept, stop using the
            service before the effective date.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            General:{" "}
            <a href="mailto:support@nodosol.com" style={LINK}>
              support@nodosol.com
            </a>
            . Privacy:{" "}
            <a href="mailto:privacy@nodosol.com" style={LINK}>
              privacy@nodosol.com
            </a>
            . Security:{" "}
            <a href="mailto:security@nodosol.com" style={LINK}>
              security@nodosol.com
            </a>
            . Licencing / B2B issuer onboarding:{" "}
            <a href="mailto:licencing@nodosol.com" style={LINK}>
              licencing@nodosol.com
            </a>
            .
          </p>
        </Section>

        <footer style={FOOTER}>
          {LAST_UPDATED} ·{" "}
          <Link href="/security" style={LINK}>
            Security
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" style={LINK}>
            Privacy
          </Link>{" "}
          ·{" "}
          <a href="mailto:support@nodosol.com" style={LINK}>
            support@nodosol.com
          </a>
        </footer>
      </article>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
