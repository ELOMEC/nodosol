import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AuctionDetailView } from "./AuctionDetailView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const short = address.length > 8 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
  const title = `Auction ${short} — nodosol`;
  const description =
    "Sealed-bid commit/reveal auction on Nodosol — bid in USDC with on-chain escrow.";
  const url = `/marketplace/auctions/${address}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "nodosol" },
    twitter: { card: "summary_large_image", title, description },
  };
}

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
