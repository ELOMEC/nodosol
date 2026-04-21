import { MarketplaceShell } from "@/components/MarketplaceShell";

import { VenueLayoutsView } from "./VenueLayoutsView";

export default function CreatorVenuesPage() {
  return (
    <MarketplaceShell active="creator-venues">
      <VenueLayoutsView />
    </MarketplaceShell>
  );
}
