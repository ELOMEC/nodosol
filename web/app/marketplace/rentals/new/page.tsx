import { MarketplaceShell } from "@/components/MarketplaceShell";

import { NewRentalView } from "./NewRentalView";

export default function NewRentalPage() {
  return (
    <MarketplaceShell active="rentals">
      <NewRentalView />
    </MarketplaceShell>
  );
}
