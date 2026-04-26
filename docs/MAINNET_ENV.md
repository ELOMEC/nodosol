# Nodosol — Mainnet env-var inventory

> Companion to `docs/mainnet-deploy-plan.md` §8.1 (env-var split).
> Lists every env var required by web (Next.js), scripts (Node), and
> Supabase Edge Functions (Deno), with current devnet defaults and the
> mainnet target value. **Use this as the cutover checklist** — every
> "mainnet value" cell must be populated before flipping production.
>
> Last update: 2026-04-26

## How to read the columns

- **Var** — env-var name. `NEXT_PUBLIC_*` is bundled into the client and
  visible in the browser; everything else is server-only (Node runtime,
  Edge Function runtime, or build-time).
- **Where** — which surface reads it (`web`, `scripts`, `edge:<fn>`).
- **Dev value** — current devnet default (literal value or
  `<unset → fallback>` if not set in `.env.example`).
- **Mainnet value** — target value for production. `<TBD>` means a
  cutover task in §8 of `mainnet-deploy-plan.md` produces this.
- **Who sets** — which actor is responsible for provisioning. `Mladen`
  = founder ops; `Squads` = produced by multisig ceremony; `provider` =
  external SaaS dashboard (Vercel, Supabase, Helius, Privy, Cloudflare).

## A. Solana RPC + cluster

| Var | Where | Dev value | Mainnet value | Who sets |
|---|---|---|---|---|
| `SOLANA_RPC_URL` | web (server), scripts | `https://api.devnet.solana.com` | Helius mainnet dedicated node URL with API key | Mladen (provider: Helius) |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | web (client — `SolanaProviders`, `LandingProviders`) | `<unset → public devnet>` | Helius mainnet public RPC URL (separate from server URL; client-safe key) | Mladen (provider: Helius) |
| `NEXT_PUBLIC_HELIUS_API_KEY` | web (`lib/helius.ts`) | `<unset → enhanced-tx feature off>` | Helius mainnet API key (client-safe — read-only enhanced-tx scope) | Mladen (provider: Helius) |
| `RPC_URL` | edge:`helius-webhook`, edge:`charge-due` | `<unset → https://api.devnet.solana.com>` | Helius mainnet RPC URL (server-side, separate from client key) | Mladen (provider: Helius) |
| `GROUP_CHAT_ANTISPAM_RPC_URL` | edge:`post-chat-message` | `<unset → optional anti-spam disabled>` | Helius mainnet RPC URL (can reuse `RPC_URL`) | Mladen |
| `SOLANA_WALLET_PATH` | scripts | `~/.config/solana/id-devnet.json` | `~/.config/solana/id-mainnet.json` (cold-signed; never on dev machine) | Mladen |

## B. SPL tokens

| Var | Where | Dev value | Mainnet value | Who sets |
|---|---|---|---|---|
| `NEXT_PUBLIC_USDC_MINT` | web (`lib/constants.ts`) | `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` (mock USDC-Dev) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (Circle USDC mainnet) | Mladen |
| `DEMO_USDC_MINT` | scripts (`fund-user.ts`) | `73w3ocXSe2yDMWTHj1kwQxrbNjUY9tBJP9HYDkcpmh7h` | `<unset>` — demo flow is devnet-only | Mladen |

## C. Program IDs

Currently hard-coded inside `web/lib/<program>.ts` as `new PublicKey(...)`.
Mainnet keypairs come from §8.3 of `mainnet-deploy-plan.md` (cold
ceremony). Two acceptable patterns for cutover:

1. **Env-var per program** — add `NEXT_PUBLIC_<PROGRAM>_PROGRAM_ID`
   reads alongside each constant, fall back to the literal in dev. Lower
   risk for the cutover but requires touching ~10 files.
2. **Network-keyed constants module** — single
   `web/lib/programIds.ts` that exports `PROGRAM_IDS[network]`, where
   `network` is derived from `NEXT_PUBLIC_NETWORK` (`devnet` |
   `mainnet-beta`). Cleaner long-term.

