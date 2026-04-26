import { MarketplaceShell } from "@/components/MarketplaceShell";

import { EventDetailView } from "./EventDetailView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const short = id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
  const title = `Event ${short} — nodosol`;
  const description =
    "Buy a ticket on Nodosol — Token-2022 cNFT ticketing with venue maps, signed QR check-in, and royalty-routed resale.";
  const url = `/marketplace/events/v/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "nodosol" },
    twitter: { card: "summary_large_image", title, description },
  };
}

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
