-- Email waitlist for pre-launch / fundraise traction signal.
--
-- Captures sign-ups from the marketing landing page. Writes go through
-- the `waitlist-signup` Edge Function (service role) which performs
-- email validation + per-IP rate limiting (logging abuse to
-- security_events). RLS allows anonymous INSERT as a defence-in-depth
-- fallback — the Edge Function is the canonical entry point and is the
-- only place that returns the queue position.
--
-- Reads are restricted to service role only (no SELECT policy granted)
-- so the public can't enumerate emails. Admin / ops UIs query through
-- a future Edge Function with a wallet-allowlist gate, same model as
-- security_events.
--
-- Rollout order:
--   1. Apply this migration.
--   2. Deploy supabase/functions/waitlist-signup.
--   3. Wire WaitlistForm on the landing page.

create extension if not exists citext;

create table if not exists waitlist (
    id uuid primary key default gen_random_uuid(),
    email citext not null unique,
    source text,
    referrer text,
    role text,
    wallet_pubkey text,
    created_at timestamptz not null default now(),

    constraint waitlist_email_format check (
        email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),
    constraint waitlist_role_known check (
        role is null or role in ('creator', 'buyer', 'issuer', 'investor')
    )
);

create index if not exists waitlist_created_at_idx
    on waitlist (created_at desc);

create index if not exists waitlist_role_idx
    on waitlist (role) where role is not null;

create index if not exists waitlist_source_idx
    on waitlist (source) where source is not null;

alter table waitlist enable row level security;

-- No SELECT policy → reads denied for anon + authenticated. Service
-- role bypasses RLS, so the Edge Function (and future admin endpoint)
-- can still read.

-- Anon INSERT is allowed as a fallback path; the canonical write path
-- is the waitlist-signup Edge Function which uses the service role and
-- enforces rate limits. Direct anon inserts still pass through the
-- email-format and role-known check constraints.
drop policy if exists "waitlist_insert_anon" on waitlist;
create policy "waitlist_insert_anon" on waitlist
    for insert to anon
    with check (true);

drop policy if exists "waitlist_insert_authenticated" on waitlist;
create policy "waitlist_insert_authenticated" on waitlist
    for insert to authenticated
    with check (true);
