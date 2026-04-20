-- Nodosol asset media bucket.
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/xvgxaodxylrolkpyuszx/sql/new
--
-- Public bucket that holds tokenised asset images + Metaplex-style
-- metadata JSON. The JSON's public URL is what ends up in the
-- on-chain rwa_mint Asset.metadata_uri field. Writes are open for
-- devnet demo — tighten before mainnet.

insert into storage.buckets (id, name, public)
values ('asset-media', 'asset-media', true)
on conflict (id) do update set public = true;

drop policy if exists "asset_media_read" on storage.objects;
drop policy if exists "asset_media_upload" on storage.objects;

create policy "asset_media_read"
    on storage.objects for select
    using (bucket_id = 'asset-media');

create policy "asset_media_upload"
    on storage.objects for insert
    with check (bucket_id = 'asset-media');
