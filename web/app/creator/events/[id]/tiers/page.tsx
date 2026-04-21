import { MarketplaceShell } from "@/components/MarketplaceShell";

import { TierEditor } from "./TierEditor";

export default async function CreatorEventTiersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MarketplaceShell active="creator-events">
      <TierEditor address={id} />
    </MarketplaceShell>
  );
}
