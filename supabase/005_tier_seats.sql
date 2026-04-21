-- Nodosol per-seat ticket assignment.
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/xvgxaodxylrolkpyuszx/sql/new
--
-- Seat-level ticketing is tracked off-chain. The on-chain cNFT is still
-- the proof of purchase; this table records which buyer got which
-- (row, seat) within a (event, tier). Rows and seats-per-row are
-- configured inside venue_layouts.regions — each region can opt in to
-- seating by setting `rows` and `seatsPerRow` in its JSON. Tiers that
-- don't opt in stay free-form (general admission / standing).
--
-- Workflow:
--   1. buyer picks a seat → insert row with status='reserved',
--      reserved_until = now() + 3min. unique(event, tier, row, seat)
--      ensures two concurrent reservations can't collide.
--   2. on successful mint → update row to status='minted', set owner
--      pubkey + mint signature.
--   3. on mint failure or reservation timeout → row is garbage-collected
--      by the reservation-takeover logic (DELETE WHERE expired before
--      a fresh INSERT).

create table if not exists tier_seats (
    id bigserial primary key,
    event_pubkey text not null,
    tier_id int not null,
    row_label text not null,
    seat_number int not null,
    status text not null check (status in ('reserved', 'minted')),
    owner_pubkey text,
    mint_sig text,
    reserved_until timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (event_pubkey, tier_id, row_label, seat_number)
);

create index if not exists idx_tier_seats_event_tier
    on tier_seats (event_pubkey, tier_id, status);

create index if not exists idx_tier_seats_reservation_expiry
    on tier_seats (reserved_until)
    where status = 'reserved';

alter table tier_seats enable row level security;

drop policy if exists "tier_seats_read" on tier_seats;
drop policy if exists "tier_seats_write" on tier_seats;
drop policy if exists "tier_seats_update" on tier_seats;
drop policy if exists "tier_seats_delete" on tier_seats;

create policy "tier_seats_read" on tier_seats for select using (true);
create policy "tier_seats_write" on tier_seats for insert with check (true);
create policy "tier_seats_update" on tier_seats for update using (true) with check (true);
create policy "tier_seats_delete" on tier_seats for delete using (true);

drop trigger if exists trg_tier_seats_touch on tier_seats;
create trigger trg_tier_seats_touch
    before update on tier_seats
    for each row execute function touch_updated_at();
