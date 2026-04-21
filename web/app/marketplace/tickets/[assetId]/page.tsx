import { MarketplaceShell } from "@/components/MarketplaceShell";

import { TicketDetailView } from "./TicketDetailView";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return (
    <MarketplaceShell active="tickets">
      <TicketDetailView assetId={assetId} />
    </MarketplaceShell>
  );
}
