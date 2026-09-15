import { redirect } from "next/navigation";

export const metadata = {
  title: "Creators · Nodosol",
  description:
    "Browse Nodosol creators — claim a handle, send a tip, subscribe, or buy a ticket.",
};

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
  const next = new URLSearchParams();
  for (const key of ["q", "sort", "page"]) {
    const value = params[key as keyof typeof params];
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) next.set(key, normalized);
  }
  redirect(next.size > 0 ? `/ops/creators?${next}` : "/ops/creators");
}
