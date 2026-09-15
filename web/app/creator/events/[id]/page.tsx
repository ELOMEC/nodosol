import { MarketplaceShell } from "@/components/MarketplaceShell";

import { EventDashboardView } from "./EventDashboardView";

export default async function CreatorEventDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MarketplaceShell active="creator-events">
      <EventDashboardView address={id} />
    </MarketplaceShell>
  );
}
