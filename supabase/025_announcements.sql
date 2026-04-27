-- Public announcements feed.
--
-- Admin-managed news / status / release notes that surface at
-- `/announcements`. Optional pinned + severity flags promote
-- urgent items into a global banner via MarketplaceShell.
--
-- RLS:
--   * Public read: only rows whose `published_at <= now()` AND
--     (`expires_at IS NULL` OR `expires_at > now()`). Drafts +
--     scheduled-future + already-expired stay hidden.
--   * Insert / update / delete: service-role only. The web admin
--     surface (`/admin/announcements`) hits these via a
--     server-side route handler that gates on the wallet allowlist.

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info'
    check (severity in ('info', 'release', 'warning', 'urgent')),
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  author_wallet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_pub_idx
  on announcements (published_at desc);
create index if not exists announcements_active_idx
  on announcements (pinned desc, severity, published_at desc)
  where expires_at is null or expires_at > now();

create or replace function announcements_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists announcements_touch on announcements;
create trigger announcements_touch
  before update on announcements
  for each row execute function announcements_touch_updated_at();

alter table announcements enable row level security;

drop policy if exists "announcements_read_published" on announcements;
create policy "announcements_read_published" on announcements
  for select
  using (
    published_at <= now()
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "announcements_no_anon_writes" on announcements;
create policy "announcements_no_anon_writes" on announcements
  for insert with check (false);

drop policy if exists "announcements_no_anon_updates" on announcements;
create policy "announcements_no_anon_updates" on announcements
  for update using (false) with check (false);

drop policy if exists "announcements_no_anon_deletes" on announcements;
create policy "announcements_no_anon_deletes" on announcements
  for delete using (false);

comment on table announcements is
  'Admin-managed public announcements; service-role writes; RLS-public read of currently active rows.';
