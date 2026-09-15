import Link from "next/link";

export const metadata = {
  title: "Page not found — nodosol",
};

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div style={brandStyle}>
          <span style={logoMarkStyle}>n</span>
          <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>nodosol</span>
        </div>

        <div
          style={{
            fontSize: "3.5rem",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "0.3rem",
            lineHeight: 1,
          }}
        >
          404
        </div>
        <h1 style={{ fontSize: "1.45rem", fontWeight: 600, marginBottom: "0.6rem" }}>
          Page not found
        </h1>
        <p style={{ color: "#a1a1aa", fontSize: "0.95rem", lineHeight: 1.55, marginBottom: "1.5rem" }}>
          We couldn&apos;t find that page. It may have been moved, or the URL
          might be wrong. Check one of the entry points below.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <Link href="/" style={linkStyle}>→ Home</Link>
          <Link href="/marketplace" style={linkStyle}>→ Marketplace</Link>
          <Link href="/creator" style={linkStyle}>→ Creator dashboard</Link>
          <Link href="/pitch" style={linkStyle}>→ Pitch deck</Link>
        </div>
      </div>
    </main>
  );
}

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  marginBottom: "2.5rem",
};

const logoMarkStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontWeight: 700,
};

const linkStyle: React.CSSProperties = {
  color: "#a5b4fc",
  fontSize: "0.95rem",
  textDecoration: "none",
  fontWeight: 500,
};
