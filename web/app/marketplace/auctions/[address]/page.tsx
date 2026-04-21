import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AuctionDetailView } from "./AuctionDetailView";

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return (
    <MarketplaceShell active="auctions">
      <AuctionDetailView address={address} />
    </MarketplaceShell>
  );
}
