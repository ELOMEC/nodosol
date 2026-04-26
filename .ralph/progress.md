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

- [x] Admin security events widget — read `security_events` tabela kroz Supabase service-role read (NEW Edge Function `admin-events` ili direct read sa allow-listed wallet JWT). Pokazuje top 20 recent + count po type-u (sig_verify_fail, rate_limit_hit, turnstile_fail, jwt_issued, challenge_expired). Verifikacija: `tsc --noEmit`, manual smoke da fetch radi.
  - Created `supabase/functions/admin-events/index.ts`: takes `{wallet, message, signature}` with challenge format `nodosol-admin:v1:<wallet>:<unixMs>` (≤2 min old, mirrors issue-chat-jwt), verifies ed25519 sig with tweetnacl, gates against `ADMIN_WALLETS` env allowlist (empty/unset = nobody passes), returns top 20 recent rows + per-type counts over last 24h, logs `sig_verify_fail`/`challenge_expired`/`admin_access_denied`/`admin_events_query` to security_events. Created `web/components/AdminSecurityEventsWidget.tsx`: client component that prompts wallet signMessage, posts to admin-events, renders count tiles + recent feed with severity badges. Wired into `web/app/admin/AdminView.tsx` directly under AdminVolumeWidget. Verified `cd web && tsc --noEmit` (clean) + `npm run lint` (only pre-existing ChatPanel warning). Edge Function smoke-checked via tsc --noResolve (only the expected Deno/https-import errors — same as the other Edge Functions).

- [x] Admin panic button — UI dugme "Pause all programs" koje renderuje 7 `update_pause(true)` instrukcije za 7 paused programa kao Squads multisig proposal payload (TX message base58). Klik kopira payload u clipboard sa instrukcijom "Paste this into Squads UI as a new proposal". Ne šalje sam — Squads UI je security gate. Verifikacija: `tsc --noEmit`.
  - Created `web/components/AdminPanicButton.tsx`: fetches each Config PDA via `getMultipleAccountsInfo`, slices the authority pubkey at offset 8 (shared layout across `Config` and `auctions::AuctionConfig`), builds 7 `update_pause(true)` ixs using the shared Anchor sighash `[6,56,103,134,181,122,69,108]`, compiles a legacy `TransactionMessage` with the discovered authority as fee payer, base58-encodes the message bytes for paste into Squads → Build Transaction → Import. Surfaces missing/mismatched-authority programs as warnings; never signs or sends. Wired into `web/app/admin/AdminView.tsx` directly above AdminVolumeWidget. Verified `cd web && tsc --noEmit` (clean) + `npm run lint` (only pre-existing ChatPanel warning).

### Bucket C: Notification creator-side enrichment

- [x] `helius-webhook` decoderi — RPC fetch `CreatorProfile.owner` za `tip_jar.send_tip` da emituje `tip_received` row za creator wallet. Cache ~5 min unutar invocation. Update test (manual: send fake Helius payload ili pokreni script). Verifikacija: deno-style fajl smoke check + dokumentacija u `docs/NOTIFICATIONS_SETUP.md`.
  - In `supabase/functions/helius-webhook/index.ts`: added `fetchCreatorOwner(pda)` that does a JSON-RPC `getAccountInfo` against `RPC_URL` (defaults to devnet), slices `CreatorProfile.owner` from bytes 8..40 (layout per `programs/tip_jar/src/state.rs`), and caches results in a module-level `Map` for 5 min per-instance. Made `IxDecoder` and `decodeTx` async so the `tip_jar.send_tip` decoder can await the lookup; emits a new `tip_received` (email_eligible) row for the creator wallet alongside the existing `tip_sent` row, skipping when donor==creator or RPC fails. Updated `docs/NOTIFICATIONS_SETUP.md` decoder table + replaced the "Known limitations" section with a "Creator-side enrichment via RPC fetch" section. Smoke-checked with `tsc --noResolve` against the file: same 9 expected Deno/https-import errors as before, no new errors. Web `tsc --noEmit` still clean.

