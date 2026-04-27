import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSupabaseUrl } from "@/lib/supabase";

// U2 — admin CRUD for legal_pages. Same gate as announcements
// (x-nodosol-admin-wallet header cross-checked against
// NEXT_PUBLIC_ADMIN_WALLETS), service-role client to bypass RLS.
//
// Versioning: every PATCH archives the previous row into
// legal_pages_versions BEFORE writing the new one, then bumps
// version. POST is upsert behaviour for first-save (slug doesn't
// exist yet → insert; slug exists → 409 so admin uses PATCH).

type LegalInput = {
  slug?: unknown;
  title?: unknown;
  body_md?: unknown;
};

const ADMIN_LIST = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const ALLOWED_SLUGS = new Set(["privacy", "terms"]);

function authedAdmin(req: Request): string | null {
  const wallet = req.headers.get("x-nodosol-admin-wallet");
  if (!wallet) return null;
  if (!ADMIN_LIST.has(wallet)) return null;
  return wallet;
}

function service() {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export async function GET(req: Request): Promise<NextResponse> {
  const wallet = authedAdmin(req);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = service();
  if (!admin) return NextResponse.json({ ok: false, reason: "no service key" }, { status: 503 });

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (slug) {
    if (!ALLOWED_SLUGS.has(slug)) {
      return NextResponse.json({ ok: false, error: "unknown slug" }, { status: 400 });
    }
    const [page, versions] = await Promise.all([
      admin.from("legal_pages").select("*").eq("slug", slug).maybeSingle(),
      admin.from("legal_pages_versions").select("*").eq("slug", slug).order("version", { ascending: false }).limit(50),
    ]);
    return NextResponse.json({
      ok: true,
      page: page.data ?? null,
      versions: versions.data ?? [],
    });
  }

  const { data, error } = await admin.from("legal_pages").select("*").order("slug");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request): Promise<NextResponse> {
  const wallet = authedAdmin(req);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = service();
  if (!admin) return NextResponse.json({ ok: false, reason: "no service key" }, { status: 503 });

  const input = (await req.json().catch(() => ({}))) as LegalInput;
  const slug = clampStr(input.slug, 32);
  const title = clampStr(input.title, 200);
  const body_md = clampStr(input.body_md, 100_000);
  if (!slug || !title || !body_md) {
    return NextResponse.json({ ok: false, error: "slug + title + body_md required" }, { status: 400 });
  }
  if (!ALLOWED_SLUGS.has(slug)) {
    return NextResponse.json({ ok: false, error: "unknown slug" }, { status: 400 });
  }

  const { data: existing } = await admin.from("legal_pages").select("slug").eq("slug", slug).maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: false, error: "row exists — use PATCH" }, { status: 409 });
  }

  const { data, error } = await admin
    .from("legal_pages")
    .insert({
      slug,
      title,
      body_md,
      version: 1,
      last_updated: new Date().toISOString(),
      updated_by_wallet: wallet,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const wallet = authedAdmin(req);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = service();
  if (!admin) return NextResponse.json({ ok: false, reason: "no service key" }, { status: 503 });

  const input = (await req.json().catch(() => ({}))) as LegalInput;
  const slug = clampStr(input.slug, 32);
  const title = clampStr(input.title, 200);
  const body_md = clampStr(input.body_md, 100_000);
  if (!slug || !title || !body_md) {
    return NextResponse.json({ ok: false, error: "slug + title + body_md required" }, { status: 400 });
  }
  if (!ALLOWED_SLUGS.has(slug)) {
    return NextResponse.json({ ok: false, error: "unknown slug" }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await admin
    .from("legal_pages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });

  if (!existing) {
    // No row yet — defer to POST behaviour for first save.
    const { data, error } = await admin
      .from("legal_pages")
      .insert({
        slug,
        title,
        body_md,
        version: 1,
        last_updated: new Date().toISOString(),
        updated_by_wallet: wallet,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, row: data, created: true });
  }

  // Archive previous row before overwriting.
  const archive = await admin.from("legal_pages_versions").insert({
    slug: existing.slug,
    title: existing.title,
    body_md: existing.body_md,
    version: existing.version,
    edited_at: existing.last_updated,
    edited_by_wallet: existing.updated_by_wallet,
  });
  if (archive.error) {
    return NextResponse.json({ ok: false, error: archive.error.message }, { status: 500 });
  }

  const { data, error } = await admin
    .from("legal_pages")
    .update({
      title,
      body_md,
      version: existing.version + 1,
      last_updated: new Date().toISOString(),
      updated_by_wallet: wallet,
    })
    .eq("slug", slug)
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}
