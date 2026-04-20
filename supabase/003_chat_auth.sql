-- Tighten chat_messages writes so only the post-chat-message Edge
-- Function (service role) can insert. Clients must go through the
-- function which verifies the wallet signature.
-- Run AFTER deploying the post-chat-message Edge Function.

drop policy if exists "messages_write" on chat_messages;

-- No client-role insert policy → service role bypasses RLS, so the
-- Edge Function (running with SUPABASE_SERVICE_ROLE_KEY) can still write.

-- Keep read open so the existing chat UI can list messages.
-- Keep threads_write open for now (thread upsert doesn't need auth since it
-- just records pubkeys that come from the on-chain deal anyway).
