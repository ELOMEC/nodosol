-- Per-wallet notifications + email preferences.
--
-- Notifications are created by the helius-webhook Edge Function (server-side
-- only) when on-chain events match a known Nodosol program. Reads are
-- gated by the same JWT-sub pattern used for chat (issue-chat-jwt).
--
-- Email delivery: a separate email-dispatch worker (TODO) reads
-- notifications where email_sent_at IS NULL and email_eligible IS TRUE,
-- sends via Resend, then stamps email_sent_at.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  wallet_pubkey text not null,
  type text not null,
  /** Free-form payload — event-specific fields. */
  payload jsonb not null default '{}'::jsonb,
  /** Optional link target so the bell can deep-link. */
  href text,
  /** Short headline rendered in the feed. */
  title text not null,
  /** Optional secondary line. */
  body text,
  /** Source on-chain signature (if any) — uniqueness key. */
  signature text,
  read boolean not null default false,
  email_eligible boolean not null default false,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),

  unique (wallet_pubkey, signature, type)
);

create index if not exists notifications_wallet_idx
  on notifications (wallet_pubkey, created_at desc);
create index if not exists notifications_unread_idx
  on notifications (wallet_pubkey, read) where read = false;
create index if not exists notifications_email_pending_idx
  on notifications (email_eligible, email_sent_at)
  where email_eligible = true and email_sent_at is null;

alter table notifications enable row level security;

-- Read: only the owning wallet, gated by JWT sub.
drop policy if exists "notifications_read_self" on notifications;
create policy "notifications_read_self" on notifications
  for select using (wallet_pubkey = auth.jwt() ->> 'sub');

-- Update (mark read): only own rows.
drop policy if exists "notifications_update_self" on notifications;
create policy "notifications_update_self" on notifications
  for update using (wallet_pubkey = auth.jwt() ->> 'sub')
  with check (wallet_pubkey = auth.jwt() ->> 'sub');

-- Insert: blocked for everyone except service-role (which bypasses RLS).
-- The helius-webhook Edge Function uses the service-role key to insert.
drop policy if exists "notifications_no_insert" on notifications;
create policy "notifications_no_insert" on notifications
  for insert with check (false);

-- Per-wallet email opt-in.
create table if not exists notification_preferences (
  wallet_pubkey text primary key,
  email text,
  email_verified_at timestamptz,
  /** Comma-separated allowlist of notification types. Empty = all off. */
  email_types text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

drop policy if exists "notification_prefs_read_self" on notification_preferences;
create policy "notification_prefs_read_self" on notification_preferences
  for select using (wallet_pubkey = auth.jwt() ->> 'sub');

drop policy if exists "notification_prefs_upsert_self" on notification_preferences;
create policy "notification_prefs_upsert_self" on notification_preferences
  for insert with check (wallet_pubkey = auth.jwt() ->> 'sub');

drop policy if exists "notification_prefs_update_self" on notification_preferences;
create policy "notification_prefs_update_self" on notification_preferences
  for update using (wallet_pubkey = auth.jwt() ->> 'sub')
  with check (wallet_pubkey = auth.jwt() ->> 'sub');

create or replace function notification_prefs_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists notification_prefs_touch on notification_preferences;
create trigger notification_prefs_touch
  before update on notification_preferences
  for each row execute function notification_prefs_touch_updated_at();
