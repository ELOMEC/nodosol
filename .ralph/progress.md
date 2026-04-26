# Nodosol — Progress Tracker

> Single source of truth za ralph loop.
> `- [ ]` = nezavršeno, `- [x]` = završeno, `- [BLOCKED] reason` = blokirano.
> Ralph radi UVEK PRVI nezavršeni task u ovoj listi.

## Trenutni sprint — pre-fundraise polish

### Bucket A: Email waitlist + landing polish

- [x] Supabase migration `018_waitlist.sql` — tabela `waitlist` (id uuid pk, email citext unique, source text, referrer text, role text nullable, wallet_pubkey text nullable, created_at timestamptz default now()). RLS: anon SELECT none, anon INSERT allowed (rate-limited by Edge Function), service-role unrestricted. Verifikacija: `psql --dry-run` ili samo provjeri SQL syntax u editoru, pomoć: postojeća migracija `016_creator_profiles.sql` ima sličan pattern.
  - Created `supabase/018_waitlist.sql`: citext email unique, role enum check, indexes on created_at/role/source, RLS enabled with anon+authenticated INSERT policies and no SELECT policy (service role bypasses). Visual SQL syntax check (psql requires live server for full parse).

- [x] Edge Function `supabase/functions/waitlist-signup/index.ts` — POST `{email, source?, role?}`, validira email regex, rate-limita po IP (10/h koristi `security_events` patterne), insertuje preko service-role klijenta, vraća `{ok: true, position?: number}`. CORS open. Verifikacija: deno syntax check ako ima `deno`, inače smoke check fajla na valid TS.
  - Created `supabase/functions/waitlist-signup/index.ts`: email regex matching the migration CHECK constraint, role allowlist, per-IP 10/h rate limit via `security_events` (mirrors post-chat-message pattern), service-role insert, best-effort queue position via `count(*) where created_at <= row.created_at`, duplicate-email handled as silent ok to prevent enumeration. Deno not installed locally; verified with `tsc --noResolve` (only expected Deno/https-import errors, same as the other Edge Functions).

- [x] Web komponenta `web/components/WaitlistForm.tsx` — kontrolisani form sa email + opcionim role select-om (creator/buyer/issuer/investor), poziva `${SUPABASE_URL}/functions/v1/waitlist-signup`, prikazuje success state sa "You're #N on the list". Stil: dark theme `var(--shell-*)`. Verifikacija: `cd web && ./node_modules/.bin/tsc --noEmit`.
  - Created `web/components/WaitlistForm.tsx`: client component with email + optional role select, posts to `${SUPABASE_URL}/functions/v1/waitlist-signup` via `getSupabaseUrl()`, idle/submitting/success/error states, success renders "You're #N on the list". Used landing-page dark palette (per globals.css note "Public dark pages keep their own colours") instead of `--shell-*` since landing surface defaults to light tokens. Verified with `cd web && ./node_modules/.bin/tsc --noEmit` (clean).

- [x] Wire WaitlistForm u landing-u `web/app/page.tsx` — sekcija "Get early access" iznad/ispod telemetry strip-a, sa kratkim copy-em o launch plan-u. Verifikacija: `tsc --noEmit` + `npm run lint` u `web/`.
  - Imported `WaitlistForm` in `web/app/page.tsx` and added a "Get early access" card section directly below the telemetry strip with copy about audit-gated mainnet launch + role-routed beta invites, source tagged `landing`. Verified with `tsc --noEmit` (clean) and `npm run lint` (only a pre-existing ChatPanel warning, unrelated).

### Bucket B: Admin panel (minimal)

- [x] Web ruta `/admin` sa wallet-pubkey allowlist gate-om — `web/app/admin/{page.tsx,AdminView.tsx,layout.tsx}`. Allowlist u env varu `NEXT_PUBLIC_ADMIN_WALLETS` (comma-separated). Ako wallet nije na listi → 403 redirect na `/`. SolanaProviders wrapper iz drugih ruta. Verifikacija: `tsc --noEmit`.
  - Added allowlist gate inside `web/app/admin/AdminView.tsx`: parses `NEXT_PUBLIC_ADMIN_WALLETS` (comma-separated) at module load into a `Set`, derives `gate ∈ {connect, forbidden, ok}` from `useWallet()`, redirects forbidden viewers via `router.replace("/")`, skips RPC `reload()` until `ok`. Empty/unset env → no wallets pass (safe default). `connect` state shows a centered "Admin access" card with `WalletMultiButton`. Page/layout/providers untouched (SolanaProviders already wired). Documented the env var in `web/.env.example`. Verified with `cd web && ./node_modules/.bin/tsc --noEmit` (clean).

