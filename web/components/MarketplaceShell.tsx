import Link from "next/link";
import type { ReactNode } from "react";

type NavItem = { href: string; label: string; active?: boolean };

export function MarketplaceShell({
  active,
  children,
}: {
  active: "marketplace" | "tokenize" | "assets";
  children: ReactNode;
}) {
  const nav: NavItem[] = [
    { href: "/marketplace", label: "Marketplace", active: active === "marketplace" },
    { href: "/marketplace/tokenize", label: "Tokenize", active: active === "tokenize" },
    { href: "/marketplace/assets", label: "My assets", active: active === "assets" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        background: "#0a0a0a",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid #1d1d1d",
          padding: "1.5rem 1rem",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <Link
          href="/"
          style={{
            display: "block",
            fontSize: "1.15rem",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#fafafa",
            marginBottom: "2rem",
            textDecoration: "none",
          }}
        >
          nodosol
        </Link>
        <div style={{ fontSize: "0.7rem", color: "#6a6a6a", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: "0.5rem" }}>
          RWA
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "0.55rem 0.75rem",
                borderRadius: 6,
                color: item.active ? "#fafafa" : "#a0a0a0",
                background: item.active ? "#1a1a1a" : "transparent",
                textDecoration: "none",
                fontSize: "0.92rem",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ fontSize: "0.7rem", color: "#6a6a6a", textTransform: "uppercase", letterSpacing: 1.2, margin: "2rem 0 0.5rem" }}>
          Creator tools
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
          <Link href="/" style={{ padding: "0.55rem 0.75rem", borderRadius: 6, color: "#a0a0a0", textDecoration: "none", fontSize: "0.92rem" }}>
            Blinks
          </Link>
        </nav>

        <div style={{ position: "absolute", bottom: "1.5rem", left: "1rem", right: "1rem", fontSize: "0.72rem", color: "#666" }}>
          Devnet • Solana
        </div>
      </aside>

      <main style={{ padding: "2rem 2.5rem", maxWidth: 1280 }}>{children}</main>
    </div>
  );
}
