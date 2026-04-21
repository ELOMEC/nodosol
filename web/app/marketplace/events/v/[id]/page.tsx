import { MarketplaceShell } from "@/components/MarketplaceShell";

import { EventDetailView } from "./EventDetailView";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MarketplaceShell active="events">
      <EventDetailView address={id} />
    </MarketplaceShell>
  );
}
