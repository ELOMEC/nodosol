import { MarketplaceShell } from "@/components/MarketplaceShell";

import { PropertiesView } from "./PropertiesView";

export const metadata = {
  title: "Properties",
  description: "Unified view of auctions and rentals with location — real estate, commodities, carbon credits.",
};

export default function MarketplacePropertiesPage() {
  return (
    <MarketplaceShell active="properties">
      <PropertiesView />
    </MarketplaceShell>
  );
}
