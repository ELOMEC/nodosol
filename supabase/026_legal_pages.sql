-- Legal page CMS (Privacy + Terms).
--
-- Replaces the hardcoded PrivacyView / TermsView with DB-backed
-- Markdown that an allowlisted admin can edit through
-- `/admin/legal/[slug]` without a redeploy. Hardcoded views remain
-- as a safety fallback when no row exists for a slug, so this
-- migration is non-destructive — until the first admin save the
-- public pages keep rendering exactly as before.
--
-- Versioning: every PATCH of `legal_pages` archives the previous
-- row into `legal_pages_versions` (immutable history, monotonic
-- `version` int). Useful as an audit trail when legal asks "what
-- exactly did /privacy say on 2026-04-27?".
--
-- RLS:
--   * `legal_pages` public SELECT: anyone can read the current
--     version. Writes are service-role only — admin route handler
--     uses the service-role client after gating on the wallet
--     allowlist.
--   * `legal_pages_versions` public SELECT (so admin UI can render
--     history). Writes service-role only.

create table if not exists legal_pages (
  slug text primary key,
  title text not null,
  body_md text not null,
  version int not null default 1,
  last_updated timestamptz not null default now(),
  updated_by_wallet text
);

create table if not exists legal_pages_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null references legal_pages(slug) on delete cascade,
  title text not null,
  body_md text not null,
  version int not null,
  edited_at timestamptz not null default now(),
  edited_by_wallet text
);

create index if not exists legal_pages_versions_slug_idx
  on legal_pages_versions (slug, version desc);

alter table legal_pages enable row level security;
alter table legal_pages_versions enable row level security;

drop policy if exists "legal_pages_read_all" on legal_pages;
create policy "legal_pages_read_all" on legal_pages
  for select using (true);

drop policy if exists "legal_pages_no_anon_writes" on legal_pages;
create policy "legal_pages_no_anon_writes" on legal_pages
  for insert with check (false);

drop policy if exists "legal_pages_no_anon_updates" on legal_pages;
create policy "legal_pages_no_anon_updates" on legal_pages
  for update using (false) with check (false);

drop policy if exists "legal_pages_no_anon_deletes" on legal_pages;
create policy "legal_pages_no_anon_deletes" on legal_pages
  for delete using (false);

drop policy if exists "legal_pages_versions_read_all" on legal_pages_versions;
create policy "legal_pages_versions_read_all" on legal_pages_versions
  for select using (true);

drop policy if exists "legal_pages_versions_no_anon_writes" on legal_pages_versions;
create policy "legal_pages_versions_no_anon_writes" on legal_pages_versions
  for insert with check (false);

drop policy if exists "legal_pages_versions_no_anon_updates" on legal_pages_versions;
create policy "legal_pages_versions_no_anon_updates" on legal_pages_versions
  for update using (false) with check (false);

drop policy if exists "legal_pages_versions_no_anon_deletes" on legal_pages_versions;
create policy "legal_pages_versions_no_anon_deletes" on legal_pages_versions
  for delete using (false);

comment on table legal_pages is
  'CMS-managed legal pages (privacy, terms). Hardcoded React views fall back when row missing.';
comment on table legal_pages_versions is
  'Immutable history of legal_pages edits — every PATCH snapshots the previous row here.';
