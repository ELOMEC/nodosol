import { MarketplaceShell } from "@/components/MarketplaceShell";

import { EventsView } from "./EventsView";

export default function EventsPage() {
  return (
    <MarketplaceShell active="events">
      <EventsView />
    </MarketplaceShell>
  );
}
