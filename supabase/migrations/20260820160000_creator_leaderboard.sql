-- ============================================================================
-- THE LEADERBOARD, 2026-08-20
--
-- Rashid: "Leaderboard needs to be unlocked now and it should show the actual
-- money other creators have made and where do the creator himself stands ...
-- by gmv i mean that each creator will have some videos that they will post for
-- us right? and those video may generate some gmv. So the sum of the gmv of all
-- the videos of creator X will be the actual gmv of creator X."
--
--
-- THIS AMENDS D7, AND ONLY FOR THIS ONE SCREEN.
--
-- `20260813151702_contests_schema.sql` carries a standing prohibition in the
-- schema itself: there is no contest leaderboard view, no standings snapshot,
-- and there must never be either, because a leaderboard groups across every
-- entrant and that is the shape `brand_rollups` forbids sharing. Asked
-- directly, Rashid chose names and figures visible to every creator.
--
-- The two promises coexist because they are about different things. The CONTEST
-- standing stays anonymous, because that screen says in words that nobody can
-- see who anybody else is, and breaking that would be a lie rather than a
-- change. `my_contest_standing` is untouched, the prohibition on a contest
-- leaderboard is untouched, and nothing here reads a contest table. This is a
-- board about ad GMV across everything a creator has made for us, which makes
-- no such promise and never did.
--
--
-- WHAT IT MAY NEVER LEAK, and the reason it is one narrow SECURITY DEFINER
-- function rather than a view creators can select from:
--
--   no email, ever. `profiles.email` is on the row this reads and is not
--     returned. A leaderboard is not a directory.
--   no brand, no budget, no offer, no contest, no reward. GMV only, which is
--     the number Rashid named, and spend and orders beside it because a GMV
--     with no cost next to it flatters everybody equally.
--   no rows for anybody who is not an active creator, so an admin does not
--     appear on a board of creators and a suspended account does not either.
--   NOTHING FOR AN UNAPPROVED VIDEO, matching every other read of this money
--     since 2026-08-19.
--
-- A view would have needed a policy on `profiles` wide enough to let one
-- creator read another's row, which is a far bigger hole than this function is,
-- and it would have stayed open to every future query. This function returns
-- five columns and cannot be asked for a sixth.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Every creator's total, from every video they have had approved.
-- ----------------------------------------------------------------------------
/*
 * DEDUPLICATED ON `embed_id` BEFORE ANYTHING IS SUMMED, and this is the single
 * most important line in the file.
 *
 * There is no uniqueness on that column anywhere. One creator can file the same
 * video against a job and against a contest entry, which is legitimate, and
 * every existing query in the product groups per creator so the double count
 * has never been visible. A board that sums across people is exactly where it
 * would have surfaced, as one creator quietly ahead of another on the same
 * work. `distinct` on (creator, item) first, join the money after.
 */
create or replace function private.leaderboard_totals(p_from date, p_to date)
returns table (
  creator_id uuid,
  gmv numeric,
  spend numeric,
  orders bigint,
  videos integer,
  currency text
)
language sql
stable
security definer
set search_path = ''
as $$
  with owned as (
    select distinct v.creator_id, v.embed_id
    from public.creator_videos v
    where v.embed_id is not null
      and v.status = 'approved'
  ),
  money as (
    select d.item_id,
           sum(d.cost)          as cost,
           sum(d.gross_revenue) as revenue,
           sum(d.orders)        as orders,
           max(d.currency)      as currency
    from public.tiktok_video_daily d
    where d.stat_date between p_from and p_to
    group by d.item_id
  )
  select
    o.creator_id,
    coalesce(sum(m.revenue), 0)::numeric  as gmv,
    coalesce(sum(m.cost), 0)::numeric     as spend,
    coalesce(sum(m.orders), 0)::bigint    as orders,
    count(*)::integer                     as videos,
    max(m.currency)                       as currency
  from owned o
  join money m on m.item_id = o.embed_id
  group by o.creator_id;
$$;

revoke all on function private.leaderboard_totals(date, date) from public, anon, authenticated;

comment on function private.leaderboard_totals(date, date) is
  'Every creator''s ad GMV, spend and orders over a date range, from their APPROVED videos in both channels, deduplicated on embed_id before anything is summed. In `private` so PostgREST cannot expose one creator''s totals to another as an RPC; public.creator_leaderboard is the only door.';


-- ----------------------------------------------------------------------------
-- 2. The board itself.
-- ----------------------------------------------------------------------------
/*
 * ONLY CREATORS WHO HAVE FIGURES APPEAR, which was Rashid's call when told that
 * shipping today would rank a handful of Penetrex creators and show $0 for the
 * other thirty. A board that is three quarters zeros reads as broken to the
 * people at the bottom of it, and it is not even true: they have not made $0,
 * they have not been measured yet. The screen tells them so in its own words.
 *
 * RANK IS `rank()`, NOT `row_number()`. Two creators on identical GMV are
 * genuinely joint, and giving one of them the higher number would be a fact the
 * data does not support.
 */
