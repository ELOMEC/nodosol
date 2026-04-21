import { MarketplaceShell } from "@/components/MarketplaceShell";

import { NewAuctionView } from "./NewAuctionView";

export default function NewAuctionPage() {
  return (
    <MarketplaceShell active="auctions">
      <NewAuctionView />
    </MarketplaceShell>
  );
}
