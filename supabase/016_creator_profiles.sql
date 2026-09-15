-- Creator public profile metadata.
--
-- Pairs the on-chain CreatorProfile (tip_jar program) with off-chain
-- branding fields (handle, display_name, bio, avatar, links).
-- Reads are public (the whole point is shareable /c/<handle> URLs);
-- writes are gated to the wallet whose pubkey matches the row, using
-- the same auth.jwt()->>'sub' pattern from migration 013 (issue-chat-jwt
-- mints a JWT with sub = wallet pubkey after signature challenge).

create table if not exists creator_profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_pubkey text not null unique,
  handle text not null unique,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  twitter text,
  website text,
  discord text,
  telegram text,
  links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint handle_lowercase check (handle = lower(handle)),
  constraint handle_format check (handle ~ '^[a-z0-9][a-z0-9_-]{1,30}$'),
  constraint handle_not_reserved check (
    handle not in (
      'admin', 'root', 'api', 'app', 'auth', 'login', 'logout', 'signup',
      'register', 'help', 'support', 'about', 'contact', 'privacy', 'terms',
      'pricing', 'docs', 'blog', 'news', 'pitch', 'tech', 'security',
      'marketplace', 'creator', 'creators', 'c', 'u', 'user', 'users',
      'profile', 'profiles', 'settings', 'account', 'accounts',
      'wallet', 'wallets', 'tip', 'tips', 'subscription', 'subscriptions',
      'event', 'events', 'auction', 'auctions', 'rental', 'rentals',
      'asset', 'assets', 'otc', 'chat', 'welcome', 'rights', 'nodosol',
      'official', 'team', 'staff', 'system', 'webmaster', 'mod', 'moderator',
      'b', 'search', 'stats', 'admin-panel', 'studio', 'dashboard'
    )
  )
);

create index if not exists creator_profiles_handle_idx on creator_profiles (handle);
create index if not exists creator_profiles_wallet_idx on creator_profiles (wallet_pubkey);

create or replace function creator_profiles_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists creator_profiles_touch on creator_profiles;
create trigger creator_profiles_touch
  before update on creator_profiles
  for each row execute function creator_profiles_touch_updated_at();

alter table creator_profiles enable row level security;

-- Public read: anyone can view profile rows (the point is shareable URLs).
drop policy if exists "creator_profiles_read" on creator_profiles;
create policy "creator_profiles_read" on creator_profiles
  for select using (true);

-- Insert: only the wallet that matches the JWT sub can create its row.
drop policy if exists "creator_profiles_insert_self" on creator_profiles;
create policy "creator_profiles_insert_self" on creator_profiles
  for insert with check (
    wallet_pubkey = auth.jwt() ->> 'sub'
  );

-- Update: only the owning wallet can edit.
drop policy if exists "creator_profiles_update_self" on creator_profiles;
create policy "creator_profiles_update_self" on creator_profiles
  for update using (
    wallet_pubkey = auth.jwt() ->> 'sub'
  ) with check (
    wallet_pubkey = auth.jwt() ->> 'sub'
  );

-- Delete: only the owning wallet can delete.
drop policy if exists "creator_profiles_delete_self" on creator_profiles;
create policy "creator_profiles_delete_self" on creator_profiles
  for delete using (
    wallet_pubkey = auth.jwt() ->> 'sub'
  );
