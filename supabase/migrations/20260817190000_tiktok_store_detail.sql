-- ============================================================================
-- What the store list actually returns.
--
-- Discovered by probing the live API from Tokyo on 2026-08-17, because TikTok's
-- docs portal is client rendered and unreadable, and the first pass at this
-- guessed. Two things were wrong: the list is under `store_list`, not `list`,
-- so every store was silently skipped and reported as a clean zero; and the
-- currency and timezone are not on the advertiser list at all, they come from
-- /advertiser/info/.
--
-- The extra columns here are the ones worth showing a human. `is_gmv_max_
-- available` in particular: a store without it will never return a single
-- figure, and an admin should be told that on the screen rather than discover
-- it as an empty report weeks later.
-- ============================================================================

alter table public.tiktok_stores
  add column if not exists store_status text,
  add column if not exists is_gmv_max_available boolean,
  add column if not exists bc_name text,
  add column if not exists thumbnail_url text;

comment on column public.tiktok_stores.is_gmv_max_available is
  'TikTok''s own flag. False means GMV Max reporting will never return anything for this store, which is worth saying out loud on the screen.';

-- The view gains the same columns. `create or replace` keeps the existing ones
-- in the same order, which is a requirement rather than a courtesy: Postgres
-- refuses to replace a view whose earlier columns have moved.
create or replace view public.tiktok_account_map
with (security_invoker = true) as
  select
    s.store_id,
    s.name                    as store_name,
    s.store_authorized_bc_id,
    s.brand_id,
    b.name                    as brand_name,
    s.mapped_at,
    a.advertiser_id,
    a.name                    as advertiser_name,
    a.currency,
    a.timezone,
    a.last_seen_at,
    s.store_status,
    s.is_gmv_max_available,
    s.bc_name
  from public.tiktok_stores s
  join public.tiktok_ad_accounts a on a.advertiser_id = s.advertiser_id
  left join public.brands b        on b.id = s.brand_id;

grant select on public.tiktok_account_map to authenticated;
grant all privileges on public.tiktok_account_map to service_role;
