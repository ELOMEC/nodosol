import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AuctionsView } from "./AuctionsView";

export const metadata = {
  title: "Auctions",
  description: "Sealed-bid commit/reveal auctions on Solana. Bid privately, reveal on-chain, settle atomically.",
};

export default function MarketplaceAuctionsPage() {
  return (
    <MarketplaceShell active="auctions">
      <AuctionsView />
    </MarketplaceShell>
  );
}
