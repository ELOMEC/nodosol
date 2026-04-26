# Email notifications setup

End-to-end checklist to turn on email delivery for Nodosol notifications.

## Architecture

```
on-chain event
   ↓ (Helius webhook)
helius-webhook Edge Function
   ↓ (insert)
notifications table  ──────────►  realtime bell (already live)
   │
   │ pg_cron every minute (migration 019)
   ▼
send-notification-email Edge Function
   ↓ (Resend API)
inbox
```

A user only receives email if **all** of the following are true:

1. `notifications.email_eligible = true` (set by helius-webhook for high-signal events)
2. `notification_preferences.email` is set
3. `notification_preferences.email_verified_at` is non-null
4. The notification's `type` is in `email_types` allowlist (comma-separated, or `*` for all)

## One-time setup (Mladen)

### 1. Create a Resend account

- https://resend.com/signup (free tier: 3,000 emails/month, 100/day)
- Verify the `nodosol.com` sending domain — DNS records (SPF, DKIM, DMARC) provided by Resend dashboard
- Generate an API key (Settings → API Keys → Create) — scope: "Sending access"

### 2. Set Edge Function secrets

```bash
supabase secrets set RESEND_API_KEY=re_xxx_yyyy
supabase secrets set EMAIL_FROM_ADDRESS="Nodosol <notifications@nodosol.com>"
supabase secrets set APP_URL=https://www.nodosol.com
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase.

### 3. Deploy the Edge Function

```bash
supabase functions deploy send-notification-email --no-verify-jwt
```

### 4. Schedule the cron job

In Supabase SQL editor, paste `supabase/019_send_notification_email_cron.sql`,
replacing `<ANON_KEY>` with the project's anon key.

The job runs every minute and processes up to 50 pending notifications per
tick. Each call is idempotent — already-sent rows are skipped via
`email_sent_at IS NOT NULL`.

### 5. Test

1. Insert a test row in Supabase SQL editor:

   ```sql
   insert into notifications (wallet_pubkey, type, title, body, email_eligible)
   values ('YOUR_WALLET', 'tip_received', 'You got tipped!', 'Test email from Nodosol', true);

   insert into notification_preferences (wallet_pubkey, email, email_verified_at, email_types)
   values ('YOUR_WALLET', 'you@example.com', now(), '*')
   on conflict (wallet_pubkey) do update set
       email = excluded.email,
       email_verified_at = excluded.email_verified_at,
       email_types = excluded.email_types;
   ```

2. Wait up to 60 seconds. Check:
   - Resend dashboard → Logs → see the send
   - Inbox → email arrives
   - `notifications.email_sent_at` is now stamped

## Email types currently flagged email_eligible

(decided in `supabase/functions/helius-webhook/index.ts`, may evolve)

| Type | Description |
|---|---|
| `tip_received` | Creator received a tip |
| `subscription_charged` | Subscriber's monthly charge succeeded |
| `subscription_expired` | Subscriber's plan expired |
| `listing_sold` | Marketplace listing sold |
| `otc_accepted` | OTC deal counterparty accepted |
| `auction_settled_seller` | Auction settled — seller paid |
| `bid_revealed` | Sealed-bid auction bid revealed |
| `ticket_resale_sold` | Resold ticket sold |

## Troubleshooting

**Emails don't send and `email_sent_at` stays NULL**
- Check function logs: `supabase functions logs send-notification-email`
- Common causes: `RESEND_API_KEY` typo, sending domain not verified, recipient email malformed

**Emails send but `email_sent_at` updates without a real send**
- Means `notification_preferences.email_verified_at` was NULL or `email_types` didn't include the type — function marks the row done to avoid retry-loop
- Verify the prefs row exists and the type matches

**User wants to opt out of a specific type**
- Update `notification_preferences.email_types` to a comma-separated list excluding that type
- Or set `email_types = ''` to disable all email (rows will still queue then mark sent)

**Resend free tier exhausted (3k/month)**
- Upgrade to paid ($20/month for 50k) or rotate keys mid-cycle
- For self-hosted alternative later: SES, Postmark, or Mailgun all have similar APIs

## Next iterations (not in this drop)

- Email verification flow: send confirm link before stamping `email_verified_at`
- Per-creator branded templates (currently one Nodosol template for all)
- Digest mode: bundle daily activity into one summary email
- Unsubscribe link in footer (one-click via signed token)
