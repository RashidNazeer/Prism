-- ============================================================================
-- Claim the unit that has waited LONGEST, not the newest month.
--
-- Found 2026-09-15, within two hours of the backfill starting. Every Penetrex
-- and Dr Tobias AUGUST campaign failed once with Euka's first-ask 504, came
-- due again four minutes later, and was then never picked up: still waiting
-- forty minutes on. The claim ordered by (never-fetched first, NEWEST MONTH
-- first), and September's own 504 retries kept coming due every four minutes,
-- so they always outranked August. Rashid saw it as "for august it's showing
-- nothing".
--
-- It costs twice. A retry works because Euka keeps the answer it finished
-- after timing out on us; a unit left waiting behind newer months also loses
-- that warm answer, and fails again when its turn finally comes.
--
-- Oldest due first gives every unit its turn in the order it became due. New
-- units are created due "now", so on a fresh backfill they still go in the
-- order discovery created them, and a month's retries can never starve another.
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
    order by c.due_at, c.month desc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning u.*;
$$;

revoke all on function public.euka_ad_claim_units(integer) from public, anon, authenticated;
grant execute on function public.euka_ad_claim_units(integer) to service_role;

create or replace function public.euka_spark_claim_days(p_limit integer)
returns setof public.euka_spark_sync_days
language sql
security invoker
set search_path = ''
as $$
  update public.euka_spark_sync_days d
  set due_at = now() + interval '10 minutes'
  where (d.store_id, d.day) in (
    select c.store_id, c.day
    from public.euka_spark_sync_days c
    where c.due_at <= now()
    order by c.due_at, c.day desc
    limit greatest(1, least(p_limit, 20))
    for update skip locked
  )
  returning d.*;
$$;

revoke all on function public.euka_spark_claim_days(integer) from public, anon, authenticated;
grant execute on function public.euka_spark_claim_days(integer) to service_role;
