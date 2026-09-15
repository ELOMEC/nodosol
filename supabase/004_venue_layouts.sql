-- Nodosol custom venue layouts.
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/<PROJECT_REF>/sql/new
--
-- Holds creator-drawn venue floor plans (SVG regions in 0-1000 space) plus
-- the mapping of on-chain event PDAs to a layout. Section codes inside
-- `regions.tierRef` match TicketTier.section_code on-chain. RLS is
-- permissive for devnet demo — tighten before mainnet (require a signed
-- challenge from creator_pubkey for writes).

create table if not exists venue_layouts (
    id uuid primary key default gen_random_uuid(),
    creator_pubkey text not null,
    name text not null,
    view_box text not null default '0 0 1000 700',
    stage_d text,
    stage_label text,
    background_url text,
    regions jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_venue_layouts_creator
    on venue_layouts (creator_pubkey, created_at desc);

create table if not exists event_venue_mapping (
    event_pubkey text primary key,
    layout_id uuid not null references venue_layouts(id) on delete cascade,
    creator_pubkey text not null,
    updated_at timestamptz not null default now()
);

create index if not exists idx_event_venue_mapping_layout
    on event_venue_mapping (layout_id);

alter table venue_layouts enable row level security;
alter table event_venue_mapping enable row level security;

drop policy if exists "venue_layouts_read" on venue_layouts;
drop policy if exists "venue_layouts_write" on venue_layouts;
drop policy if exists "venue_layouts_update" on venue_layouts;
drop policy if exists "venue_layouts_delete" on venue_layouts;
drop policy if exists "event_venue_mapping_read" on event_venue_mapping;
drop policy if exists "event_venue_mapping_write" on event_venue_mapping;
drop policy if exists "event_venue_mapping_update" on event_venue_mapping;
drop policy if exists "event_venue_mapping_delete" on event_venue_mapping;

create policy "venue_layouts_read" on venue_layouts for select using (true);
create policy "venue_layouts_write" on venue_layouts for insert with check (true);
create policy "venue_layouts_update" on venue_layouts for update using (true) with check (true);
create policy "venue_layouts_delete" on venue_layouts for delete using (true);

create policy "event_venue_mapping_read" on event_venue_mapping for select using (true);
create policy "event_venue_mapping_write" on event_venue_mapping for insert with check (true);
create policy "event_venue_mapping_update" on event_venue_mapping for update using (true) with check (true);
create policy "event_venue_mapping_delete" on event_venue_mapping for delete using (true);

-- Auto-bump updated_at on any row change.
create or replace function touch_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_venue_layouts_touch on venue_layouts;
create trigger trg_venue_layouts_touch
    before update on venue_layouts
    for each row execute function touch_updated_at();

drop trigger if exists trg_event_venue_mapping_touch on event_venue_mapping;
create trigger trg_event_venue_mapping_touch
    before update on event_venue_mapping
    for each row execute function touch_updated_at();
