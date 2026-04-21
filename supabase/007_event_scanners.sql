-- Nodosol event scanner roster.
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/xvgxaodxylrolkpyuszx/sql/new
--
-- Lets the event creator delegate door-scan authority to additional
-- staff wallets. Each scanner row is (event, wallet) with an optional
-- human-readable label (e.g. "Main entrance", "North gate"). The
-- check_ins.checked_in_by column already records the signing wallet,
-- so joining against event_scanners at read time yields an audit trail
-- of which entrance admitted which ticket.
--
-- RLS is permissive (devnet demo pattern). Tighten to an Edge Function
-- that verifies creator_pubkey signature before mainnet.

create table if not exists event_scanners (
    id bigserial primary key,
    event_pubkey text not null,
    scanner_pubkey text not null,
    label text,
    added_by text not null,
    added_at timestamptz not null default now(),
    unique (event_pubkey, scanner_pubkey)
);

create index if not exists idx_event_scanners_event
    on event_scanners (event_pubkey, added_at desc);

alter table event_scanners enable row level security;

drop policy if exists "event_scanners_read" on event_scanners;
drop policy if exists "event_scanners_write" on event_scanners;
drop policy if exists "event_scanners_delete" on event_scanners;

create policy "event_scanners_read" on event_scanners for select using (true);
create policy "event_scanners_write" on event_scanners for insert with check (true);
create policy "event_scanners_delete" on event_scanners for delete using (true);