Either way, the values in the table below are what gets produced by the
mainnet ceremony.

| Var (proposed) | Where (current literal) | Dev value | Mainnet value | Who sets |
|---|---|---|---|---|
| `NEXT_PUBLIC_TIP_JAR_PROGRAM_ID` | `web/lib/tipJar.ts`, `web/lib/constants.ts` | `C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P` | `<TBD — mainnet ceremony>` | Squads ceremony |
| `NEXT_PUBLIC_SUBSCRIPTION_PROGRAM_ID` | `web/lib/subscription.ts`, `web/lib/constants.ts` | `8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w` | `<TBD>` | Squads ceremony |
| `NEXT_PUBLIC_EVENTS_PROGRAM_ID` | `web/lib/constants.ts` | `4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax` | `<TBD>` (or unset if `events` is deprecated — see §8.0) | Squads ceremony |
| `NEXT_PUBLIC_EVENT_TICKETS_PROGRAM_ID` | `web/lib/eventTickets.ts` | `FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE` | `<TBD>` | Squads ceremony |
| `NEXT_PUBLIC_MARKETPLACE_PROGRAM_ID` | `web/lib/marketplace.ts` | `69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ` | `<TBD>` | Squads ceremony |
| `NEXT_PUBLIC_OTC_PROGRAM_ID` | `web/lib/otc.ts` | `FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz` | `<TBD>` | Squads ceremony |
| `NEXT_PUBLIC_RWA_REGISTRY_PROGRAM_ID` | `web/lib/rwa.ts` (`REGISTRY_PROGRAM_ID`) | `7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT` | `<TBD>` | Squads ceremony |
| `NEXT_PUBLIC_RWA_MINT_PROGRAM_ID` | `web/lib/rwa.ts` (`MINT_PROGRAM_ID`) | `HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU` | `<TBD>` | Squads ceremony |
| `NEXT_PUBLIC_AUCTIONS_PROGRAM_ID` | `web/lib/auctions.ts` | `6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v` | `<TBD>` | Squads ceremony |

Bubblegum / SPL-account-compression / SPL-noop program IDs in
`web/lib/eventTickets.ts` are Solana platform programs and have the
**same address on mainnet and devnet** — leave hard-coded.

## D. Treasury & cranker keypairs

| Var | Where | Dev value | Mainnet value | Who sets |
|---|---|---|---|---|
| Treasury ATA owner | on-chain `Config.treasury` per program | dev `treasury-keypair.json` (gitignored) | Squads vault PDA (preferred — see §8.2) | Squads ceremony |
| `CRANKER_KEYPAIR_JSON` | edge:`charge-due` | dev cranker keypair JSON | Mainnet cranker keypair JSON (separate from upgrade authority; funded with ≥0.5 SOL/month) | Mladen |

## E. Supabase

Recommendation in §8.1: fresh mainnet Supabase project, do NOT add a
`network` column to the devnet project.

| Var | Where | Dev value | Mainnet value | Who sets |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web (`lib/supabase.ts`) | devnet project URL | mainnet project URL (`https://<ref>.supabase.co`) | Mladen (provider: Supabase) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web (`lib/supabase.ts`) | devnet anon key | mainnet anon key (publishable) | Mladen (provider: Supabase) |
| `SUPABASE_URL` | scripts, all Edge Functions | devnet project URL | mainnet project URL | Mladen (auto-injected in Edge Function runtime) |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts (`seed-demo-rentals.ts` etc.), all Edge Functions | devnet service role key | mainnet service role key (rotate; never reuse devnet) | Mladen |
| `SUPABASE_ANON_KEY` | scripts | devnet anon key | mainnet anon key | Mladen |

## F. Edge Function secrets

