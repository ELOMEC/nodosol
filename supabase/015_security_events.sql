-- Security events log — append-only table for auth / abuse signals.
--
-- Written to by the chat Edge Functions (post-chat-message,
-- issue-chat-jwt) via the service role, never by clients. Provides a
-- single place to query when investigating suspicious activity
-- (rate-limit sprees, signature forgery attempts, Turnstile bot waves,
-- JWT issuance from a new wallet, pause-triggered events, etc.).
--
-- Rollout order:
--   1. Apply this migration.
--   2. Redeploy post-chat-message and issue-chat-jwt (they'll start
--      logging immediately).
--
-- Retention: not enforced at schema level. Archive or truncate rows
-- older than 90 days from a nightly job when the table grows large.

create table if not exists security_events (
    id bigserial primary key,
    -- Well-known event type. Keep snake_case + stable across versions
    -- so SQL filters don't break. Add new kinds by appending, never
    -- rename existing ones.
    event_type text not null,
    -- Wallet the event is attributed to, if known. Null for events
    -- where we failed to even extract a pubkey (e.g. malformed payload).
    wallet text,
    -- Best-effort client IP (Cloudflare / forwarded header). Null if
    -- the Edge Function runtime didn't forward one. Used for burst
    -- detection — correlate multiple events to a single source.
    client_ip text,
    -- Structured payload. Small — keep to <= 1KB. Examples:
    --   { "threadType": "group", "reason": "bad_signature" }
    --   { "thread": "otc_deal", "memoHash": "…", "sender": "…" }
    details jsonb not null default '{}'::jsonb,
    severity text not null default 'info' check (severity in ('info', 'warn', 'error')),
    created_at timestamptz not null default now()
);

create index if not exists idx_security_events_type_time
    on security_events (event_type, created_at desc);

create index if not exists idx_security_events_wallet_time
    on security_events (wallet, created_at desc) where wallet is not null;

create index if not exists idx_security_events_ip_time
    on security_events (client_ip, created_at desc) where client_ip is not null;

alter table security_events enable row level security;

-- No client-role policies: only service-role writes/reads. When admin
-- UI wants a read, it goes through an Edge Function (future work) or
-- the Supabase dashboard SQL editor.

-- --- Convenience views -----------------------------------------------------

-- Last 24h of error/warn events, most recent first. Run:
--   select * from security_events_recent_abuse;
-- from the SQL editor when investigating.
create or replace view security_events_recent_abuse as
select id, created_at, event_type, severity, wallet, client_ip, details
from security_events
where severity in ('warn', 'error')
  and created_at > now() - interval '24 hours'
order by created_at desc;

-- Per-wallet event count over the last hour. Easy burst check.
create or replace view security_events_hot_wallets as
select wallet,
       count(*)            as event_count,
       count(*) filter (where severity <> 'info') as warn_count,
       max(created_at)     as last_event_at
from security_events
where created_at > now() - interval '1 hour'
  and wallet is not null
group by wallet
having count(*) > 5
order by event_count desc;
