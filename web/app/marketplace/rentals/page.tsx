import { MarketplaceShell } from "@/components/MarketplaceShell";

import { RentalsView } from "./RentalsView";

export default function MarketplaceRentalsPage() {
  return (
    <MarketplaceShell active="rentals">
      <RentalsView />
    </MarketplaceShell>
  );
}
