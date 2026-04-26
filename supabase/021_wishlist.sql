-- Per-wallet wishlist of marketplace items.
--
-- Reads + writes gated by `auth.jwt()->>'sub' = wallet_pubkey` —
-- same chat-JWT pattern as creator_profiles + notifications. Anon
-- clients cannot read others' lists; service-role bypasses RLS for
-- admin tooling.
--
-- item_type covers the five marketplace verticals so a single table
-- serves the whole platform without a flag-per-vertical boolean.
-- item_id is the on-chain PDA for that item (event PDA, auction PDA,
-- listing PDA, asset mint, plan PDA), stored as base58 string for
-- portability across program-id changes.

create table if not exists wishlist (
  wallet_pubkey text not null,
  item_type text not null,
  item_id text not null,
  created_at timestamptz not null default now(),
  primary key (wallet_pubkey, item_type, item_id),
  constraint wishlist_item_type_chk check (
    item_type in ('event', 'auction', 'rental', 'asset', 'listing')
  )
);

create index if not exists wishlist_wallet_created_idx
  on wishlist (wallet_pubkey, created_at desc);

alter table wishlist enable row level security;

-- Read: only own rows.
drop policy if exists "wishlist_read_self" on wishlist;
create policy "wishlist_read_self" on wishlist
  for select using (wallet_pubkey = auth.jwt() ->> 'sub');

-- Insert: only own rows.
drop policy if exists "wishlist_insert_self" on wishlist;
create policy "wishlist_insert_self" on wishlist
  for insert with check (wallet_pubkey = auth.jwt() ->> 'sub');

-- Delete: only own rows.
drop policy if exists "wishlist_delete_self" on wishlist;
create policy "wishlist_delete_self" on wishlist
  for delete using (wallet_pubkey = auth.jwt() ->> 'sub');

-- No update policy — heart toggle is INSERT/DELETE only.

comment on table wishlist is
  'Per-wallet saved marketplace items. RLS gated by auth.jwt sub.';
