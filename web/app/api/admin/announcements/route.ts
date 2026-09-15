import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSupabaseUrl } from "@/lib/supabase";

// T1 — admin CRUD for announcements via the service-role key
// (announcements RLS denies all anon writes). Wallet-allowlist gating
// happens in a header set by the admin UI; we cross-check it server-
// side against NEXT_PUBLIC_ADMIN_WALLETS so a hand-crafted curl can't
// post on a non-admin's behalf.

type AnnouncementInput = {
  id?: string;
  title?: unknown;
  body?: unknown;
  severity?: unknown;
  pinned?: unknown;
  published_at?: unknown;
  expires_at?: unknown;
  author_wallet?: unknown;
};

const SEVERITIES = new Set(["info", "release", "warning", "urgent"]);
const ADMIN_LIST = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

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

function nullableStr(v: unknown, max: number): string | null {
  if (v == null) return null;
  return clampStr(v, max);
}

function isoOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const wallet = authedAdmin(req);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = service();
  if (!admin) return NextResponse.json({ ok: false, reason: "no service key" }, { status: 503 });

  // Admin sees ALL rows (drafts + scheduled-future + expired) — no
  // RLS filter because we're using the service-role client.
  const { data, error } = await admin
    .from("announcements")
    .select("*")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request): Promise<NextResponse> {
  const wallet = authedAdmin(req);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = service();
  if (!admin) return NextResponse.json({ ok: false, reason: "no service key" }, { status: 503 });

  const input = (await req.json().catch(() => ({}))) as AnnouncementInput;
  const title = clampStr(input.title, 200);
  const body = clampStr(input.body, 8000);
  const severityRaw = clampStr(input.severity, 16) ?? "info";
  if (!title || !body) {
    return NextResponse.json({ ok: false, error: "title + body required" }, { status: 400 });
  }
  if (!SEVERITIES.has(severityRaw)) {
    return NextResponse.json({ ok: false, error: "invalid severity" }, { status: 400 });
  }

  const row = {
    title,
    body,
    severity: severityRaw,
    pinned: input.pinned === true,
    published_at: isoOrNull(input.published_at) ?? new Date().toISOString(),
    expires_at: isoOrNull(input.expires_at),
    author_wallet: wallet,
  };

  const { data, error } = await admin
    .from("announcements")
    .insert(row)
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

  const input = (await req.json().catch(() => ({}))) as AnnouncementInput;
  const id = clampStr(input.id, 64);
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const title = nullableStr(input.title, 200);
  if (title !== null) patch.title = title;
  const body = nullableStr(input.body, 8000);
  if (body !== null) patch.body = body;
  if (input.severity !== undefined) {
    const s = clampStr(input.severity, 16);
    if (!s || !SEVERITIES.has(s)) {
      return NextResponse.json({ ok: false, error: "invalid severity" }, { status: 400 });
    }
    patch.severity = s;
  }
  if (input.pinned !== undefined) patch.pinned = input.pinned === true;
  if ("published_at" in input) patch.published_at = isoOrNull(input.published_at) ?? new Date().toISOString();
  if ("expires_at" in input) patch.expires_at = isoOrNull(input.expires_at);

  const { data, error } = await admin
    .from("announcements")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const wallet = authedAdmin(req);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = service();
  if (!admin) return NextResponse.json({ ok: false, reason: "no service key" }, { status: 503 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const { error } = await admin.from("announcements").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
