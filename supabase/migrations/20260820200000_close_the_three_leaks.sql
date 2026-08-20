-- ============================================================================
-- THREE LEAKS, CLOSED. 2026-08-20
--
-- Found by a five-agent audit of the money path, every finding then handed to a
-- second agent whose only job was to prove it wrong. These three survived.
--
-- TWO OF THEM ARE ONE DAY OLD AND ARE MINE. The leaderboard shipped this
-- morning with no caller gate and an avatar policy of `using (true)`. Both
-- looked right while the only people on dev were approved creators, and both
-- are wrong the moment a real applicant signs in.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The leaderboard had no caller gate at all.
-- ----------------------------------------------------------------------------
/*
 * `grant execute ... to authenticated` is not a permission model. EVERY signed
 * in account holds that role: an applicant who has not been let in, an
 * applicant who was REJECTED, a creator who has been suspended, and a
 * creative_strategist. All of them could read every creator's GMV and ad spend
 * by calling the RPC directly, because a grant answers "may you call this", not
 * "may you see this".
 *
 * The gate goes INSIDE the function body, not on the grant, and it reads
 * `public.is_approved_creator()`, which reads the profiles TABLE rather than a
 * JWT claim. That matters: a suspension takes effect on the next query instead
 * of at the next token refresh an hour later.
 *
 * Staff pass too, so the admin can see what a creator sees.
 *
 * It returns NO ROWS rather than raising. A rejected applicant poking at the
 * RPC learns nothing from silence; an exception would confirm the function
 * exists and that they are the wrong kind of person, which is a small thing to
 * hand somebody who is already probing.
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
  with allowed as (
    select (public.is_approved_creator() or public.is_staff()) as ok
  ),
  ranked as (
    select
      rank() over (order by t.gmv desc)   as rank,
      t.*,
      p.display_name,
      a.path                              as avatar_path,
      count(*) over ()                    as total_creators
    from private.leaderboard_totals(p_from, p_to) t
    join public.profiles p
      on p.id = t.creator_id
     and p.role = 'creator'
     and p.is_active
    left join public.creator_avatars a on a.profile_id = t.creator_id
    where t.gmv > 0
      and (select ok from allowed)
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
  with allowed as (
    select (public.is_approved_creator() or public.is_staff()) as ok
  ),
  ranked as (
    select
      rank() over (order by t.gmv desc) as rank,
      t.*,
      count(*) over ()                  as total_creators
    from private.leaderboard_totals(p_from, p_to) t
    join public.profiles p
      on p.id = t.creator_id and p.role = 'creator' and p.is_active
    where t.gmv > 0
      and (select ok from allowed)
  )
  select
    r.rank,
    r.gmv,
    r.spend,
    r.orders,
    r.videos,
    r.currency,
    r.total_creators,
    greatest(1, ceil((r.rank::numeric / nullif(r.total_creators, 0)) * 100))::integer as top_percent
  from ranked r
  where r.creator_id = (select auth.uid());
$$;

revoke all on function public.creator_leaderboard(date, date, integer, integer, text)
  from public, anon;
revoke all on function public.my_leaderboard_standing(date, date) from public, anon;
grant execute on function public.creator_leaderboard(date, date, integer, integer, text)
  to authenticated, service_role;
grant execute on function public.my_leaderboard_standing(date, date)
  to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. The avatar index was a directory of everybody, including rejects.
-- ----------------------------------------------------------------------------
/*
 * Yesterday's policy was `using (true)` for `authenticated`, added so the board
 * could put faces on itself. It let ANY signed-in account read the whole table,
 * and the table carries `handle` — every creator's TikTok handle, and every
 * APPLICANT'S, including people who applied and were turned down. That is a
 * directory of everybody who has ever approached Wurx, handed to anybody who
 * can sign up.
 *
 * IT WAS ALSO UNNECESSARY. `creator_leaderboard` is SECURITY DEFINER and
 * already decides who appears; it already returns `avatar_path` as a column.
 * The client signs that path against storage and never reads this table at all
 * — `useBoardFaces` takes paths and calls `createSignedUrls`, nothing more.
 *
 * So the policy goes and the table returns to staff-only, which is what
 * DECISIONS said on 2026-08-19 and what the comment on the table still claims.
 * The storage policy STAYS: an object name is a bare profile id with no handle
 * in it, and the only ids a creator ever holds are the ones the board chose to
 * show them.
 */
drop policy if exists "creator_avatars_select_signed_in" on public.creator_avatars;

comment on table public.creator_avatars is
  'One profile picture per creator, fetched once server side into the private creator-avatars bucket. STAFF ONLY: it carries the handle of every creator and every applicant, so a creator-readable policy on it is a directory. The leaderboard puts faces on itself by returning the object path from a SECURITY DEFINER function instead, and the client signs that path against storage without ever reading this table.';


-- ----------------------------------------------------------------------------
-- 3. A delete was broadcasting the whole row to anybody listening.
-- ----------------------------------------------------------------------------
/*
 * `postgres_changes` DOES NOT APPLY ROW SECURITY TO DELETE EVENTS. With
 * `replica identity full` a delete carries the entire old row, so a creator who
 * opened an unfiltered channel on any of these tables received other people's
 * video links, ad codes, agreed amounts, and which brand they worked for.
 *
 * `20260813230000` established this and fixed it for two contest tables. The
 * other four were published with `replica identity full` before that was
 * understood and were never revisited. With `default`, a delete carries the
 * primary key and nothing else.
 *
 * NOTHING IN THE CLIENT READS THE OLD ROW. Every subscription in
 * `src/lib/` uses the event only to invalidate a query key; a grep for
 * `payload.old` and `old_record` across the whole of `src/` returns nothing.
 * So this costs no feature at all.
 */
alter table public.content_submissions replica identity default;
alter table public.applications         replica identity default;
alter table public.offer_applications   replica identity default;
alter table public.offer_stage_events   replica identity default;
