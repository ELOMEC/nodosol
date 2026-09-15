import { redirect } from "next/navigation";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const next = new URLSearchParams();
  if (q) next.set("q", q);
  redirect(next.size > 0 ? `/ops/search?${next}` : "/ops/search");
}
