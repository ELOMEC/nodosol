import { MarketplaceShell } from "@/components/MarketplaceShell";

import { MyRentalsView } from "./MyRentalsView";

export default function MyRentalsPage() {
  return (
    <MarketplaceShell active="rentals">
      <MyRentalsView />
    </MarketplaceShell>
  );
}
