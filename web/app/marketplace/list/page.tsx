import { MarketplaceShell } from "@/components/MarketplaceShell";

import { BulkListView } from "./BulkListView";

export const metadata = {
  title: "Bulk list assets — nodosol",
  description:
    "List multiple RWA assets to the marketplace in a single submit — one transaction per asset, sequentially.",
};

export default function MarketplaceBulkListPage() {
  return (
    <MarketplaceShell active="list">
      <BulkListView />
    </MarketplaceShell>
  );
}
