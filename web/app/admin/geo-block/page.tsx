import { MarketplaceShell } from "@/components/MarketplaceShell";

import { GeoBlockView } from "./GeoBlockView";

export const metadata = {
  title: "Geo-block admin · nodosol",
  robots: { index: false, follow: false },
};

export default function GeoBlockPage() {
  return (
    <MarketplaceShell active="admin">
      <GeoBlockView />
    </MarketplaceShell>
  );
}
