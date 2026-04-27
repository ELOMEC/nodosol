# Cloudflare Turnstile setup

Group-chat writes (`post-chat-message` Edge Function) already include
a Turnstile verify hook (`web/components/TurnstileWidget.tsx` +
`verifyTurnstile()` call inside the function). The hook **gracefully
skips** when the env vars below aren't set — chat keeps working, but
without bot protection.

This doc walks through wiring it on for production.

## 1. Create the Turnstile site

1. Cloudflare dashboard → **Turnstile** (left sidebar)
2. **Add site**:
   - Site name: `Nodosol`
   - Domains: `nodosol.com`, `www.nodosol.com`,
     `*.vercel.app` (preview deploys),
     `localhost` (local dev)
   - Widget mode: **Managed** (auto-difficulty; falls back to
     interactive challenge when needed)
3. Copy the **Site key** and **Secret key** — you'll need both.

## 2. Set the public site key on Vercel

Vercel dashboard → `nodosol` project → **Settings → Environment
Variables**:

| Variable | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | site key from step 1 | Production, Preview, Development |

Trigger a redeploy (Vercel → Deployments → latest → **Redeploy**) so
the build picks up the env var. The widget mounts on group-chat
threads as soon as the var is non-empty.

## 3. Set the secret on Supabase

```bash
supabase secrets set TURNSTILE_SECRET_KEY=<secret from step 1>
```

## 4. Redeploy the chat Edge Function

```bash
supabase functions deploy post-chat-message --no-verify-jwt
```

The function reads `TURNSTILE_SECRET_KEY` on each invocation — once
the secret is present, every group-channel write is gated on a
successful verify. Failures are logged to `security_events` with
`event_type = "turnstile_fail"` (visible in the Admin → Security
Events widget).

## 5. Smoke test

1. Open `/chat/c/<any-channel>` in an incognito window.
2. Connect wallet, sign in.
3. Type a message and send.
4. The Turnstile widget should mount and self-verify within ~1s
   under normal traffic.
5. In Supabase SQL editor:

   ```sql
   select event_type, count(*)
   from security_events
   where event_type in ('turnstile_pass', 'turnstile_fail', 'jwt_issued')
     and created_at > now() - interval '5 minutes'
   group by event_type;
   ```

   You should see `jwt_issued` and (if Turnstile flagged anything)
   `turnstile_fail` rows.

## Troubleshooting

**Widget doesn't appear**
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` empty or unset → component
  short-circuits to `null`. Confirm it's set on Vercel for the
  current environment.
- Domain not in Cloudflare site allowlist → browser console will
  show a 401 from `challenges.cloudflare.com`.

**Every send fails with "Turnstile verify failed"**
- `TURNSTILE_SECRET_KEY` env empty on Supabase → the verify call
  short-circuits to `false`. Set it and redeploy
  `post-chat-message`.
- Site key / secret key mismatch (e.g. copied secret from a
  different site) → regenerate the pair in CF dashboard and
  reapply both.

**Want to disable temporarily without breaking chat**
- `supabase secrets unset TURNSTILE_SECRET_KEY` and redeploy the
  function. The graceful-skip path resumes; widget on the front
  becomes cosmetic but harmless.

## Where the code lives

| File | What it does |
|---|---|
| `web/components/TurnstileWidget.tsx` | Lazy `<Turnstile />` mount when site-key env is set |
| `supabase/functions/post-chat-message/index.ts` | `verifyTurnstile()` helper + per-channel gate |
| `supabase/015_security_events.sql` | `security_events` table the verify path logs to |

## Cost

Turnstile is free for unlimited verifications on Cloudflare's
dashboard tier. We don't pay anything for this surface.
