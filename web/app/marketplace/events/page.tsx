import { MarketplaceShell } from "@/components/MarketplaceShell";

import { EventsView } from "./EventsView";

export const metadata = {
  title: "Events",
  description: "Buy tickets for live events on Solana. Seated venues, signed door scans, atomic cNFT resale.",
};

export default function EventsPage() {
  return (
    <MarketplaceShell active="events">
      <EventsView />
    </MarketplaceShell>
  );
}
