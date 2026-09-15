-- Client-side error logs.
--
-- The `web/app/error.tsx` boundary POSTs to `/api/log-error` which
-- inserts via the service-role client (bypasses RLS). Reads are
-- service-role only — these rows can contain stack traces with PII
-- (URLs, query params) so we never expose them to anon clients.

create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  wallet_pubkey text,
  route text,
  message text not null,
  stack text,
  digest text,
  user_agent text,
  client_ip text,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_recent_idx
  on error_logs (created_at desc);
create index if not exists error_logs_wallet_idx
  on error_logs (wallet_pubkey, created_at desc)
  where wallet_pubkey is not null;

alter table error_logs enable row level security;

-- Block all anon + authenticated reads (service-role bypasses RLS).
drop policy if exists "error_logs_no_select" on error_logs;
create policy "error_logs_no_select" on error_logs
  for select using (false);

drop policy if exists "error_logs_no_insert" on error_logs;
create policy "error_logs_no_insert" on error_logs
  for insert with check (false);

comment on table error_logs is
  'Client-side runtime errors collected from /api/log-error. Service-role only.';
