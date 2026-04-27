# Geo-block admin (Edge Config)

`/admin/geo-block` lets an allowlisted admin pick which ISO-3166
country codes get served the 451 page (`/blocked/[country]`)
without a redeploy. Source-of-truth precedence in
`web/middleware.ts`:

1. **Vercel Edge Config** key `geo_block` (array of ISO codes)
2. **`GEO_BLOCK_COUNTRIES`** env var (comma-separated codes)
3. Hardcoded `["US"]` if neither is set

The middleware reads on every request. Edge Config has sub-ms p95
latency at the edge so this is fine. Edge Config errors are
swallowed and we fall through to the env / hardcoded path so a
misread never breaks the site.

## One-time setup (Mladen)

### 1. Create the Edge Config store

Vercel dashboard → **Storage** → **Create database** → **Edge
Config** → name it `nodosol-config`. Create the empty store.

### 2. Connect it to the project

On the Edge Config page → **Connect project** → pick the `nodosol`
project → environments **Production + Preview**. Vercel auto-injects
`EDGE_CONFIG` (the read connection string) into both environments.

### 3. Generate a personal API token

Vercel → **Account Settings** → **Tokens** → **Create token**.
Name it `nodosol-edge-config-write`, scope to the team that owns
the project, expiration to your taste (90 days is reasonable; bake
a calendar reminder).

### 4. Set the write env vars on the project

Vercel → project → **Settings** → **Environment Variables**, add
to **Production + Preview**:

| Variable | Value |
|---|---|
| `VERCEL_API_TOKEN` | the token from step 3 |
| `VERCEL_EDGE_CONFIG_ID` | the `ecfg_…` id from step 1 (shown on the Edge Config detail page) |
| `VERCEL_TEAM_ID` | only if the Edge Config lives under a team (skip for personal accounts) |

Redeploy production once so the new env vars land.

### 5. First save

Open `/admin/geo-block` from the topbar Admin pill. The yellow
banner "Edge Config not yet configured" should be gone — the page
loads with whatever's currently in `geo_block` (empty by default).
Tick **United States** → **Save** → wait ~60s for propagation →
verify in a private window from a US IP (or via a US VPN) that
`/` redirects to `/blocked/US`.

## Day-to-day

- Adding/removing countries: tick → Save. Propagation typically
  completes in under a minute.
- Reverting: untick everything, save. The list is empty;
  middleware falls back to the env / hardcoded path. To completely
  disable geo-block, also unset `GEO_BLOCK_COUNTRIES` on Vercel
  (otherwise that's the next fallback).
- Hard kill from CLI without dashboard access: `curl -X PATCH
  -H "Authorization: Bearer $VERCEL_API_TOKEN" -H "Content-Type:
  application/json" "https://api.vercel.com/v1/edge-config/$ID/items"
  -d '{"items":[{"operation":"upsert","key":"geo_block","value":[]}]}'`

## Cost

Edge Config reads are billed per request. As of 2026 the free tier
covers 1M reads/month; nodosol's middleware reads run on the edge
matcher (every non-static request). At ~10k DAU x ~30 routes/day
that's ~300k reads/day. **Watch the billing tab after launch** —
if you cross the free tier, either upgrade to Pro ($20/mo includes
3M reads) or add a short in-memory cache in middleware
(stale-while-revalidate up to 30s).

## Troubleshooting

- **451 doesn't fire on a known-blocked country**: confirm
  Vercel actually emits `x-vercel-ip-country` (it doesn't on
  preview deployments served from `*.vercel.app` for some IPs).
  Test on the prod domain.
- **Save returns 503**: `VERCEL_API_TOKEN` or
  `VERCEL_EDGE_CONFIG_ID` missing. The error message in the toast
  tells you which.
- **Save returns 502**: token expired or doesn't have
  `edge-config:write` scope. Create a fresh token.
- **Changes don't propagate**: Vercel Edge Config docs claim ~60s
  global propagation but the SDK aggressively caches inside a
  function instance. After a save, wait, then test from a fresh
  private window — the read goes through the regional edge cache
  which honours the new value.
