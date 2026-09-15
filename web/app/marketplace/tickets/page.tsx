import { MarketplaceShell } from "@/components/MarketplaceShell";

import { TicketsView } from "./TicketsView";

export const metadata = {
  title: "My tickets",
  description: "Your cNFT event tickets. Scan to enter, list for resale, or split with private-price commit.",
};

export default function TicketsPage() {
  return (
    <MarketplaceShell active="tickets">
      <TicketsView />
    </MarketplaceShell>
  );
}
