import { MarketplaceShell } from "@/components/MarketplaceShell";

import { SearchView } from "./SearchView";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  return (
    <MarketplaceShell active="marketplace">
      <SearchView initialQuery={q} />
    </MarketplaceShell>
  );
}
