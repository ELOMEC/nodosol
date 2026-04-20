import Link from "next/link";

import { LandingProviders } from "../LandingProviders";
import { StatsView } from "./StatsView";

export const metadata = {
  title: "nodosol — live on-chain stats",
  description:
    "Live on-chain metrics across Nodosol's seven Anchor programs on Solana devnet: active listings, volume, top issuers, recent activity.",
};

export default function StatsPage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2.5rem" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#fff", textDecoration: "none" }}>
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            n
          </span>
          <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>nodosol</span>
        </Link>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link
            href="/marketplace"
            style={{
              padding: "0.5rem 0.85rem",
              borderRadius: 7,
              color: "#e8e8e8",
              textDecoration: "none",
              fontSize: "0.88rem",
            }}
          >
            Open app
          </Link>
          <Link
            href="/pitch"
            style={{
              padding: "0.5rem 0.85rem",
              borderRadius: 7,
              color: "#e8e8e8",
              textDecoration: "none",
              fontSize: "0.88rem",
            }}
          >
            Investors
          </Link>
        </div>
      </nav>

      <LandingProviders>
        <StatsView />
      </LandingProviders>
    </main>
  );
}
