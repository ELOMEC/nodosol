import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AssetDetailView } from "./AssetDetailView";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  return (
    <MarketplaceShell active="marketplace">
      <AssetDetailView mint={mint} />
    </MarketplaceShell>
  );
}
