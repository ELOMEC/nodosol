import { MarketplaceShell } from "@/components/MarketplaceShell";

import { EventDetailView } from "./EventDetailView";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return (
    <MarketplaceShell active="events">
      <EventDetailView address={address} />
    </MarketplaceShell>
  );
}
