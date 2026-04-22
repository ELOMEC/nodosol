import { MarketplaceShell } from "@/components/MarketplaceShell";

import { CreatorOverview } from "./CreatorOverview";

export const metadata = {
  title: "Creator dashboard",
  description: "Your events, plans, tips, and venue layouts — one place to manage Nodosol creator operations.",
};

export default function CreatorPage() {
  return (
    <MarketplaceShell active="creator">
      <CreatorOverview />
    </MarketplaceShell>
  );
}
