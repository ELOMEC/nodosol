import { MarketplaceShell } from "@/components/MarketplaceShell";

import { TokenizeForm } from "./TokenizeForm";

export const metadata = {
  title: "Tokenize an asset",
  description: "Issue a Token-2022 fixed-supply RWA on Solana. Gallery, location, sale mode, licenced-issuer gating.",
};

export default function TokenizePage() {
  return (
    <MarketplaceShell active="tokenize">
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
          Tokenize asset
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          Mints a fixed-supply Token-2022 asset tied to your issuer profile. Supply is capped at
          tokenisation — you can burn later, but never mint more.
        </p>
      </header>

      <TokenizeForm />
    </MarketplaceShell>
  );
}
