-- Close the public write hole on chat_threads.
--
-- Before this migration, any anon client could insert arbitrary rows into
-- chat_threads with `check (true)`. Thread creation now flows exclusively
-- through the post-chat-message Edge Function, which runs with the service
-- role and derives seller/buyer from a signed payload.
--
-- Run AFTER deploying the updated post-chat-message function (it now
-- upserts the thread as a side-effect of the first authenticated message).

drop policy if exists "threads_write" on chat_threads;

-- No client-role insert/update policy remains → service role still bypasses
-- RLS, so the Edge Function keeps working. Read stays open (memo_hash is
-- a 64-char hex, effectively unguessable).
