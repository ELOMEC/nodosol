import { MarketplaceShell } from "@/components/MarketplaceShell";

import { SearchView } from "../../search/SearchView";

export const metadata = {
  title: "Search - Nodosol Ops",
  description:
    "Search assets, issuers, wallets, listings, and operational surfaces from the Ops workspace.",
};

export default async function OpsSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  return (
    <MarketplaceShell active="search">
      <SearchView initialQuery={q} />
    </MarketplaceShell>
  );
}
