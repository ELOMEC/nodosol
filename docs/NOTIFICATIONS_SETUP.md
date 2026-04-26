# Notifications stack — production wire-up

Code shipped (not yet wired to a live Helius endpoint):

- `supabase/017_notifications.sql` — `notifications` + `notification_preferences` tables, RLS gated by `auth.jwt()->>'sub'` (same pattern as chat read auth).
- `supabase/functions/helius-webhook/index.ts` — Edge Function that receives Helius enhanced-tx webhooks, decodes Nodosol-program transfers, inserts notification rows. Service-role bypass for inserts.
- `web/lib/notifications.ts` — fetch/markRead/realtime helpers.
- `web/components/NotificationsBell.tsx` — upgraded to read personal feed from Supabase + realtime postgres_changes when wallet has a cached chat JWT. Falls back to RPC global activity otherwise.

## Steps to activate

### 1. Apply migration

Open Supabase SQL editor → paste `supabase/017_notifications.sql` → run.

### 2. Deploy the Edge Function

```bash
supabase functions deploy helius-webhook --no-verify-jwt
```

### 3. Set function secrets

In Supabase dashboard → Edge Functions → helius-webhook → Secrets:

- `HELIUS_WEBHOOK_SECRET` = `openssl rand -hex 32` output (random; used to authenticate Helius hits)
- `SUPABASE_SERVICE_ROLE_KEY` is auto-set by the platform.

### 4. Configure Helius webhook

In the Helius dashboard (https://dashboard.helius.xyz):

- New Webhook → Enhanced Transactions
- Webhook URL: `https://<project-ref>.supabase.co/functions/v1/helius-webhook`
- Auth header: `Bearer <HELIUS_WEBHOOK_SECRET>`
- Account addresses: paste the 9 program IDs from `web/idl/*.json`
  - `C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P` (tip_jar)
  - `8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w` (subscription)
  - `4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax` (events)
  - `7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT` (rwa_registry)
  - `HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU` (rwa_mint)
  - `69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ` (marketplace)
  - `FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz` (otc_deals)
  - `FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE` (event_tickets)
  - `6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v` (auctions)
- Type: enhanced
- Network: devnet (switch to mainnet-beta after audit + mainnet deploy)

### 5. Test

Send a tip / buy a ticket from a test wallet. Check:

- Helius dashboard shows a delivered webhook hit
- Supabase logs (`Edge Functions → helius-webhook → Logs`) show 200 OK
- Run `select * from notifications order by created_at desc limit 5;` in SQL editor — rows should be there
- Open the NotificationsBell on the affected wallet (after signing the chat challenge once) — the row should show

## Email delivery (TODO — separate phase)

The schema reserves `email_eligible` + `email_sent_at` columns and `notification_preferences.email`. Production wire-up is two more pieces:

1. **Resend account** — sign up at resend.com, verify a sending domain (`mail.nodosol.com`). Set `RESEND_API_KEY` as Supabase function secret.
2. **`email-dispatch` Edge Function** — runs on a `pg_cron` or external scheduler, scans `notifications where email_eligible and email_sent_at is null and exists matching prefs row with email_verified_at`, sends via Resend, stamps `email_sent_at`.
3. **Email-verify flow** — wallet signs a challenge → user enters email → magic link via Resend → on click, set `email_verified_at`. Reuse the chat JWT for auth on the prefs upsert.

This is a future task — not blocking the in-app notifications pipeline.

## Per-program decoders (shipped 2026-04-26)

`helius-webhook/index.ts` now dispatches by Anchor IX discriminator
(sha256("global:" + ix_name).slice(0, 8)). 12 IXes have specific decoders:

| IX | Notifications emitted | Email-eligible |
|---|---|---|
| `tip_jar.send_tip` | `tip_sent` (donor) | no |
| `subscription.charge` | `subscription_charged` (subscriber) | yes |
| `subscription.expire` | `subscription_expired` (cranker) | yes |
| `marketplace.buy_listing` | `listing_bought` (buyer) + `listing_sold` (seller via transfer) | seller=yes |
| `otc_deals.propose_deal` | `otc_proposed` (counterparty) | yes |
| `otc_deals.accept_deal` | `otc_accepted_self` (buyer) + `otc_accepted` (seller via transfer) | seller=yes |
| `auctions.commit_bid` | `bid_committed` (bidder) | no |
| `auctions.reveal_bid` | `bid_revealed` (bidder) | no |
| `auctions.settle_auction` | `auction_settled_seller` (largest recipient) | yes |
| `event_tickets.buy_tier_ticket` | `ticket_bought` (buyer) | no |
| `event_tickets.buy_ticket_resale` | `resale_bought` + `resale_sold` (seller via transfer) | seller=yes |

### Known limitations (next iteration)

For programs where revenue lands in a vault PDA (tip_jar, subscription,
events.buy_ticket, event_tickets.buy_tier_ticket), the creator wallet
isn't reachable from token-transfer recipients alone — the
`creator_profile` / `event` / `plan` PDA owns the vault, and the
creator wallet is in a PDA field. To emit creator-side rows on those
flows, the Edge Function needs a one-shot RPC fetch of the parent PDA.
That's a follow-up; current behaviour: creators see updated stats on
their dashboard via the existing on-chain refresh, just no push
notification for tips/ticket-sales.

### Generic fallback

For unrecognized IXes inside known Nodosol programs, the function
falls back to `genericTransferRows()` which only emits to wallets
that are signers in the tx (filters out vault/treasury PDAs that
shouldn't receive personal notifications).
