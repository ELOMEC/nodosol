-- Per-wallet price alerts on marketplace listings.
--
-- The alert is a (max_price_usdc, optional query, optional category)
-- predicate. The matcher runs as part of the helius-webhook decoder
-- on `marketplace.list_asset` events: when a new listing is created,
-- it scans active alerts whose predicate the listing satisfies and
-- inserts an `alert_matched` row into `notifications` for the alert
-- owner. `last_matched_at` is bumped so we don't re-notify for the
-- same alert+listing pairing within a short window — duplicates are
-- already prevented at the unique key level
-- (notifications.wallet_pubkey + signature + type) but the timestamp
-- gives us a UI signal to surface "you got a match recently".
--
-- An optional cron-based reconciliation (15min sweep over active
-- listings) lands alongside `price-alert-check` Edge Function in a
-- follow-up; this migration is the on-write source of truth.

create table if not exists price_alerts (
  id uuid primary key default gen_random_uuid(),
  wallet_pubkey text not null,
  /** Free-form needle matched against listing metadata title/description. */
  query text,
  /** Inclusive ceiling. NULL = "any price under what I can already see". */
  max_price_usdc numeric(20, 6),
  /** Optional category filter — matched against asset metadata.category. */
  category text,
  /** Most recent listing PDA we surfaced for this alert. */
  last_matched_listing text,
  last_matched_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint price_alerts_predicate_chk check (
    query is not null or max_price_usdc is not null or category is not null
  )
);

create index if not exists price_alerts_wallet_idx
  on price_alerts (wallet_pubkey, created_at desc);

create index if not exists price_alerts_active_idx
  on price_alerts (active)
  where active = true;

create or replace function price_alerts_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists price_alerts_touch on price_alerts;
create trigger price_alerts_touch
  before update on price_alerts
  for each row execute function price_alerts_touch_updated_at();

alter table price_alerts enable row level security;

drop policy if exists "price_alerts_read_self" on price_alerts;
create policy "price_alerts_read_self" on price_alerts
  for select using (wallet_pubkey = auth.jwt() ->> 'sub');

drop policy if exists "price_alerts_insert_self" on price_alerts;
create policy "price_alerts_insert_self" on price_alerts
  for insert with check (wallet_pubkey = auth.jwt() ->> 'sub');

drop policy if exists "price_alerts_update_self" on price_alerts;
create policy "price_alerts_update_self" on price_alerts
  for update using (wallet_pubkey = auth.jwt() ->> 'sub')
  with check (wallet_pubkey = auth.jwt() ->> 'sub');

drop policy if exists "price_alerts_delete_self" on price_alerts;
create policy "price_alerts_delete_self" on price_alerts
  for delete using (wallet_pubkey = auth.jwt() ->> 'sub');

comment on table price_alerts is
  'User-defined match predicates over marketplace listings; matched by helius-webhook + reconcile cron.';
