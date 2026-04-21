import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AuctionsView } from "./AuctionsView";

export default function MarketplaceAuctionsPage() {
  return (
    <MarketplaceShell active="auctions">
      <AuctionsView />
    </MarketplaceShell>
  );
}
