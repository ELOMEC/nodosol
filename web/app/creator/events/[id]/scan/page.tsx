import { MarketplaceShell } from "@/components/MarketplaceShell";

import { ScanView } from "./ScanView";

export default async function CreatorEventScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MarketplaceShell active="creator-events">
      <ScanView address={id} />
    </MarketplaceShell>
  );
}
