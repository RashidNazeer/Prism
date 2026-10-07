-- ============================================================================
-- ONE BRAND'S CREATOR VIDEOS, WITHOUT READING EVERY CREATOR IN THE COMPANY.
--
-- Found while testing the Categorise button on 2026-10-07, and it is a
-- correctness bug rather than a tuning one.
--
-- `collab-angles` worked out which videos a brand posted in a month by reading
-- `wurxbase.creators` through PostgREST and filtering in code. PostgREST caps a
-- response at 1000 rows by default, and there are 1479 creators. So the read
-- came back silently truncated: roughly 479 creators were invisible, and any
-- brand whose rows sat past the cap had videos that the button could never
-- find and no error anywhere said so.
--
-- It was also 1.8 MB and about 2.7 seconds a call, which the progress poll
-- would have asked for every five seconds.
--
-- TRIMMED, CASE SENSITIVE, which is deliberate and matches `brandVideos` in
-- src/vendor/wurxbase/angleStore.js: the screen groups a brand's videos by
-- `String(c.brand || '').trim()` compared exactly, and the angle store key is
-- built from that same string. A looser match here would collect videos the
-- screen does not show under that brand, and file them under a key nobody
-- reads.
--
-- SECURITY DEFINER because `wurxbase.creators` is not readable by the role
-- this runs as; the function returns only the three columns the caller needs
-- and no commercial figures. Execute is granted to `service_role` alone, so
-- only an Edge Function holding the service key can call it.
-- ============================================================================

create or replace function public.collab_brand_creator_videos(p_brand text)
returns table (
  name         text,
  hiring_date  text,
  video_codes  jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, c.hiring_date, c.video_codes
  from wurxbase.creators c
  where btrim(coalesce(c.brand, '')) = btrim(coalesce(p_brand, ''))
    and btrim(coalesce(p_brand, '')) <> ''
$$;

comment on function public.collab_brand_creator_videos(text) is
  'One Paid Collabs brand''s creator rows, trimmed and case-sensitively matched the way the angle screen matches them. Exists so collab-angles does not read every creator in the company through PostgREST, which silently truncated at 1000 rows of 1479.';

revoke all on function public.collab_brand_creator_videos(text)
  from public, anon, authenticated;
grant execute on function public.collab_brand_creator_videos(text) to service_role;
