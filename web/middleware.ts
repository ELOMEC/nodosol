import { NextRequest, NextResponse } from "next/server";

/**
 * Q1 — Compliance gates.
 *
 * Geo-block: serve a 451-style page for visitors from countries we
 * can't legally serve yet (US is the live blocklist; every other
 * country passes through). Vercel Edge attaches the
 * `x-vercel-ip-country` header on every deployed request.
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

// Defaults: only US blocked. Extend by setting GEO_BLOCK_COUNTRIES env
// (comma-separated ISO codes) — runtime read so Mladen flips it
// without a redeploy via Vercel env update.
const DEFAULT_BLOCKLIST = ["US"] as const;

function blocklist(): Set<string> {
  const raw = process.env.GEO_BLOCK_COUNTRIES;
  if (raw && raw.trim()) {
    return new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
  }
  return new Set(DEFAULT_BLOCKLIST);
}

function maintenanceMode(): boolean {
  return process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "1";
}

// Routes that ALWAYS pass through both gates (static, ops, health).
const ALWAYS_PASS = [
  "/_next/",
  "/favicon.ico",
  "/icon.svg",
  "/manifest.json",
  "/sw.js",
  "/sitemap.xml",
  "/robots.txt",
  "/api/health",
  // Self-references for the gate pages so we don't loop.
  "/blocked",
  "/maintenance",
];

// Maintenance bypass: admin surface stays reachable.
const MAINTENANCE_BYPASS = ["/admin"];

function shouldSkip(pathname: string, list: ReadonlyArray<string>): boolean {
  return list.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (shouldSkip(pathname, ALWAYS_PASS)) return NextResponse.next();

  // Q2 — maintenance mode rewrite first; geo-block second.
  // (Maintenance pre-empts geo-block on the assumption a degraded
  // window is the louder signal and the same generic page can serve
  // every visitor.)
  if (maintenanceMode() && !shouldSkip(pathname, MAINTENANCE_BYPASS)) {
    const url = req.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  // Q1 — geo-block.
  // Vercel Edge attaches `x-vercel-ip-country` (ISO-3166-1 alpha-2) on
  // every deployed request. Next 15 removed the typed `request.geo`
  // shortcut so the header is the canonical source. Local dev sees
  // no header → no block, which is what we want.
  const country = req.headers.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  if (country && blocklist().has(country)) {
    const url = req.nextUrl.clone();
    url.pathname = `/blocked/${country}`;
    url.search = "";
    return NextResponse.rewrite(url, { status: 451 });
  }

  return NextResponse.next();
}

// Match every route except the static / asset / OG paths the
// middleware shouldn't touch. Keeping the exclusion list here lets
// the runtime ALWAYS_PASS check above stay small + readable.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|icon.svg|manifest.json|sw.js|sitemap.xml|robots.txt|api/health|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|map|txt|woff|woff2|ttf)).*)",
  ],
};
