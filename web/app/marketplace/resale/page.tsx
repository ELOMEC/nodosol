import { MarketplaceShell } from "@/components/MarketplaceShell";

import { ResaleView } from "./ResaleView";

export default function MarketplaceResalePage() {
  return (
    <MarketplaceShell active="resale">
      <ResaleView />
    </MarketplaceShell>
  );
}
