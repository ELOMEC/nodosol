import { MarketplaceShell } from "@/components/MarketplaceShell";

import { MarketplaceView } from "./MarketplaceView";

export default function MarketplacePage() {
  return (
    <MarketplaceShell active="marketplace">
      <MarketplaceView />
    </MarketplaceShell>
  );
}