- [x] `helius-webhook` decoderi — RPC fetch `Event.creator` za `event_tickets.buy_tier_ticket` da emituje `ticket_sold` row. Verifikacija: ista kao iznad.
  - In `supabase/functions/helius-webhook/index.ts`: refactored the previous `fetchCreatorOwner` into a generic `fetchPdaPubkeyAt(pda, offset)` (cache key `${pda}:${offset}`) and routed the existing `tip_jar.send_tip` decoder through it. Made the `event_tickets.buy_tier_ticket` decoder async and added a `ticket_sold` row for the event creator (resolved via `fetchPdaPubkeyAt(event, 8)` per `programs/event_tickets/src/state.rs` Event layout), `email_eligible: true`, skipped when buyer==creator or RPC fails. Updated `docs/NOTIFICATIONS_SETUP.md` decoder table + creator-side enrichment "Coverage so far" / "Pending" sections. Smoke-checked with `tsc --noResolve` against the file (only the same expected Deno/https-import errors as before, no new errors); web `tsc --noEmit` still clean.

- [x] `helius-webhook` decoderi — RPC fetch `SubscriptionPlan.creator` za `subscription.charge` da emituje `subscription_revenue` row. Verifikacija: ista.
  - In `supabase/functions/helius-webhook/index.ts`: made the `subscription.charge` decoder async and added a `subscription_revenue` row for the plan creator (resolved via `fetchPdaPubkeyAt(plan, 8)` per `programs/subscription/src/state.rs` — `SubscriptionPlan.creator` is the first field after the Anchor discriminator), `email_eligible: true`, skipped when subscriber==creator or RPC fails. Updated the offset reference comment in `fetchPdaPubkeyAt` and the `docs/NOTIFICATIONS_SETUP.md` decoder table + "Coverage so far"/"Pending" sections. Smoke-checked with `tsc --noResolve` against the file (only the same 8 expected Deno/https-import errors as before, no new errors); web `tsc --noEmit` still clean.

### Bucket D: Mainnet readiness paper-work

