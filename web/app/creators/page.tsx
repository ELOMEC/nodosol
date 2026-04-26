import { MarketplaceShell } from "@/components/MarketplaceShell";
import { ListSort, listProfiles } from "@/lib/creatorProfile";

import { CreatorsView } from "./CreatorsView";

export const metadata = {
  title: "Creators · Nodosol",
  description:
    "Browse Nodosol creators — claim a handle, send a tip, subscribe, or buy a ticket.",
};

const SORTS: ListSort[] = ["newest", "recent", "handle"];

function parseSort(raw: string | string[] | undefined): ListSort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return SORTS.includes(v as ListSort) ? (v as ListSort) : "newest";
}

function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function parseQuery(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v ?? "").slice(0, 80);
}

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    sort?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const query = parseQuery(params.q);
  const sort = parseSort(params.sort);
  const page = parsePage(params.page);

  const result = await listProfiles({ query, sort, page, pageSize: 20 });

  return (
    <MarketplaceShell active="creators">
      <CreatorsView
        initialQuery={query}
        initialSort={sort}
        initialPage={page}
        initialResult={result}
      />
    </MarketplaceShell>
  );
}
