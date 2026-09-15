import { MarketplaceShell } from "@/components/MarketplaceShell";

import { TipsView } from "./TipsView";

export default function CreatorTipsPage() {
  return (
    <MarketplaceShell active="creator-tips">
      <TipsView />
    </MarketplaceShell>
  );
}
