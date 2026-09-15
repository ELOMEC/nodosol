import { MarketplaceShell } from "@/components/MarketplaceShell";

import { NewEventWizard } from "./NewEventWizard";

export default function CreatorNewEventPage() {
  return (
    <MarketplaceShell active="creator-events">
      <NewEventWizard />
    </MarketplaceShell>
  );
}
