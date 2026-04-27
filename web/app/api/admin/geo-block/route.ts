import { NextResponse } from "next/server";

// U3 — admin read/write for the geo-block country list stored in
// Vercel Edge Config under key `geo_block`. Reads use the runtime
// SDK (cheap, sub-ms at edge); writes go through the Vercel REST
// API which requires a personal API token + the Edge Config ID.
//
// Required env (set on Vercel):
//   EDGE_CONFIG            connection string (auto-injected when
//                          you attach an Edge Config to a project)
//   VERCEL_API_TOKEN       personal token with edge-config:write
//   VERCEL_EDGE_CONFIG_ID  e.g. ecfg_AbCd1234…
//   VERCEL_TEAM_ID         optional, only if Edge Config lives
//                          under a team
//
// Same wallet-allowlist gate as other admin routes.

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

type GeoBlockBody = { countries?: unknown };

function normalize(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== "string") continue;
    const code = v.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) seen.add(code);
  }
  return Array.from(seen).sort();
}

export async function GET(req: Request): Promise<NextResponse> {
  const wallet = authedAdmin(req);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 403 });

  // Read directly via REST so admin sees the current Edge Config
  // value even if the runtime SDK has cached an older one. Falls
  // back to the env source when Edge Config isn't set up yet.
  const id = process.env.VERCEL_EDGE_CONFIG_ID;
  const token = process.env.VERCEL_API_TOKEN;
  const team = process.env.VERCEL_TEAM_ID;
  if (id && token) {
    const url = new URL(`https://api.vercel.com/v1/edge-config/${id}/item/geo_block`);
    if (team) url.searchParams.set("teamId", team);
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 404) {
        return NextResponse.json({ ok: true, countries: [], source: "edge-config" });
      }
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: `vercel api ${res.status}` },
          { status: 502 },
        );
      }
      const json = (await res.json()) as { value?: unknown };
      return NextResponse.json({
        ok: true,
        countries: normalize(json.value),
        source: "edge-config",
      });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "fetch failed" },
        { status: 502 },
      );
    }
  }

  // No Edge Config → reflect env var so admin sees what middleware
  // is actually using.
  const raw = process.env.GEO_BLOCK_COUNTRIES ?? "";
  const fromEnv = normalize(raw.split(",").map((s) => s.trim()));
  return NextResponse.json({ ok: true, countries: fromEnv, source: "env" });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const wallet = authedAdmin(req);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 403 });

  const id = process.env.VERCEL_EDGE_CONFIG_ID;
  const token = process.env.VERCEL_API_TOKEN;
  const team = process.env.VERCEL_TEAM_ID;
  if (!id || !token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Edge Config not configured. Set VERCEL_EDGE_CONFIG_ID + VERCEL_API_TOKEN to enable runtime edits.",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as GeoBlockBody;
  const countries = normalize(body.countries);

  const url = new URL(`https://api.vercel.com/v1/edge-config/${id}/items`);
  if (team) url.searchParams.set("teamId", team);
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            operation: "upsert",
            key: "geo_block",
            value: countries,
          },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `vercel api ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      countries,
      updated_by: wallet,
      note: "Propagation to edge POPs typically completes within ~60s.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
