import { MarketplaceShell } from "@/components/MarketplaceShell";

import { CreatorOverview } from "./CreatorOverview";

export default function CreatorPage() {
  return (
    <MarketplaceShell active="creator">
      <CreatorOverview />
    </MarketplaceShell>
  );
}
