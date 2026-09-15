-- Email verification token columns on notification_preferences.
--
-- Sprint 2 / Bucket F: paired with Sprint F1 (settings page) and F2 (verify
-- Edge Function). The column shape is independent of the verify Edge
-- Function so this migration is safe to apply ahead of the function.
--
-- Token semantics (set by F2 verify-email Edge Function):
--   email_verification_token       — random 32-byte hex string set when
--                                    user requests verification
--   email_verification_sent_at     — timestamp of last verify email
--                                    (rate-limit window: 1 token/h/wallet)
--
-- When the user clicks the verify link, the verify-email function looks
-- up the token, sets email_verified_at = now(), nulls out the token, and
-- redirects to /settings/notifications?verified=1.

alter table notification_preferences
    add column if not exists email_verification_token text,
    add column if not exists email_verification_sent_at timestamptz;

-- Token lookup index (partial — only rows with an active token).
create index if not exists notification_prefs_verify_token_idx
    on notification_preferences (email_verification_token)
    where email_verification_token is not null;

-- Rate-limit lookup (for the verify-email Edge Function: don't issue a
-- new token if one was sent in the last hour).
create index if not exists notification_prefs_verify_sent_at_idx
    on notification_preferences (email_verification_sent_at)
    where email_verification_sent_at is not null;

comment on column notification_preferences.email_verification_token is
    '32-byte hex token signed by verify-email Edge Function. Cleared on successful verify.';
comment on column notification_preferences.email_verification_sent_at is
    'Timestamp of last verification email send. Used for 1/h rate limit per wallet.';
