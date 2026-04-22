import { MarketplaceShell } from "@/components/MarketplaceShell";

import { ResaleView } from "./ResaleView";

export const metadata = {
  title: "Ticket resale",
  description: "Secondary market for event tickets. Atomic cNFT swap with royalty split and private-price commit/reveal.",
};

export default function MarketplaceResalePage() {
  return (
    <MarketplaceShell active="resale">
      <ResaleView />
    </MarketplaceShell>
  );
}
