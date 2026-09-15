-- Chat read lockdown: only thread parties can read messages + thread row.
--
-- Pairs with supabase/functions/issue-chat-jwt. Before this migration,
-- anyone who knew a 64-char memo_hash could read the full conversation.
-- Now a client must first sign a nodosol-chat-auth challenge, exchange it
-- for a Supabase JWT whose `sub` = wallet pubkey, then present that JWT
-- on reads + realtime subscribes.
--
-- ROLLOUT ORDER (important — applying this before the pieces below are
-- live will break every chat panel):
--   1. Deploy supabase/functions/issue-chat-jwt (Supabase dashboard or
--      `supabase functions deploy issue-chat-jwt --no-verify-jwt`)
--   2. Ship the frontend that fetches the JWT and uses it for Supabase
--      reads (Vercel production)
--   3. THEN run this migration in the SQL editor.

-- chat_threads: only seller or buyer can read the row.
drop policy if exists "threads_read" on chat_threads;
create policy "threads_read" on chat_threads for select using (
  seller_pubkey = auth.jwt() ->> 'sub'
  or buyer_pubkey = auth.jwt() ->> 'sub'
);

-- chat_messages: only seller or buyer of the parent thread can read.
drop policy if exists "messages_read" on chat_messages;
create policy "messages_read" on chat_messages for select using (
  exists (
    select 1 from chat_threads ct
    where ct.memo_hash = chat_messages.thread_memo_hash
      and (
        ct.seller_pubkey = auth.jwt() ->> 'sub'
        or ct.buyer_pubkey = auth.jwt() ->> 'sub'
      )
  )
);

-- Realtime also enforces RLS on postgres_changes — the client's realtime
-- channel auth must carry the same JWT or INSERT events for the thread
-- will be filtered out. Frontend calls supabase.realtime.setAuth(jwt).
