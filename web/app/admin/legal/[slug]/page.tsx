import { notFound } from "next/navigation";

import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AdminLegalEditorView } from "./AdminLegalEditorView";

export const metadata = {
  title: "Legal page editor · nodosol",
  robots: { index: false, follow: false },
};

const ALLOWED = new Set(["privacy", "terms"]);

export default async function AdminLegalEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!ALLOWED.has(slug)) notFound();
  return (
    <MarketplaceShell active="admin">
      <AdminLegalEditorView slug={slug as "privacy" | "terms"} />
    </MarketplaceShell>
  );
}
