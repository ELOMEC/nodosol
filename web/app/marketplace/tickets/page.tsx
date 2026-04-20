import { MarketplaceShell } from "@/components/MarketplaceShell";

import { TicketsView } from "./TicketsView";

export default function TicketsPage() {
  return (
    <MarketplaceShell active="tickets">
      <TicketsView />
    </MarketplaceShell>
  );
}
