import { MarketplaceShell } from "@/components/MarketplaceShell";

import { CreatorEventsView } from "./CreatorEventsView";

export const metadata = {
  title: "My events",
  description: "Manage event tiers, door scanners, check-ins, withdrawals, and ticket sales.",
};

export default function CreatorEventsPage() {
  return (
    <MarketplaceShell active="creator-events">
      <CreatorEventsView />
    </MarketplaceShell>
  );
}
