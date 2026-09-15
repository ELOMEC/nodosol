-- V1 OTC resale moved entirely on-chain (TicketResaleListing PDA in the
-- event_tickets program), so the V0 off-chain listings table is dead
-- weight. Dropping it lets us reclaim the RLS policies, the partial
-- unique index, and the touch trigger.
--
-- Safe to run after 264c9b3 (UI no longer reads or writes this table).
--
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/<PROJECT_REF>/sql/new

drop table if exists ticket_listings cascade;
