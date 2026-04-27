# State Audit — 2026-04-27

Refresh after Sprint 2 wrap-up (2026-04-26 → 2026-04-27, buckets F–O all
closed except Bucket P programs which are intentionally deferred). This
file replaces the 2026-04-26 ground-truth audit; that pre-Sprint snapshot
is in git history at commit `c5d697f` and earlier.

## Sprint 2 closure status

**38 of 39 task slots done**. Bucket P remains 2 code-only items
intentionally held for the next program-deploy window so Squads multisig
proposals batch.

| Bucket | Scope | Done | Notes |
|---|---|---|---|
| F — Notifications closure | settings page, verify, bell polish, unsubscribe | 4/4 | — |
| G — Discovery & growth | /creators, trending, trust signals, SEO baseline | 4/4 | — |
| H — Creator tools | analytics, OG card, subscribers, earnings CSV | 4/4 | — |
| I — Buyer tools | purchase history, wishlist primitive | 2/2 | per-card heart wiring deferred |
| J — Marketplace polish | empty states, URL hook, price alerts | 3/3 | matching pipeline deferred |
| K — UX | onboarding, PWA, i18n, mobile, a11y | 5/5 | — |
| L — Performance | Lighthouse, bundle split, image optim | 3/3 | — |
| M — Quality | error boundary, Playwright tip + ticket | 3/3 | mocked-Confirm Playwright deferred |
| N — Security ops | Turnstile doc, CSP, /security, rate-limit audit | 4/4 | — |
| O — Documentation | creator/buyer/integrations guides, FAQ, this audit | 5/5 | — |
| P — Programs (code-only) | auction reminders, bulk listing | 0/2 | held for next deploy window |

## What ships to production once main is deployed

Migrations 020 / 021 / 022 / 023 are applied (Mladen, 2026-04-27). Sprint 2
shipped on `auto/ralph-2026-04-26-0255` and merged to main; CI passes
after the `~/.cargo/bin` PATH fix.

### New web routes
- `/c/[handle]/og.png` — dynamic OG card (next/og)
- `/creators` — paginated discovery, search, sort
- `/creator/analytics` — lifetime + 30d activity, CSV export
- `/creator/subscribers` — per-plan subscribers list
- `/account/history` — tickets / subs / OTC / auction wins
- `/account/wishlist` — saved items grouped by type
- `/account/alerts` — price alerts CRUD
- `/settings/notifications` — email + per-type toggles
- `/verify` — email verification confirm
- `/u` — one-click unsubscribe
- `/security` — disclosure policy + program IDs
- `/faq` — top 12 questions accordion

### New Edge Functions
- `verify-email` — POST issue + GET confirm flow
- `unsubscribe-email` — HS256 token verify + opt-out
- `send-notification-email` — Resend dispatcher cron

### New schemas
- 020 — email_verification_token + sent_at on notification_preferences
- 021 — wishlist (composite PK, RLS by JWT sub)
- 022 — price_alerts (predicate columns, last-match dedupe)
- 023 — error_logs (service-role only)

### New components / libs
- TrendingPanel, TrustSignals, EmptyState, OnboardingTour, InstallPrompt,
  WishlistHeart, LocaleToggle.
- web/lib: notificationPrefs, wishlist, priceAlerts, useSearchParamsState,
  earnings, i18n; `creatorProfile.listProfiles` extended.

### Next.js / build hardening
- `next.config.mjs`: `images.remotePatterns` (Supabase + Helius +
  Arweave + IPFS), opt-in `@next/bundle-analyzer`, security headers
  (XCTO, XFO, Referrer-Policy, Permissions-Policy), CSP **report-only**
  with the enforcement flip flagged for Mladen after a clean reporting
  week.
- Service worker (`/sw.js`) + manifest.json under `web/public/`.
- E2E scaffolding: `playwright.config.ts` + `e2e/{tip,ticket}.spec.ts`,
  scripts wired in package.json.

### Docs added / updated
- CREATOR_GUIDE.md (10 sections), BUYER_GUIDE.md (7 sections),
  INTEGRATIONS_GUIDE.md (Blinks + on-chain + webhooks),
  TURNSTILE_SETUP.md, EMAIL_SETUP.md (extended for unsubscribe + verify),
  this STATE_AUDIT.md.

