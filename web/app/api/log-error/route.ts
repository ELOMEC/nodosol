import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSupabaseUrl } from "@/lib/supabase";

// Inserts a client-side error report into the `error_logs` table via
// the service-role client (RLS denies all other roles). Returns
// {ok:true} so the boundary can show a confirmation toast without
// leaking server-side state.

const MAX_FIELD = 8000;

type Body = {
  message?: unknown;
  stack?: unknown;
  digest?: unknown;
  route?: unknown;
  wallet_pubkey?: unknown;
};

function clamp(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  return v.length > MAX_FIELD ? v.slice(0, MAX_FIELD) : v;
}

export async function POST(req: Request): Promise<NextResponse> {
  // Service-role key is set as an env var on Vercel; the public anon
  // client we usually use can't insert because of the RLS deny-all
  // policy. Skip silently if the env var is missing in dev.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ ok: false, reason: "no service key" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad json" }, { status: 400 });
  }

  const message = clamp(body.message);
  if (!message) {
    return NextResponse.json({ ok: false, reason: "missing message" }, { status: 400 });
  }

  const supabase = createClient(getSupabaseUrl(), serviceKey, {
    auth: { persistSession: false },
  });

  const clientIp =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const userAgent = req.headers.get("user-agent");

  const { error } = await supabase.from("error_logs").insert({
    message,
    stack: clamp(body.stack),
    digest: clamp(body.digest),
    route: clamp(body.route),
    wallet_pubkey: clamp(body.wallet_pubkey),
    client_ip: clientIp,
    user_agent: clamp(userAgent),
  });

  if (error) {
    console.error("error_logs insert failed", error.message);
    return NextResponse.json({ ok: false, reason: "insert failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
