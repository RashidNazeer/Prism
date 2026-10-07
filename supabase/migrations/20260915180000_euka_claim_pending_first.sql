-- ============================================================================
-- Never-fetched units first; then retries, longest-waiting first.
--
-- 2026-09-15, the same evening as the oldest-due fix. With pure oldest-due, a
-- handful of large Cutler Nutrition campaigns that time out on every attempt
-- came back due every four minutes and took all four workers in every
-- scheduled run from 17:45 to 18:25. pg_net recorded "ok 0, failed 4" nine
-- runs running. Units that had never been fetched even once, Dr Tobias's
-- August "All Products" among them, waited behind them the whole time.
--
-- So a unit that has never been tried gets its attempt before anything is
-- retried. Retries still take turns oldest-due first, so no month's retries can
-- starve another month's (the bug the previous migration fixed). Pending units
-- only ever appear after discovery or when a lease expires, so they cannot
-- starve the retries in turn for long.
-- ============================================================================

create or replace function public.euka_ad_claim_units(p_limit integer)
returns setof public.euka_ad_sync_units
language sql
security invoker
set search_path = ''
as $$
  update public.euka_ad_sync_units u
  set due_at = now() + interval '10 minutes',
      updated_at = now()
  where (u.advertiser_id, u.campaign_id, u.month) in (
    select c.advertiser_id, c.campaign_id, c.month
    from public.euka_ad_sync_units c
    where c.due_at <= now()
    order by (c.status = 'pending') desc, c.due_at, c.month desc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning u.*;
$$;

revoke all on function public.euka_ad_claim_units(integer) from public, anon, authenticated;
grant execute on function public.euka_ad_claim_units(integer) to service_role;