- [x] Admin volume widget — fetch `getSignaturesForAddress` za 9 programa sa limit=100, agregira po danu/sedmici/mjesecu, prikazuje grid sa per-program tx count + delta vs prethodna 24h. Reuse `web/components/NotificationsBell.tsx` pattern za batch fetch. Verifikacija: `tsc --noEmit`.
  - Created `web/components/AdminVolumeWidget.tsx`: parallel `getSignaturesForAddress({limit:100})` across all 9 program IDs (incl. `auctions` + `rwa_mint` not in admin.ts PROGRAMS), buckets by 24h/prev-24h/7d/30d using `blockTime`, renders aggregate tiles + per-program grid with delta badge vs previous 24h, refresh button, RPC failure isolated per row, "window ≈ Nd" hint when limit=100 truncates older counts. Wired into `web/app/admin/AdminView.tsx` directly under the page header (only rendered when `gate === "ok"` so non-admins skip the RPC). Verified with `cd web && ./node_modules/.bin/tsc --noEmit` (clean).

- [ ] Admin security events widget — read `security_events` tabela kroz Supabase service-role read (NEW Edge Function `admin-events` ili direct read sa allow-listed wallet JWT). Pokazuje top 20 recent + count po type-u (sig_verify_fail, rate_limit_hit, turnstile_fail, jwt_issued, challenge_expired). Verifikacija: `tsc --noEmit`, manual smoke da fetch radi.

- [ ] Admin panic button — UI dugme "Pause all programs" koje renderuje 7 `update_pause(true)` instrukcije za 7 paused programa kao Squads multisig proposal payload (TX message base58). Klik kopira payload u clipboard sa instrukcijom "Paste this into Squads UI as a new proposal". Ne šalje sam — Squads UI je security gate. Verifikacija: `tsc --noEmit`.

### Bucket C: Notification creator-side enrichment

- [ ] `helius-webhook` decoderi — RPC fetch `CreatorProfile.owner` za `tip_jar.send_tip` da emituje `tip_received` row za creator wallet. Cache ~5 min unutar invocation. Update test (manual: send fake Helius payload ili pokreni script). Verifikacija: deno-style fajl smoke check + dokumentacija u `docs/NOTIFICATIONS_SETUP.md`.

- [ ] `helius-webhook` decoderi — RPC fetch `Event.creator` za `event_tickets.buy_tier_ticket` da emituje `ticket_sold` row. Verifikacija: ista kao iznad.

- [ ] `helius-webhook` decoderi — RPC fetch `SubscriptionPlan.creator` za `subscription.charge` da emituje `subscription_revenue` row. Verifikacija: ista.

### Bucket D: Mainnet readiness paper-work

- [ ] `docs/mainnet-deploy-plan.md` review — pročitaj postojeći plan, identifikuj rupice (env-var split, treasury rotation, Squads mainnet setup, RPC migration). Dodaj checklist na kraj sa konkretnim pre-deploy tačkama. Verifikacija: dokument bude ažuriran, bez code change-a.

- [ ] `docs/MAINNET_ENV.md` — novi dokument koji lista sve env varove koji trebaju mainnet vrijednost (RPC URLs, USDC mint, treasury, program IDs, Helius webhook URL, Supabase project, Privy app ID). Tablica: var | dev value | mainnet value | who sets. Verifikacija: dokument exists.

## Backlog

(taskovi koji nisu prioritet ovog sprint-a — ralph ne dira osim ako ga eksplicitno premestiš gore)

- rights.nodosol.com Task 6 (rights_registry program scaffold)
- rights.nodosol.com Task 7 (rights-gateway Edge Function)
- Mobile (Expo) Privy integracija — sad samo deep-link wrapper
- Eventbrite cross-list integracija (event_tickets ↔ Eventbrite API)
- Email delivery: Resend integration + email-dispatch worker
- Audit firm follow-up automation (kad pošaljemo emails)

## Done log

(ralph automatski popunjava ovde sažetke završenih taskova)
