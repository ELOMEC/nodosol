import { MarketplaceShell } from "@/components/MarketplaceShell";

import { MarketplaceView } from "./MarketplaceView";

export const metadata = {
  title: "Marketplace",
  description: "Browse tokenized real-world assets, fractional listings, and escrow-backed OTC deals on Solana — all in USDC, all Token-2022.",
};

export default function MarketplacePage() {
  return (
    <MarketplaceShell active="marketplace">
      <MarketplaceView />
    </MarketplaceShell>
  );
}
