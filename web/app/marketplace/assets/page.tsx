import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AssetsView } from "./AssetsView";

export default function AssetsPage() {
  return (
    <MarketplaceShell active="assets">
      <AssetsView />
    </MarketplaceShell>
  );
}
