import { get } from "@vercel/edge-config";
import { NextRequest, NextResponse } from "next/server";

/**
 * Q1 — Compliance gates.
 *
 * Geo-block: serve a 451-style page for visitors from countries we
 * can't legally serve yet. Source-of-truth precedence:
 *
 *   1. Vercel Edge Config key `geo_block` (ISO-3166-1 alpha-2 array)
 *      — admin-editable from `/admin/geo-block`, propagates globally
 *      in ~1 minute. Requires `EDGE_CONFIG` connection string.
 *   2. `GEO_BLOCK_COUNTRIES` env var (comma-separated ISO codes)
 *      — fallback for local dev or when Edge Config isn't wired up.
 *   3. Hardcoded `["US"]` if neither is set.
 *
 * The middleware reads on every request; Edge Config has <1ms p95
 * latency at the edge so this is fine. We swallow Edge Config
 * errors and fall through to the env / hardcoded path so a misread
 * never breaks the site.
 *
 * Q2 — Maintenance mode.
 *
 * `NEXT_PUBLIC_MAINTENANCE_MODE === "1"` rewrites every public route
 * to `/maintenance` with two carve-outs: `/admin/*` so ops can flip it
 * back off, and `/api/health` so monitoring still works.
 *
 * Both gates skip static assets + the OG/manifest/robots/sitemap
 * surfaces so search crawlers + the PWA don't see a 451 or
 * maintenance page during a degraded window.
 */

const HARDCODED_FALLBACK = ["US"] as const;

async function blocklist(): Promise<Set<string>> {
  // Edge Config first.
  if (process.env.EDGE_CONFIG) {
    try {
      const value = await get<string[] | string>("geo_block");
      if (Array.isArray(value) && value.length) {
        return new Set(value.map((s) => s.toUpperCase()));
      }
      if (typeof value === "string" && value.trim()) {
        return new Set(value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
      }
      // Edge Config configured but key empty → treat as "no countries
      // blocked" (admin explicitly cleared the list).
      if (value !== undefined) return new Set();
    } catch {
      // Fall through to env / hardcoded.
    }
  }
  const raw = process.env.GEO_BLOCK_COUNTRIES;
  if (raw && raw.trim()) {
    return new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
  }
  return new Set(HARDCODED_FALLBACK);
}

function maintenanceMode(): boolean {
  return process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "1";
}

const ALWAYS_PASS = [
  "/_next/",
  "/favicon.ico",
  "/icon.svg",
  "/manifest.json",
  "/sw.js",
  "/sitemap.xml",
  "/robots.txt",
  "/api/health",
  "/blocked",
  "/maintenance",
];

const MAINTENANCE_BYPASS = ["/admin"];

function shouldSkip(pathname: string, list: ReadonlyArray<string>): boolean {
  return list.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (shouldSkip(pathname, ALWAYS_PASS)) return NextResponse.next();

  if (maintenanceMode() && !shouldSkip(pathname, MAINTENANCE_BYPASS)) {
    const url = req.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  const country = req.headers.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  if (country) {
    const list = await blocklist();
    if (list.has(country)) {
      const url = req.nextUrl.clone();
      url.pathname = `/blocked/${country}`;
      url.search = "";
      return NextResponse.rewrite(url, { status: 451 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|icon.svg|manifest.json|sw.js|sitemap.xml|robots.txt|api/health|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|map|txt|woff|woff2|ttf)).*)",
  ],
};
