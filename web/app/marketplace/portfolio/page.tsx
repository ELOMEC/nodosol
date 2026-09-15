import { MarketplaceShell } from "@/components/MarketplaceShell";

import { PortfolioView } from "./PortfolioView";

export const metadata = {
  title: "Portfolio",
  description: "Your Nodosol holdings — RWA tokens, open listings, pending OTC deals, rental subscriptions.",
};

export default function PortfolioPage() {
  return (
    <MarketplaceShell active="portfolio">
      <PortfolioView />
    </MarketplaceShell>
  );
}
