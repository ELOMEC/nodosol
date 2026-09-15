-- Nodosol secondary-market ticket listings.
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/<PROJECT_REF>/sql/new
--
-- Holds resale listings for cNFT tickets. This is the OFF-CHAIN
-- visibility layer — buyer's USDC payment goes on-chain via the
-- existing Token-2022 rails, but the cNFT transfer is still
-- performed manually by the seller (wallet → wallet in Phantom).
-- A later session will ship an atomic on-chain swap that escrows
-- the cNFT via Bubblegum delegate and settles USDC + ticket in one
-- transaction, making the settlement_status = 'auto' path possible.
--
-- settlement_status:
--   'listed'        — active, waiting for a buyer
--   'sold_pending'  — buyer sent USDC, waiting for seller to transfer cNFT
--   'sold'          — seller confirmed cNFT was transferred
--   'cancelled'     — seller cancelled before any payment
--   'expired'       — past expiry timestamp, no buyer

create table if not exists ticket_listings (
    id uuid primary key default gen_random_uuid(),
    asset_id text not null,
    event_pubkey text not null,
    seller_pubkey text not null,
    buyer_pubkey text,
    price_usdc_base bigint not null,
    settlement_status text not null default 'listed'
        check (settlement_status in ('listed', 'sold_pending', 'sold', 'cancelled', 'expired')),
    payment_sig text,
    transfer_sig text,
    note text,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (asset_id, settlement_status) deferrable initially deferred
);

-- Note: the unique (asset_id, settlement_status) above is a hack to prevent
-- two simultaneous 'listed' rows for the same ticket. The constraint defers
-- so updates from 'listed' → 'sold' within a single transaction still work.
-- Simpler alternative is a partial unique index on asset_id WHERE status='listed'.
drop index if exists ticket_listings_one_active_per_asset;
create unique index ticket_listings_one_active_per_asset
    on ticket_listings (asset_id)
    where settlement_status = 'listed';

create index if not exists idx_ticket_listings_event_active
    on ticket_listings (event_pubkey, settlement_status, created_at desc);

create index if not exists idx_ticket_listings_seller
    on ticket_listings (seller_pubkey, created_at desc);

alter table ticket_listings enable row level security;

drop policy if exists "ticket_listings_read" on ticket_listings;
drop policy if exists "ticket_listings_write" on ticket_listings;
drop policy if exists "ticket_listings_update" on ticket_listings;
drop policy if exists "ticket_listings_delete" on ticket_listings;

create policy "ticket_listings_read" on ticket_listings for select using (true);
create policy "ticket_listings_write" on ticket_listings for insert with check (true);
create policy "ticket_listings_update" on ticket_listings for update using (true) with check (true);
create policy "ticket_listings_delete" on ticket_listings for delete using (true);

drop trigger if exists trg_ticket_listings_touch on ticket_listings;
create trigger trg_ticket_listings_touch
    before update on ticket_listings
    for each row execute function touch_updated_at();
