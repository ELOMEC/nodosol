import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Channels — Nodosol",
  description: "Public chat channels for Nodosol: help, showcases, deals.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  if (params.c) next.set("c", params.c);
  redirect(next.size > 0 ? `/ops/channels?${next}` : "/ops/channels");
}
