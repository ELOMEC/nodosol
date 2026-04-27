import Link from "next/link";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CN: "China",
  IR: "Iran",
  KP: "North Korea",
  RU: "Russia",
  SY: "Syria",
  CU: "Cuba",
};

const REASONS: Record<string, string> = {
  US:
    "We're operating pre-audit and haven't completed the registration that would let us serve US residents under FinCEN / state money transmitter regimes. We'll lift the gate once the licencing path closes.",
  CN: "We do not currently serve customers in China.",
  IR: "OFAC-sanctioned jurisdiction.",
  KP: "OFAC-sanctioned jurisdiction.",
  RU: "OFAC-sanctioned jurisdiction.",
  SY: "OFAC-sanctioned jurisdiction.",
  CU: "OFAC-sanctioned jurisdiction.",
};

const DEFAULT_REASON =
  "Nodosol isn't available in your jurisdiction yet. We're working to expand coverage as licencing permits.";

export const metadata = {
  title: "Service unavailable in your region · nodosol",
  robots: { index: false, follow: false },
};

export default async function BlockedPage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;
  const cc = country.toUpperCase().slice(0, 2);
  const name = COUNTRY_NAMES[cc] ?? cc;
  const reason = REASONS[cc] ?? DEFAULT_REASON;

  return (
    <main style={SHELL}>
      <div style={CARD}>
        <div style={LOGO_LABEL}>nodosol</div>
        <h1 style={H1}>Service unavailable in {name}</h1>
        <p style={SUB}>{reason}</p>
        <p style={SUB}>
          If you&apos;re a creator, issuer, or potential partner from
          this jurisdiction interested in early access when we open,
          drop a note to{" "}
          <a href="mailto:licencing@nodosol.com" style={LINK}>
            licencing@nodosol.com
          </a>
          . We&apos;ll route you to the right path when one exists.
        </p>
        <p style={SUB}>
          Already a partner / issuer with a non-{cc} office? Connect
          from that location — we use Vercel Edge geolocation, not
          wallet-address country.
        </p>
        <div style={LINKS}>
          <Link href="/security" style={LINK}>
            Security &amp; disclosure
          </Link>
          <span style={DOT}>·</span>
          <Link href="/privacy" style={LINK}>
            Privacy
          </Link>
          <span style={DOT}>·</span>
          <Link href="/terms" style={LINK}>
            Terms
          </Link>
        </div>
        <div style={REF}>HTTP 451 · region {cc}</div>
      </div>
    </main>
  );
}

const SHELL: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#0b0d12",
  color: "#eef0f3",
  padding: "2rem 1rem",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const CARD: React.CSSProperties = {
  maxWidth: 540,
  width: "100%",
  background: "#11141a",
  border: "1px solid #1f242d",
  borderRadius: 14,
  padding: "2.25rem 2rem",
  textAlign: "center" as const,
};

const LOGO_LABEL: React.CSSProperties = {
  fontSize: "0.78rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "#7c8694",
  marginBottom: "1.5rem",
};

const H1: React.CSSProperties = {
  fontSize: "1.55rem",
  fontWeight: 600,
  marginBottom: "0.85rem",
  letterSpacing: "-0.01em",
};

const SUB: React.CSSProperties = {
  color: "#c5cbd4",
  fontSize: "0.95rem",
  lineHeight: 1.6,
  marginBottom: "1rem",
};

const LINKS: React.CSSProperties = {
  marginTop: "1.5rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  fontSize: "0.85rem",
};

const LINK: React.CSSProperties = {
  color: "#7b9cff",
  textDecoration: "underline",
};

const DOT: React.CSSProperties = {
  color: "#3a3f4a",
};

const REF: React.CSSProperties = {
  marginTop: "1.25rem",
  fontSize: "0.74rem",
  color: "#7c8694",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, monospace",
};
