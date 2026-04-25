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

## Per-program decoder TODO

`helius-webhook/index.ts` currently emits generic `tip_received` / `token_inflow` / `token_outflow` rows from token-transfer side-effects. To get program-specific titles ("Auction settled — you won", "OTC deal accepted"), extend `decodeTx()`:

- Match on `programs` set + IX discriminator (first 8 bytes of `data` base58-decoded)
- Read accounts[] positions from the IDL — e.g. `subscription.charge` has subscription PDA at index 2, subscriber inferred from PDA seeds
- Emit one row per affected wallet with `email_eligible: true` for high-signal events (tip, auction win, OTC accept)

Pattern: keep the generic fallback so unrecognized IXes still produce *something* visible. Iterate decoders as we have time.
