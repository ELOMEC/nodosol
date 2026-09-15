import { MarketplaceShell } from "@/components/MarketplaceShell";

import { VenueEditor } from "./VenueEditor";

export default async function CreatorVenueEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MarketplaceShell active="creator-venues">
      <VenueEditor id={id} />
    </MarketplaceShell>
  );
}