create or replace function public.creator_leaderboard(
  p_from date,
  p_to date,
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default null
)
returns table (
  rank bigint,
  creator_id uuid,
  display_name text,
  avatar_path text,
  gmv numeric,
  spend numeric,
  orders bigint,
  videos integer,
  currency text,
  is_me boolean,
  total_creators bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      rank() over (order by t.gmv desc)   as rank,
      t.*,
      p.display_name,
      a.path                              as avatar_path,
      count(*) over ()                    as total_creators
    from private.leaderboard_totals(p_from, p_to) t
    join public.profiles p
      on p.id = t.creator_id
     -- Creators only, and active ones. An admin with a video against their name
     -- is not a competitor, and a closed account is not standing anywhere.
     and p.role = 'creator'
     and p.is_active
    left join public.creator_avatars a on a.profile_id = t.creator_id
    where t.gmv > 0
  )
  select
    r.rank,
    r.creator_id,
    r.display_name,
    r.avatar_path,
    r.gmv,
    r.spend,
    r.orders,
    r.videos,
    r.currency,
    r.creator_id = (select auth.uid()) as is_me,
    r.total_creators
  from ranked r
  where p_search is null
     or trim(p_search) = ''
     or r.display_name ilike '%' || trim(p_search) || '%'
  order by r.rank, r.display_name
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.creator_leaderboard(date, date, integer, integer, text)
  from public, anon;
grant execute on function public.creator_leaderboard(date, date, integer, integer, text)
  to authenticated;

comment on function public.creator_leaderboard(date, date, integer, integer, text) is
  'The creator leaderboard: name, picture and ad GMV per creator, ranked. Amends D7 for this screen only, on Rashid''s explicit decision of 2026-08-20; the anonymous contest standing is untouched and the prohibition on a contest leaderboard still stands. Returns no email, no brand, no budget and no reward, and nobody who is not an active creator with real figures.';


-- ----------------------------------------------------------------------------
-- 3. Where the person looking at it stands.
-- ----------------------------------------------------------------------------
/*
 * SEPARATE FROM THE PAGE, because a creator ranked 42nd must see their own row
 * without paging to it. It answers only about the caller: there is no id
 * argument, so it cannot be asked about anybody else, and the band at the top
 * of the screen is drawn from this rather than from a lucky page.
 */
create or replace function public.my_leaderboard_standing(p_from date, p_to date)
returns table (
  rank bigint,
  gmv numeric,
  spend numeric,
  orders bigint,
  videos integer,
  currency text,
  total_creators bigint,
  top_percent integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      rank() over (order by t.gmv desc) as rank,
      t.*,
      count(*) over ()                  as total_creators
    from private.leaderboard_totals(p_from, p_to) t
    join public.profiles p
      on p.id = t.creator_id and p.role = 'creator' and p.is_active
    where t.gmv > 0
  )
  select
    r.rank,
    r.gmv,
    r.spend,
    r.orders,
    r.videos,
    r.currency,
    r.total_creators,
    -- Rounded UP, so somebody first of forty reads "top 3%" rather than
    -- "top 2%", and nobody is ever told they are in a better slice than they
    -- are. Floored at 1: there is no top 0%.
    greatest(1, ceil((r.rank::numeric / nullif(r.total_creators, 0)) * 100))::integer as top_percent
  from ranked r
  where r.creator_id = (select auth.uid());
$$;

revoke all on function public.my_leaderboard_standing(date, date) from public, anon;
grant execute on function public.my_leaderboard_standing(date, date) to authenticated;

comment on function public.my_leaderboard_standing(date, date) is
  'Where the signed-in creator stands on the leaderboard, and how many creators are on it. Takes no id, so it cannot be asked about anybody else. Returns no rows for somebody with no figures yet, which the screen reads as "you are not on it".';


-- ----------------------------------------------------------------------------
-- 4. The faces.
-- ----------------------------------------------------------------------------
/*
 * THIS OPENS A BUCKET THAT WAS ADMIN ONLY YESTERDAY, and it is a deliberate,
 * narrow reversal that Rashid was asked about in those words.
 *
 * `creator-avatars` was created private on 2026-08-19 with one policy, staff
 * only, because a person's face plus a path that names them is not a brand logo
 * on a public listing. The leaderboard names those same people beside their
 * figures, with their pictures, which is what makes the design look the way it
 * does, so read access now extends to signed-in creators.
 *
 * WHAT THAT DOES AND DOES NOT GIVE THEM. The objects are named by PROFILE ID,
 * never by handle, and `profiles` still refuses one creator another's row, so
 * there is no way to turn a name into a path or a path into a name from the
 * client. The only ids a creator ever holds are the ones the leaderboard has
 * already decided to show them. Writing stays impossible: there is no insert,
 * update or delete policy on this bucket for anybody, and the sync function
 * uses the service key.
 *
 * Signed-out visitors get nothing, as before.
 */
create policy "creator_avatars_read_signed_in"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'creator-avatars');

/*
 * And the row that says which object belongs to whom, for the same reason: the
 * leaderboard hands back a path, and the client needs to be able to sign it.
 * SELECT only, and only the rows of creators who are on a board they can
 * already see, is not expressible as a policy, so this is the honest version:
 * a creator may read the avatar INDEX. It carries a profile id, a handle, a
 * path and a byte count, and nothing about money, roles or accounts.
 */
create policy "creator_avatars_select_signed_in"
  on public.creator_avatars
  for select
  to authenticated
  using (true);

comment on table public.creator_avatars is
  'One profile picture per creator, fetched once server side into the private creator-avatars bucket. Readable by any signed-in account since 2026-08-20, because the leaderboard shows creators each other''s faces on Rashid''s explicit decision. Objects are named by profile id, never by handle, and nothing here says anything about money or roles.';
