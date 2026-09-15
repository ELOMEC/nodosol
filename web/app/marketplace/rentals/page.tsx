import { MarketplaceShell } from "@/components/MarketplaceShell";

import { RentalsView } from "./RentalsView";

export const metadata = {
  title: "Rentals",
  description: "Monthly rent plans settled in USDC on Solana. Delegate-based recurring billing, no custodian.",
};

export default function MarketplaceRentalsPage() {
  return (
    <MarketplaceShell active="rentals">
      <RentalsView />
    </MarketplaceShell>
  );
}
