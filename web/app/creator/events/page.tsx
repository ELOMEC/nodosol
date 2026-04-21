import { MarketplaceShell } from "@/components/MarketplaceShell";

import { CreatorEventsView } from "./CreatorEventsView";

export default function CreatorEventsPage() {
  return (
    <MarketplaceShell active="creator-events">
      <CreatorEventsView />
    </MarketplaceShell>
  );
}