| Var | Where | Dev value | Mainnet value | Who sets |
|---|---|---|---|---|
| `CHAT_JWT_SECRET` | edge:`issue-chat-jwt` | dev HS256 secret | freshly generated 32+ byte HS256 secret (do NOT reuse devnet) | Mladen |
| `ADMIN_WALLETS` | edge:`admin-events` | dev admin wallets (comma-sep base58) | mainnet admin wallets — **separate keypairs from devnet** (devnet keys may have leaked into demo seeders) | Mladen |
| `TURNSTILE_SECRET_KEY` | edge:`post-chat-message` | dev Turnstile secret | mainnet Turnstile secret (separate Cloudflare site) | Mladen (provider: Cloudflare) |
| `HELIUS_WEBHOOK_SECRET` | edge:`helius-webhook` | `<unset → no signature verification>` | mainnet Helius webhook signing secret (set when webhook is provisioned in §8.4) | Mladen (provider: Helius) |

## G. Web client public config

| Var | Where | Dev value | Mainnet value | Who sets |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | web | `nodosol` | `nodosol` (unchanged) | — |
| `NEXT_PUBLIC_APP_URL` | web (`lib/constants.ts`) | `http://localhost:3000` | `https://nodosol.com` | Mladen (provider: Vercel) |
| `NEXT_PUBLIC_ADMIN_WALLETS` | web (`app/admin/AdminView.tsx`) | dev admin wallets (comma-sep base58) | mainnet admin wallets — must match Edge Function `ADMIN_WALLETS` exactly | Mladen |
| `NEXT_PUBLIC_PRIVY_APP_ID` | web (`PrivyProviders`, `PrivyLoginButton`, `PrivyWalletBridge`) | dev Privy app ID | mainnet Privy app ID (separate Privy app for prod) | Mladen (provider: Privy) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | web (`LocationView`, `LocationPicker`) | dev Google Maps key | mainnet Google Maps key (HTTP referrer restricted to `nodosol.com`) | Mladen (provider: Google Cloud) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | web (`TurnstileWidget`) | dev Turnstile site key | mainnet Turnstile site key (separate Cloudflare site, paired with `TURNSTILE_SECRET_KEY`) | Mladen (provider: Cloudflare) |

## H. Demo / seeder vars (must be UNSET on mainnet)

These are read by demo flows on the landing page and seeder scripts.
Leaving them set on production would surface devnet artifacts to real
users.

| Var | Where | Dev value | Mainnet value | Who sets |
|---|---|---|---|---|
| `NEXT_PUBLIC_DEMO_CREATOR` | web | live demo creator wallet | `<unset>` | — |
| `NEXT_PUBLIC_DEMO_PLAN_ID` | web | `1` | `<unset>` | — |
| `NEXT_PUBLIC_DEMO_EVENT_ID` | web | `1` | `<unset>` | — |
| `METADATA_BASE_URL` | scripts (`seed-demo-data.ts`) | `https://www.nodosol.com/api/metadata` | `<unset>` — seeders not run against mainnet | — |

## I. Cutover checklist

- [ ] Every row above with `<TBD>` resolved (program IDs from §8.3,
  Helius URLs from §8.4, Squads vault PDA from §8.3)
- [ ] Vercel **production** environment scope created with all `web`
  rows populated; **preview/dev** scope keeps devnet values
- [ ] Mainnet Supabase project created; `supabase secrets set` run for
  every `edge:*` row
- [ ] `scripts/.env` (gitignored) created on the operator machine with
  mainnet values for any one-shot scripts that get re-run on mainnet
  (init scripts, `update_treasury` flow, etc.)
- [ ] Hard-code grep clean: `grep -rn "devnet\|mock-USDC\|Gh9ZwEmd\|api.devnet.solana.com" web/ scripts/ supabase/functions/`
  returns only test files, comments, and `.env.example` defaults
- [ ] Section H vars confirmed unset in Vercel production scope
- [ ] Smoke test: `vercel build` against the production env scope
  succeeds locally with the mainnet env loaded
