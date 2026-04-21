-- Nodosol door-scan attendance log.
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/xvgxaodxylrolkpyuszx/sql/new
--
-- Records which cNFT tickets have been scanned at the door for a given
-- event. Unique on asset_id so a ticket can only be checked in once —
-- the UI uses the unique constraint to detect "already scanned" cases
-- and surface a friendly warning (rather than silently re-inserting).
--
-- The scan flow trusts the client (creator wallet) to post valid rows.
-- A future tightening step wraps this in an Edge Function that verifies
-- the scanning wallet signs a challenge and owns the event creator key.

create table if not exists check_ins (
    id bigserial primary key,
    event_pubkey text not null,
    asset_id text not null,
    tier_id int,
    row_label text,
    seat_number int,
    owner_pubkey text,
    checked_in_by text not null,
    checked_in_at timestamptz not null default now(),
    unique (asset_id)
);

create index if not exists idx_check_ins_event_time
    on check_ins (event_pubkey, checked_in_at desc);

alter table check_ins enable row level security;

drop policy if exists "check_ins_read" on check_ins;
drop policy if exists "check_ins_write" on check_ins;
drop policy if exists "check_ins_delete" on check_ins;

create policy "check_ins_read" on check_ins for select using (true);
create policy "check_ins_write" on check_ins for insert with check (true);
create policy "check_ins_delete" on check_ins for delete using (true);
