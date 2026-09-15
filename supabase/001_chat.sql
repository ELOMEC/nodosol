-- Nodosol OTC chat schema.
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/<PROJECT_REF>/sql/new
--
-- One thread per on-chain OTC deal, keyed by the deal's memo_hash (stored
-- as 64-char hex). Messages reference the thread; RLS is permissive for
-- devnet demo — upgrade to wallet-signature auth before mainnet.

create table if not exists chat_threads (
    memo_hash text primary key,
    seller_pubkey text not null,
    buyer_pubkey text not null,
    deal_address text not null,
    created_at timestamptz not null default now()
);

create table if not exists chat_messages (
    id bigserial primary key,
    thread_memo_hash text not null references chat_threads(memo_hash) on delete cascade,
    sender_pubkey text not null,
    body text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_thread_time
    on chat_messages (thread_memo_hash, created_at);

alter table chat_threads enable row level security;
alter table chat_messages enable row level security;

-- Devnet demo: permissive. Tighten before mainnet — ideally require a
-- signed challenge from seller_pubkey or buyer_pubkey for writes.
drop policy if exists "threads_read" on chat_threads;
drop policy if exists "threads_write" on chat_threads;
drop policy if exists "messages_read" on chat_messages;
drop policy if exists "messages_write" on chat_messages;

create policy "threads_read" on chat_threads for select using (true);
create policy "threads_write" on chat_threads for insert with check (true);

create policy "messages_read" on chat_messages for select using (true);
create policy "messages_write" on chat_messages for insert with check (true);

-- Realtime: publish chat_messages so the client can subscribe to new rows.
do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
    ) then
        alter publication supabase_realtime add table chat_messages;
    end if;
end $$;
