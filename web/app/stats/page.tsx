import { PublicPageShell } from "@/components/PublicPageShell";

import { LandingProviders } from "../LandingProviders";
import { StatsView } from "./StatsView";

export const metadata = {
  title: "nodosol — live on-chain stats",
  description:
    "Live on-chain metrics across Nodosol's seven Anchor programs on Solana devnet: active listings, volume, top issuers, recent activity.",
};

export default function StatsPage() {
  return (
    <PublicPageShell active="stats">
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 0 1rem" }}>
      <LandingProviders>
        <StatsView />
      </LandingProviders>
      </div>
    </PublicPageShell>
  );
}
