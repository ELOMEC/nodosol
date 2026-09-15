import { MarketplaceShell } from "@/components/MarketplaceShell";

import { PlansView } from "./PlansView";

export default function CreatorPlansPage() {
  return (
    <MarketplaceShell active="creator-plans">
      <PlansView />
    </MarketplaceShell>
  );
}
