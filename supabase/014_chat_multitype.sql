-- Multi-type chat: extend the OTC-only chat schema to cover
--   1. otc_deal     — existing 2-party thread keyed by on-chain memo_hash
--   2. listing_dm   — 2-party DM between a buyer and a seller about a
--                     specific listing (event / rental / auction / asset).
--                     memo_hash is derived client-side as
--                     sha256("listing:<kind>:<listing_pda>:<seller>:<buyer>")
--   3. group        — public channel (e.g. #general, #tickets). Any
--                     authenticated wallet may read/write. memo_hash is
--                     sha256("group:<channel_slug>").
--
-- Backward compat: existing rows are classified as 'otc_deal' via default.
-- Write path still flows exclusively through the post-chat-message Edge
-- Function (migration 012 stays in effect).
--
-- Rollout order:
--   1. Deploy the updated post-chat-message Edge Function (new payload
--      shape + anti-spam for groups).
--   2. Ship the frontend that sets thread_type correctly.
--   3. Apply this migration.

-- digest() lives in pgcrypto. Supabase has it enabled by default but we
-- enable defensively here so the seed insert below cannot fail on a
-- fresh project.
create extension if not exists pgcrypto;

-- 1. Schema changes -----------------------------------------------------

alter table chat_threads
    add column if not exists thread_type text not null default 'otc_deal',
    add column if not exists channel_slug text,
    add column if not exists listing_context jsonb;

-- Relax NOT NULL on the OTC-only columns so group threads can skip them.
alter table chat_threads
    alter column seller_pubkey drop not null,
    alter column buyer_pubkey drop not null,
    alter column deal_address drop not null;

-- Constrain thread_type to the 3 known kinds.
alter table chat_threads
    drop constraint if exists chat_threads_type_check;
alter table chat_threads
    add constraint chat_threads_type_check
    check (thread_type in ('otc_deal', 'listing_dm', 'group'));

-- Per-type shape invariants — fail fast if a row is missing required fields.
alter table chat_threads
    drop constraint if exists chat_threads_shape_check;
alter table chat_threads
    add constraint chat_threads_shape_check check (
        (thread_type = 'otc_deal'
            and seller_pubkey is not null
            and buyer_pubkey is not null
            and deal_address is not null)
        or (thread_type = 'listing_dm'
            and seller_pubkey is not null
            and buyer_pubkey is not null
            and listing_context is not null)
        or (thread_type = 'group'
            and channel_slug is not null)
    );

-- Groups are unique by slug.
create unique index if not exists idx_chat_threads_channel_slug
    on chat_threads (channel_slug)
    where thread_type = 'group';

create index if not exists idx_chat_threads_type
    on chat_threads (thread_type);

-- 2. RLS updates --------------------------------------------------------
-- Threads + messages: per-type read policies.
--   otc_deal / listing_dm: only the two parties (by JWT sub)
--   group:                any JWT holder (authenticated wallet)
-- Writes remain service-role only (post-chat-message Edge Function).

drop policy if exists "threads_read" on chat_threads;
create policy "threads_read" on chat_threads for select using (
    (thread_type in ('otc_deal', 'listing_dm')
        and (
            seller_pubkey = auth.jwt() ->> 'sub'
            or buyer_pubkey = auth.jwt() ->> 'sub'
        ))
    or (thread_type = 'group' and auth.jwt() ->> 'sub' is not null)
);

drop policy if exists "messages_read" on chat_messages;
create policy "messages_read" on chat_messages for select using (
    exists (
        select 1 from chat_threads ct
        where ct.memo_hash = chat_messages.thread_memo_hash
          and (
              (ct.thread_type in ('otc_deal', 'listing_dm')
                  and (
                      ct.seller_pubkey = auth.jwt() ->> 'sub'
                      or ct.buyer_pubkey = auth.jwt() ->> 'sub'
                  ))
              or (ct.thread_type = 'group' and auth.jwt() ->> 'sub' is not null)
          )
    )
);

-- 3. Seed the default group channels -----------------------------------
-- Deterministic memo_hash = sha256("group:<slug>"). Keeping this in SQL
-- avoids a race where a user's first message creates the thread with
-- stale metadata.

insert into chat_threads (memo_hash, thread_type, channel_slug)
values
    (encode(digest('group:general',  'sha256'), 'hex'), 'group', 'general'),
    (encode(digest('group:tickets',  'sha256'), 'hex'), 'group', 'tickets'),
    (encode(digest('group:rentals',  'sha256'), 'hex'), 'group', 'rentals'),
    (encode(digest('group:auctions', 'sha256'), 'hex'), 'group', 'auctions'),
    (encode(digest('group:rwa',      'sha256'), 'hex'), 'group', 'rwa'),
    (encode(digest('group:showcase', 'sha256'), 'hex'), 'group', 'showcase'),
    (encode(digest('group:deals',    'sha256'), 'hex'), 'group', 'deals')
on conflict (memo_hash) do nothing;
