import { MarketplaceShell } from "@/components/MarketplaceShell";

import { PortfolioView } from "./PortfolioView";

export default function PortfolioPage() {
  return (
    <MarketplaceShell active="portfolio">
      <PortfolioView />
    </MarketplaceShell>
  );
}
