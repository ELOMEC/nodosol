import { MarketplaceShell } from "@/components/MarketplaceShell";

import { RentalDetailView } from "./RentalDetailView";

export default async function RentalDetailPage({
  params,
}: {
  params: Promise<{ plan: string }>;
}) {
  const { plan } = await params;
  return (
    <MarketplaceShell active="rentals">
      <RentalDetailView planAddress={plan} />
    </MarketplaceShell>
  );
}
