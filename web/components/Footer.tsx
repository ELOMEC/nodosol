import Link from "next/link";

type FooterLink = { href: string; label: string; external?: boolean };

const PRODUCT_LINKS: FooterLink[] = [
  { href: "/marketplace", label: "Enter market" },
];

const PUBLIC_LINKS: FooterLink[] = [
  { href: "/tech", label: "Tech" },
  { href: "/stats", label: "Stats" },
  { href: "/pitch", label: "Pitch" },
  { href: "/faq", label: "FAQ" },
  { href: "/security", label: "Security" },
  { href: "/announcements", label: "Update" },
  { href: "/investors", label: "Investitori" },
];

const LEGAL_LINKS: FooterLink[] = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
];

const CONTACT_LINKS: FooterLink[] = [
  { href: "mailto:support@nodosol.com", label: "support@nodosol.com" },
  { href: "mailto:security@nodosol.com", label: "security@nodosol.com" },
  { href: "mailto:privacy@nodosol.com", label: "privacy@nodosol.com" },
];

export function Footer() {
  return (
    <footer
      style={{
        background: "#0d0f14",
        borderTop: "1px solid #1f242d",
        color: "#c5cbd4",
        padding: "2.5rem 1.5rem 1.5rem",
        fontSize: "0.86rem",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "2rem",
          marginBottom: "2rem",
        }}
      >
        <Brand />
        <Column title="Market" links={PRODUCT_LINKS} />
        <Column title="Public" links={PUBLIC_LINKS} />
        <Column title="Legal" links={LEGAL_LINKS} />
        <Column title="Contact" links={CONTACT_LINKS} />
      </div>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          paddingTop: "1.25rem",
          borderTop: "1px solid #1a1d24",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          fontSize: "0.78rem",
          color: "#7a8190",
        }}
      >
        <span>© 2026 Nodosol — operated by ELOMEC UAE DMCC</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 0 3px rgba(16,185,129,0.18)",
            }}
          />
          Solana devnet · v0.5
        </span>
      </div>
    </footer>
  );
}

function Brand() {
  return (
    <div style={{ minWidth: 0 }}>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.55rem",
          color: "#eef0f3",
          fontWeight: 600,
          fontSize: "1rem",
          textDecoration: "none",
          marginBottom: "0.65rem",
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: "0.85rem",
          }}
        >
          n
        </span>
        nodosol
      </Link>
      <p style={{ color: "#7a8190", fontSize: "0.8rem", lineHeight: 1.5, maxWidth: 240 }}>
        Compliant RWA tokenization, event tickets, rentals, and creator
        payments — built on Solana.
      </p>
    </div>
  );
}

function Column({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: 1.2,
          color: "#9aa1ad",
          fontWeight: 600,
          marginBottom: "0.85rem",
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {links.map((link) => (
          <li key={link.href}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={LINK_STYLE}
              >
                {link.label}
              </a>
            ) : (
              <Link href={link.href} style={LINK_STYLE}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const LINK_STYLE: React.CSSProperties = {
  color: "#c5cbd4",
  textDecoration: "none",
  fontSize: "0.86rem",
};
