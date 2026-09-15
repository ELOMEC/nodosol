import { MarketplaceShell } from "@/components/MarketplaceShell";
import type { CSSProperties } from "react";

import { TokenizeForm } from "./TokenizeForm";

export const metadata = {
  title: "Tokenize an asset",
  description: "Issue a Token-2022 fixed-supply RWA on Solana. Gallery, location, sale mode, licenced-issuer gating.",
};

export default function TokenizePage() {
  return (
    <MarketplaceShell active="tokenize">
      <header style={hero}>
        <span style={eyebrow}>Issuer studio</span>
        <h1 style={h1}>
          Tokenize asset
        </h1>
        <p style={sub}>
          Mints a fixed-supply Token-2022 asset tied to your issuer profile. Supply is capped at
          tokenisation — you can burn later, but never mint more.
        </p>
      </header>

      <TokenizeForm />
    </MarketplaceShell>
  );
}

const hero: CSSProperties = {
  marginBottom: "1rem",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 22,
  padding: "1.35rem",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(236,253,245,0.78))",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
};

const eyebrow: CSSProperties = {
  display: "inline-flex",
  marginBottom: "0.55rem",
  color: "#047857",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const h1: CSSProperties = {
  fontSize: "2.7rem",
  lineHeight: 1.05,
  letterSpacing: 0,
  fontWeight: 800,
  marginBottom: "0.45rem",
};

const sub: CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.98rem",
  lineHeight: 1.6,
  maxWidth: 760,
};
