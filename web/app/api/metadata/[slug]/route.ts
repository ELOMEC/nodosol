import { NextResponse } from "next/server";

import { SEED_METADATA } from "../../../../lib/seed-catalog";

export const dynamic = "force-static";
export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const entry = SEED_METADATA[slug];
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(entry, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

export function generateStaticParams() {
  return Object.keys(SEED_METADATA).map((slug) => ({ slug }));
}