- [x] `docs/mainnet-deploy-plan.md` review — pročitaj postojeći plan, identifikuj rupice (env-var split, treasury rotation, Squads mainnet setup, RPC migration). Dodaj checklist na kraj sa konkretnim pre-deploy tačkama. Verifikacija: dokument bude ažuriran, bez code change-a.
  - Appended Section 8 "Identified gaps & supplemental pre-deploy checklist" to `docs/mainnet-deploy-plan.md`: 8.0 drift fixes (migrations 001–018 vs doc's 001–012, 7 Edge Functions vs 3, audit-scope reconciliation), 8.1 env-var split (Vercel scope, MAINNET_ENV.md table, hard-code grep, full mainnet var inventory incl. `NEXT_PUBLIC_ADMIN_WALLETS` + Edge Function `RPC_URL`/`JWT_SIGNING_KEY`/`ADMIN_WALLETS`), 8.2 treasury rotation ceremony (preferred Squads vault PDA path + assertion + sweep), 8.3 Squads mainnet ceremony (3 signers, Ledger, $1 USDC test, panic-button dress rehearsal), 8.4 RPC migration (Helius key, webhook secret, fallback RPC, `RPC_URL` Edge Function env warning), 8.5 cutover dress rehearsal. Updated "Last update" to 2026-04-26. Doc-only change, no code touched.

- [x] `docs/MAINNET_ENV.md` — novi dokument koji lista sve env varove koji trebaju mainnet vrijednost (RPC URLs, USDC mint, treasury, program IDs, Helius webhook URL, Supabase project, Privy app ID). Tablica: var | dev value | mainnet value | who sets. Verifikacija: dokument exists.
  - Created `docs/MAINNET_ENV.md` with 9 sections (RPC, SPL tokens, program IDs, treasury/cranker, Supabase, Edge Function secrets, web public config, demo-vars-must-be-unset, cutover checklist). Grouped by surface (web/scripts/edge:*) with columns var | where | dev value | mainnet value | who sets. Cross-referenced §8.1/8.2/8.3/8.4 of `mainnet-deploy-plan.md`. Inventory built by grepping `process.env.` and `Deno.env.get` across `web/`, `scripts/`, `supabase/functions/` plus the 9 hard-coded `PROGRAM_ID = new PublicKey(...)` constants. Doc-only change; no code touched.

### Bucket E: Email delivery (paired with Mladen ops)

- [x] Resend email dispatch worker — Edge Function `supabase/functions/send-notification-email/` čita pending `notifications` (email_eligible + no email_sent_at), join sa `notification_preferences` (verified email + type allowlist), šalje preko Resend API, stamp-uje `email_sent_at`. Migracija `019_send_notification_email_cron.sql` schedule-uje pg_cron svaku minutu. Doc `docs/EMAIL_SETUP.md` sa Mladen ops checklistom (Resend signup, DNS verify, secrets, deploy, test).
  - Commit `de44f4d`. 3 fajla: `supabase/functions/send-notification-email/index.ts` (276 LoC, idempotent batch=50, prefs-gated, type-filtered, dark-theme HTML template), `supabase/019_send_notification_email_cron.sql` (`* * * * *` cron, mirrors charge-due pattern), `docs/EMAIL_SETUP.md` (5-step Mladen setup + troubleshooting + future iterations note). Migration 019 applied in Supabase by Mladen 2026-04-26.

## Sprint 2 — post-fundraise polish (2026-04-26 onwards)

> Naredni sprint nakon što su Bucket A-E završeni. Prioritet: closure of email loop, then growth (discovery + trust signals), then creator/buyer tools, then UX polish.

### Bucket F: Notification UX closure

- [ ] Notification settings page `/settings/notifications` — web/app/settings/notifications/{page.tsx,layout.tsx,SettingsView.tsx}. Sekcije: email address (set/change with verify CTA), per-type toggles (tip_received, ticket_sold, subscription_charged, otc_accepted, auction_settled_seller, listing_sold, ticket_resale_sold, bid_revealed). Save preko service-role JWT (chat-jwt pattern). Treba migracija `020_email_verification.sql` ako kolone nisu spremne (dodati `email_verification_token text`, `email_verification_sent_at timestamptz`). Verifikacija: `tsc --noEmit`.

- [ ] Email verification flow — Edge Function `supabase/functions/verify-email/index.ts`: prima `{wallet, email, sig}` i šalje verify email sa signed token (HMAC, 24h TTL). GET `/verify-email?token=...` u web ruti (`/verify`) postavlja `email_verified_at = now()`. Upsert preko service-role. Verifikacija: tsc, deno smoke.

- [ ] Notification feed polish u NotificationsBell — group by day (Today/Yesterday/Earlier), filter chips (All/Sales/Subscriptions/Auctions/Tips), empty state ilustracija sa "No activity yet — share your profile to start receiving tips" CTA, mark-all-read confirm toast. Verifikacija: `tsc --noEmit`, vizuelno smoke.

- [ ] Unsubscribe link u email footer — signed token pattern. GET `/u?t=<hmac>` Edge Function gasi `email_types` ili specifičan tip. Token sadrži `wallet:type:expiry`. Update `send-notification-email` da renderuje unsubscribe link u footer-u. Verifikacija: tsc.

### Bucket G: Discovery & growth

- [ ] Creator discovery `/creators` page — `web/app/creators/{page.tsx,CreatorsView.tsx}`. Paginated 20/page index `creator_profiles` table (Supabase REST, no RLS issue jer je profile public). Search by handle/display_name (ILIKE), sort by `total_tips_received_lamports` desc / `created_at` desc. Card grid (avatar, handle, bio snippet, on-chain tip count badge, subscribe count). Empty state: "Be the first creator on Nodosol" sa link na `/creator/profile`. Wire link iz landing nav + `/marketplace` sidebar. Verifikacija: tsc.

- [ ] Trending widget na landing — `web/components/TrendingPanel.tsx`. 3 sekcije: "Top creators this week" (`getProgramAccounts` na tip_jar, sort by stat slot za nedjeljnu aktivnost), "Live auctions ending soon" (top 3 by reveal_end_at, fetch from auctions program), "Recent ticket sales" (last 5 events sa sold count > 0). Cache 60s preko `unstable_cache` ili `revalidate: 60` na server component. Insert iznad telemetry strip-a u `web/app/page.tsx`. Verifikacija: tsc.

- [ ] Trust signals na landing hero — `web/app/page.tsx` hero refresh: dva badge-a iznad CTA, "Audit pending — OtterSec" (placeholder, stat hardcoded sad, kasnije wire na real status), "Squads 2-of-3 multisig" sa link na `docs/SECURITY_RUNBOOK.md` na GitHub-u. GitHub stars counter (`fetch https://api.github.com/repos/ELOMEC/nodosol`, cache 1h). Re-order: trust signals iznad fold-a, ispod naslova. Verifikacija: tsc + manual hero render.

- [ ] SEO baseline — `web/app/sitemap.ts` (Next 15 sitemap convention; lista svih statičkih ruta + dinamička iz creator_profiles + active auctions/events), `web/app/robots.ts` (allow all + sitemap link), OG meta tagovi na `/c/[handle]`, `/marketplace/events/v/[address]`, `/marketplace/auctions/[address]` (dynamic title + description + image preko `generateMetadata`). Verifikacija: tsc, fetch sitemap.xml na localu.

### Bucket H: Creator tools

- [ ] Creator analytics dashboard `/creator/analytics` — `web/app/creator/analytics/{page.tsx,AnalyticsView.tsx}`. Aggregate from `getProgramAccounts(tip_jar)` filtrirano na CreatorProfile owner==wallet, sort by stat slot. Revenue chart 30d (line, recharts), top 10 tippers (sort by total), conversion stats (visitors u Vercel Analytics ako je dostupan, inače skip). CSV export (`Blob` + download anchor). Cache u `localStorage` 5min ključ `analytics:<wallet>`. Verifikacija: tsc.

- [ ] OG image generator `/c/[handle]/og.png` — `web/app/c/[handle]/og.png/route.tsx` koristi `@vercel/og` (nije dep yet — dodati u `web/package.json`). Renders 1200×630 PNG: avatar (fetched), handle, display name, bio snippet, on-chain tip stats badge, QR za profile URL. Update `generateMetadata` u `web/app/c/[handle]/page.tsx` da postavi `openGraph.images` + `twitter.card='summary_large_image'`. Verifikacija: tsc, fetch png na localu.

- [ ] Subscriber list page `/creator/subscribers` — `web/app/creator/subscribers/{page.tsx,SubscribersView.tsx}`. Fetch sve `Subscription` accounts gdje plan.creator==wallet (kroz `getProgramAccounts(subscription)` + filter), grupiše po planu, prikaže subscriber wallet, status, total paid, next charge. Reuse styling iz `/creator/events/[id]`. Verifikacija: tsc.

- [ ] Creator earnings CSV export — wire u `/creator/analytics` ili poseban dugme na `/creator`. Aggregate tip + subscription + event ticket revenue, format `date,type,amount_usdc,from_wallet,signature`. Verifikacija: tsc, manual download check.

### Bucket I: Buyer tools

- [ ] Purchase history `/account/history` — `web/app/account/history/{page.tsx,HistoryView.tsx}`. Fetch po wallet-u: tickets owned (cNFT search via Helius DAS), subscriptions active (Subscription accounts where subscriber==wallet), OTC deals (OtcDeal accounts as buyer ili seller), auction wins (Auction accounts where highest_bidder==wallet). Group by type, sort recent. Verifikacija: tsc.

- [ ] Wishlist (saved items) — migracija `021_wishlist.sql` (`wishlist (wallet_pubkey, item_type, item_id, created_at) RLS by jwt sub`). Heart icon u marketplace cards, toggle add/remove. `/account/wishlist` ruta sa saved items grid. Verifikacija: tsc + SQL syntax.

### Bucket J: Marketplace polish

- [ ] Empty states across 5 marketplace verticals — audit `/marketplace/{events,auctions,rentals,resale,properties}` views, dodati `EmptyState` komponentu (illustration + headline + CTA). Komponenta nova: `web/components/EmptyState.tsx`. CTA varijante per vertical: "Be the first to list", "Start an auction", itd. Verifikacija: tsc.

- [ ] Filter persistence via URL params — `web/lib/useSearchParamsState.ts` helper hook (sync state ↔ `useSearchParams`). Wire u 5 marketplace views da search/sort/filters zive u URL-u (deep-linkable + shareable). Verifikacija: tsc + manual URL share test.

- [ ] Price alerts — migracija `022_price_alerts.sql` (`price_alerts (wallet, query, max_price_usdc, created_at) RLS`). Edge Function `price-alert-check` (cron 15min) — match alerts protiv aktivnih listinga, insert notifications kad hit. UI: "Alert me when…" dugme u marketplace search bar. Verifikacija: tsc + SQL.

### Bucket K: UX polish

- [ ] Onboarding tour (first-visit) — `web/components/OnboardingTour.tsx` 4-step overlay (Connect wallet → Fund USDC → Browse marketplace → Done). `localStorage` flag `nodosol_tour_completed`. Skip + "Don't show again". Trigger na `/` i `/marketplace` first visit. Verifikacija: tsc.

- [ ] PWA manifest + install prompt — `web/public/manifest.json` (icons koristi postojeći logo, theme_color, display standalone). `web/public/sw.js` minimal (offline cache shell). `web/components/InstallPrompt.tsx` deferred prompt pattern + iOS Safari "Add to Home Screen" hint banner. `<link rel="manifest">` u `web/app/layout.tsx`. Verifikacija: tsc + Lighthouse PWA audit.

- [ ] i18n scaffold (SR + EN) — `next-intl` install, `web/messages/{en.json,sr.json}` sa top 80 stringova (landing + marketplace nav + buy/sell CTA labels). Locale toggle u header desno od ConnectButton. Default EN, persist u `localStorage`. Wrap `web/app/layout.tsx` u `NextIntlClientProvider`. Verifikacija: tsc + manual locale switch.

- [ ] Mobile responsive audit — top 5 ruta (`/`, `/marketplace`, `/marketplace/events`, `/c/[handle]`, `/creator`). Fix overflow-x, font-size na <360px, touch target sizes na CTA dugmadima (min 44×44). Verifikacija: tsc + manual viewport sweep 320–768px.

- [ ] Accessibility baseline — semantic HTML pass (h1/h2 hierarchy, landmark roles), `alt` na svim slikama, focus-visible outlines, aria-labels na icon-only buttons (notification bell, theme toggle, search). axe DevTools check na `/` i `/marketplace`. Verifikacija: tsc + axe report u commit message.

### Bucket L: Performance

- [ ] Lighthouse pass `/` — pokreni Lighthouse, fix top 3 issue-a (vjerovatno LCP image optim, CLS, render-blocking JS). Document baseline → target u commit message. Verifikacija: tsc + Lighthouse score before/after.

- [ ] Bundle analysis & code splitting — `@next/bundle-analyzer` install, identifikuj top-3 paketa po size, dynamic-import za marketplace tabs i admin. Verifikacija: tsc + bundle-analyzer report screenshot.

- [ ] Image optimization audit — sve `<img>` tagove u `web/components/` i `web/app/` migrate na `next/image` sa eksplicitnim `width/height`. `web/next.config.ts` dodaj `images.remotePatterns` za Supabase storage + Helius CDN. Verifikacija: tsc + grep `<img ` count before/after.

### Bucket M: Quality

- [ ] Error boundary + error logging — `web/app/error.tsx` (Next 15 root error boundary) + `web/app/global-error.tsx` (root layout fail fallback). Friendly "Something broke" UI sa Report button. Migracija `023_error_logs.sql` (`error_logs (id, wallet, route, message, stack, ua, created_at) RLS service-role only`). `/api/log-error` Next.js route handler insert via service-role. Verifikacija: tsc + SQL syntax.

- [ ] Playwright E2E: tip flow — `web/e2e/tip.spec.ts`. Mock wallet (use `@solana/wallet-adapter-mock` ili stub `window.solana`). Navigate `/c/[handle]`, click Tip $5, verify tx submitted (mocked Confirm). Verifikacija: `npx playwright test`.

- [ ] Playwright E2E: ticket purchase — `web/e2e/ticket.spec.ts`. Navigate event detail, select tier, click Buy, verify Blink action triggered. Verifikacija: playwright test.

### Bucket N: Security ops

- [ ] Cloudflare Turnstile env wire-up doc — `docs/TURNSTILE_SETUP.md`. Step-by-step (CF dashboard → site key + secret key → Vercel env → Supabase function secret → redeploy `post-chat-message`). Reference TurnstileWidget već u `web/components/`. Doc-only. Verifikacija: doc exists.

- [ ] CSP headers — `web/next.config.ts` dodaj `headers()` async funkciju sa `Content-Security-Policy` (default-src 'self', script-src 'self' 'unsafe-inline' Privy + Vercel insights, connect-src Solana RPC + Supabase + Helius, img-src * data:). Test sa CSP report-only prvo, ako čisto onda enforce. Verifikacija: tsc + browser console CSP report.

- [ ] `/security` disclosure page — `web/app/security/{page.tsx,SecurityView.tsx}`. Statički sadržaj: security_txt summary, audit status, multisig info, contact email, responsible disclosure policy. Verifikacija: tsc.

- [ ] Rate limiting on remaining unprotected endpoints — audit `supabase/functions/*` za one koji nemaju `security_events` rate-limit gate. Konkretno proveri: `verify-email` (kad ga napravimo), `send-notification-email` (server-only, OK), `admin-events` (već ima). Verifikacija: grep + smoke.

### Bucket O: Documentation

- [ ] `docs/CREATOR_GUIDE.md` — kako se postavlja handle, kako se prima tip, kako se kreira plan/event, kako se withdraw revenue. Korak po korak sa screenshot placeholder-ima (Markdown image refs `[creator-handle.png]`). Verifikacija: doc exists.

- [ ] `docs/BUYER_GUIDE.md` — kako se kupuje ticket, attend event, OTC trade, subscribe na rental. Verifikacija: doc exists.

- [ ] `docs/INTEGRATIONS_GUIDE.md` — za partner devs. Blink endpoints reference, on-chain events za webhooks, Helius webhook payload primjer. Verifikacija: doc exists.

- [ ] FAQ page `/faq` — `web/app/faq/page.tsx`. Top 12 pitanja sa accordion UI: "What is Nodosol?", "Do I need crypto knowledge?", "Is it audited?", "What chains?", "How do tips work?", itd. Verifikacija: tsc.

- [ ] Update `docs/STATE_AUDIT.md` — refresh sa svime sto smo shipped od 2026-04-26. Verifikacija: doc updated.

### Bucket P: Programs (code only — Mladen deploys via Squads)

- [ ] Auction reminder ix — NE, ovo je off-chain. Skip. Pravi task: webhook decoder za `auctions.commit_bid` da emituje `bid_committed` row za auction creator (već postoji decoder, ali dodaj reminder cron 24h prije reveal_end_at). Migracija nije potrebna; novi Edge Function `auction-reminders` cron 1h frequency, čita aktivne aukcije gdje reveal_end_at unutar 24-25h prozora, insertuje `auction_ending_soon` notifikaciju za bidders. Verifikacija: deno smoke + tsc.

- [ ] Marketplace bulk listing UX — `web/app/marketplace/list/page.tsx` form: select N RWA assets, set price each, single submit batches transactions sequentially. Reuse `simulateAndSend` helper. Verifikacija: tsc.

## Backlog

(taskovi koji nisu prioritet ovog sprint-a — ralph ne dira osim ako ga eksplicitno premestiš gore)

- rights.nodosol.com Task 6 (rights_registry program scaffold)
- rights.nodosol.com Task 7 (rights-gateway Edge Function)
- Mobile (Expo) Privy integracija — sad samo deep-link wrapper
- Eventbrite cross-list integracija (event_tickets ↔ Eventbrite API)
- Audit firm follow-up automation (kad pošaljemo emails)
- Confidential Transfers via Arcium (čeka public release Jun 2026)
- Custom domains za creators (long-term, post-mainnet)
- Per-creator branded email templates (post-MVP)
- Daily digest mode za email notifikacije
- Compressed NFT optimizations (concurrent merkle tree resize)
- Admin role hierarchy (super-admin / moderator / read-only)

## Done log

(ralph automatski popunjava ovde sažetke završenih taskova)
