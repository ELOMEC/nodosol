import Link from "next/link";

import { MarketplaceShell } from "@/components/MarketplaceShell";
import { ActionLink, PageHeader, SectionCard, StatusPill } from "@/components/NodosolUI";

export const metadata = {
  title: "Ops - Nodosol",
  description:
    "Operational workspace for Nodosol creator directory, channels, search, and notification settings.",
};

const opsCards = [
  {
    href: "/ops/creators",
    title: "Creators",
    body: "Browse public creator profiles, handles, bios, and creator-facing entry points.",
    meta: "Directory",
  },
  {
    href: "/ops/channels",
    title: "Channels",
    body: "Open signed community channels and deal conversations from the same app shell.",
    meta: "Comms",
  },
  {
    href: "/ops/search",
    title: "Search",
    body: "Find assets, issuers, wallets, listings, creator profiles, and market surfaces.",
    meta: "Discovery",
  },
  {
    href: "/ops/notifications",
    title: "Notifications",
    body: "Control alerts for market activity, messages, tickets, and account events.",
    meta: "Preferences",
  },
];

export default function OpsPage() {
  return (
    <MarketplaceShell active="ops">
      <section style={{ padding: "1.5rem 0 0.5rem" }}>
        <PageHeader
          eyebrow="Operations"
          title="Ops workspace"
          description="One place for the supporting surfaces around the market: creator directory, channels, global search, and notification controls."
          actions={<ActionLink href="/marketplace" variant="secondary">Back to market</ActionLink>}
        />

        <div className="nds-grid-2" style={{ gap: "1rem", marginTop: "1.5rem" }}>
          {opsCards.map((card) => (
            <Link key={card.href} href={card.href} style={cardLinkStyle}>
              <SectionCard>
                <StatusPill tone="blue">{card.meta}</StatusPill>
                <h2 style={cardTitleStyle}>{card.title}</h2>
                <p style={cardBodyStyle}>{card.body}</p>
              </SectionCard>
            </Link>
          ))}
        </div>
      </section>
    </MarketplaceShell>
  );
}

const cardLinkStyle: React.CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const cardTitleStyle: React.CSSProperties = {
  color: "var(--shell-fg)",
  fontSize: "1.1rem",
  marginTop: "0.9rem",
  marginBottom: "0.55rem",
};

const cardBodyStyle: React.CSSProperties = {
  color: "var(--shell-muted)",
  lineHeight: 1.6,
  fontSize: "0.93rem",
};
