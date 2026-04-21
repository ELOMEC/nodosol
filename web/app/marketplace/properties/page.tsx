import { MarketplaceShell } from "@/components/MarketplaceShell";

import { PropertiesView } from "./PropertiesView";

export default function MarketplacePropertiesPage() {
  return (
    <MarketplaceShell active="properties">
      <PropertiesView />
    </MarketplaceShell>
  );
}