## Honest scope cuts (deferred follow-ups)

Each Sprint 2 task that traded a maximalist spec for a smaller honest
commit:

- **G1 /creators tip badge**: spec wanted sort by lifetime tip count;
  on-chain data, would need 20× RPC fetches per page render. Shipped
  without the badge; Helius bulk fetch is the right follow-up.
- **G2 trending "this week"**: on-chain stats are lifetime counters; no
  rolling window without per-tip history. Renamed "Top creators".
- **H1 top tippers**: same RPC-cost story; Helius enhanced-tx scan is
  the follow-up.
- **I2 wishlist heart wiring**: shipped the primitive (`WishlistHeart`)
  but didn't drop it into all 5 marketplace card components. Mechanical
  follow-up.
- **J2 URL persistence**: hook is reusable + auctions wired as proof;
  the remaining 4 marketplace views are mechanical migrations.
- **J3 price-alerts matching pipeline**: schema + management UI
  shipped; matcher (extend helius-webhook + 15-min reconcile cron) is
  the follow-up.
- **K3 i18n**: scaffold + toggle + 80 strings ready; per-surface `t()`
  wiring is mechanical.
- **L1 Lighthouse**: shipped the three default wins (preconnect, CLS
  dims, idle SW reg); real-browser score-before/after needs Mladen
  running it.
- **L2 bundle analyzer**: opt-in wired (`ANALYZE=true npm run build`);
  Mladen runs to surface top-3 chunks.
- **M2 / M3 Playwright wallet mock**: smoke specs cover routes up to
  the wallet-sign boundary; full mocked-Confirm needs
  `wallet-adapter-mock` + fake RPC, separate task.
- **N2 CSP enforce**: ships in `Content-Security-Policy-Report-Only`;
  flip header name after a week of clean reports.

## Still actively open (not shipped this sprint)

- **Bucket P** (auction reminders Edge Function, marketplace bulk
  listing UX) — held for the next program-deploy window.
- **Audit firm engagement** — outreach + scope sign + scheduling.
  Single biggest pre-mainnet signal; emails ready in
  `docs/AUDIT_OUTREACH.md`.
- **Mainnet deploy plan execution** — `docs/mainnet-deploy-plan.md` +
  `docs/MAINNET_ENV.md` are the runbook; treasury rotation + Squads
  mainnet ceremony + RPC migration all gated on audit close.
- **Mobile (Expo) Privy integration** — `mobile/` is still a
  Blink-deep-link wrapper.
- **Rights marketplace (`rights.nodosol.com`)** — Tasks 6 + 7 paused
  (rights_registry program scaffold + rights-gateway Edge Function).
- **Confidential Transfers (Arcium)** — waits on Arcium's public Jun
  2026 release.

## Memory drift notes

- Memory files `project_solana_superapp.md` and
  `project_nodosol_multitier.md` predate Sprint 2. This audit
  (2026-04-27) is the new anchor for "what's currently shipped".
  Future sessions should grep `.ralph/progress.md` Done log + this
  file before assuming a feature is missing.
- The "frontend state goes stale fast" lesson from the 2026-04-26
  audit still holds. Always `wc -l` / `grep` / `Read` before
  "let's build X".

## Pre-mainnet readiness scorecard

| Gate | Status |
|---|---|
| All program upgrade authorities on Squads multisig | ✓ devnet (3-of-5 hardware-signer ceremony pending for mainnet) |
| Global pause kill-switch on every fund-moving program | ✓ |
| solana_security_txt embedded in every program binary | ✓ |
| Wallet-signed JWT auth + RLS on every Supabase table | ✓ |
| security_events log + rate-limit on every public Edge Function | ✓ (issue-chat-jwt closed in Sprint 2 N4) |
| CSP + security headers shipping | ✓ report-only |
| Error boundary + error_logs pipeline | ✓ |
| Notifications + email pipeline end-to-end | ✓ (verify + unsubscribe + dispatcher all wired) |
| Public docs (creator, buyer, integrations, security, FAQ) | ✓ |
| Audit engagement | ✗ — outreach drafts ready in `docs/AUDIT_OUTREACH.md` |
| Mainnet treasury rotation + Squads ceremony | ✗ — gated on audit close |

Last updated 2026-04-27.
