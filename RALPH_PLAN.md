# Ralph plan — Nodosol platform improvements

Pop top unchecked item. Implement it. Run typecheck (`cd web && npm run typecheck` or `cargo build-sbf` for programs). Commit with conventional message. Mark item done. Repeat.

**Rules**:
- One task = one commit. Small, atomic.
- Never deploy programs, never touch Squads, never set secrets, never push to main.
- All work on branch `ralph/automation` (create if missing).
- If task is ambiguous or requires Mladen input, leave a `## BLOCKED` note at top of this file with the question and skip to next task.
- After each task: typecheck must pass. If it doesn't, fix before commit.
- Memory writes are fine but keep terse.
- Verify before claiming done — open the file, grep for the symbol, run the typecheck.

## Tasks

### Notifications activation (paired with Mladen ops)
- [ ] Notification UI polish
  - Group notifications by day in NotificationsBell dropdown
  - Add filter chips: All / Sales / Subscriptions / Auctions
  - Empty state illustration + onboarding hint
  - Mark-all-read confirmation toast

### Discovery & growth
- [ ] Creator discovery `/creators` page
  - Index `creator_profiles` table (paginated, 20/page)
  - Search by handle/name, sort by total_tips/recent
  - Card grid: avatar, handle, bio snippet, tip count, subscribe count
  - Link from landing nav + sidebar
  - Empty state for fresh wallets

- [ ] Trending widget on landing
  - "Top creators this week" — getProgramAccounts on tip_jar, sort by recent activity
  - "Live auctions ending soon" — top 3 auctions
  - "Recent ticket sales" — last 5 events with sales
  - Cache 60s edge

- [ ] Trust signals on landing hero
  - Badge: "Audit pending — OtterSec" (placeholder, wire to actual when started)
  - Badge: "Squads 2-of-3 multisig"
  - GitHub stars counter (fetch + cache)
  - On-chain telemetry strip already exists; reorder above fold

### Creator tools
- [ ] Creator analytics dashboard `/creator/analytics`
  - Revenue chart last 30d (line chart, recharts)
  - Top tippers list (top 10 wallets by total)
  - Conversion: visitors (analytics if available) → tippers
  - CSV export button
  - Aggregate from getProgramAccounts client-side; cache in localStorage 5min

- [ ] Creator profile share card
  - OG image generator at `/c/[handle]/og.png` via `@vercel/og`
  - Avatar + handle + tip stats + QR to profile
  - Twitter/farcaster meta tags on `/c/[handle]`

### UX polish
- [ ] Onboarding tour (first-visit)
  - 4-step overlay: Connect wallet → Fund USDC → Browse marketplace → Done
  - localStorage flag `nodosol_tour_completed`
  - Skip button + "Don't show again"
  - Trigger on `/` and `/marketplace` first visit

- [ ] PWA manifest + install prompt
  - `public/manifest.json` with icons (use existing logo)
  - Service worker for offline shell (Workbox or vanilla)
  - Install banner with deferred prompt pattern
  - iOS Safari "Add to Home Screen" hint

- [ ] i18n scaffold (SR + EN)
  - next-intl setup
  - Wrap landing + `/marketplace` browse pages
  - Locale toggle in header
  - SR translations for top 50 strings
  - EN as default

- [ ] Empty states across marketplace
  - Audit `/marketplace/{events,auctions,rentals,resale,properties}` for empty grid handling
  - Add illustrated empty states with CTA ("Be the first to list")

### Performance & quality
- [ ] Lighthouse pass on `/` and `/marketplace`
  - Run lighthouse, fix top 3 issues
  - Image optimization (next/image everywhere)
  - Font display swap
  - Reduce JS bundle (analyze with @next/bundle-analyzer)

- [ ] Error boundary + Sentry-lite
  - Top-level error boundary with friendly message + report button
  - Log to Supabase `error_logs` table (migration 019)
  - Don't ship Sentry SDK — minimal custom is enough

### Documentation
- [ ] `docs/CREATOR_GUIDE.md` — how to set up handle, get tipped, run subscriptions
- [ ] `docs/BUYER_GUIDE.md` — how to buy tickets, attend events, OTC trade
- [ ] Update `docs/STATE_AUDIT.md` with current honest state after each session

## Done

### 2026-04-26
- [x] Email delivery integration via Resend — `de44f4d`
  - `supabase/functions/send-notification-email/index.ts` (Resend dispatcher, prefs-gated, type-filtered)
  - `supabase/019_send_notification_email_cron.sql` (pg_cron every minute)
  - `docs/EMAIL_SETUP.md` (Mladen ops checklist)
