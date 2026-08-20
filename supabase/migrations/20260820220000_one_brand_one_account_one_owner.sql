-- ============================================================================
-- TWO OF RASHID'S RULES, ENFORCED BY THE DATABASE. 2026-08-20
--
-- Both were already written down. Neither was true.
--
--   "each brand has it's own ad account we need to map only one ad account
--    with one brand only"
--   "each video has unique id and we need to be careful becuase this is money
--    sensitive"
--
-- A rule that lives only in a comment is a rule that holds until somebody
-- reasonable does the obvious thing. The audit found both were reachable from
-- the ordinary screens with no warning.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. One brand, one ad account. Both directions.
-- ----------------------------------------------------------------------------
/*
 * WHAT WAS POSSIBLE. `tiktok_stores` is keyed (advertiser_id, store_id) because
 * one TikTok Shop can be authorised to several ad accounts, and `brand_id` was
 * a plain nullable column on that pair with no constraint of any kind.
 *
 * TODAY'S PENETREX IS EXACTLY THAT SHAPE. The same shop comes back on both of
 * Rashid's ad accounts, so the settings screen shows it twice, each row with
 * its own brand dropdown, no warning, and no obviously correct answer. Setting
 * both to Penetrex is the natural thing to do and it was the worst thing to do:
 * both rows then asked for the same videos, and with the old money key the
 * second answer overwrote the first with zeros.
 *
 * TWO INDEXES, because the rule has two directions and only enforcing one
 * leaves the other open:
 *
 *   a store may be a brand's under ONE advertiser  (store_id unique)
 *   a brand has exactly ONE store                  (brand_id unique)
 *
 * Both are PARTIAL on `brand_id is not null`, so any number of rows may sit
 * unmapped. An unmapped store is a normal, documented state: Rashid's own
 * correction on 2026-08-17 was "some brands are not yet added so admin can add
 * later and then map".
 */
create unique index if not exists tiktok_stores_one_advertiser_per_store_idx
  on public.tiktok_stores (store_id)
  where brand_id is not null;

create unique index if not exists tiktok_stores_one_store_per_brand_idx
  on public.tiktok_stores (brand_id)
  where brand_id is not null;

comment on column public.tiktok_stores.brand_id is
  'Which Wurx brand this shop''s money belongs to, on this ad account. Unique in BOTH directions since 2026-08-20, on Rashid''s rule that one brand has exactly one ad account: a shop can be mapped under one advertiser only, and a brand can have one shop only. Null is normal and means not matched yet.';


-- ----------------------------------------------------------------------------
-- 2. One video belongs to one creator, for good.
-- ----------------------------------------------------------------------------
/*
 * WHAT WAS POSSIBLE. Nothing anywhere enforced who owns a TikTok video. Two
 * creators could each paste the same link, each have it approved, and each bank
 * its GMV: on their own My Numbers, and on the leaderboard, where the totals
 * are summed across people and the same money would have counted twice.
 *
 * A PLAIN UNIQUE INDEX ON `embed_id` WOULD BE WRONG, and this is the part worth
 * reading twice. The same creator filing one video against a job AND against a
 * contest entry is legitimate — `20260820140000` establishes it, and
 * `creator_video_performance` reports it as source 'both'. One person's video
 * doing two jobs is not a duplicate. The constraint is CROSS-CREATOR only.
 *
 * IT IS A TRIGGER RATHER THAN A CONSTRAINT because the rule spans two tables,
 * and Postgres has no unique index across two tables. It fires on the way IN
 * and on the way to approval, so a clash is refused at the moment somebody
 * tries rather than discovered in a report later.
 *
 * IT CHECKS APPROVED ROWS ONLY. Two creators may both SUBMIT the same link,
 * which happens innocently when a brand reposts, and the first approval settles
 * it. Blocking at submission would mean a creator could reserve a video they do
 * not own simply by pasting it first, which hands a griefer a lever and gives
 * the team nothing to review.
 *
 * The message names the other creator so the reviewer can act on it rather than
 * guess.
 */
create or replace function public.assert_video_has_one_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other text;
begin
  -- Only worth asking when there is an id, and only when this row is claiming
  -- to be approved. An unapproved row counts for nothing anywhere.
  if new.embed_id is null or new.status <> 'approved' then
    return new;
  end if;

  select coalesce(p.display_name, v.creator_id::text)
    into v_other
  from public.creator_videos v
  left join public.profiles p on p.id = v.creator_id
  where v.embed_id = new.embed_id
    and v.status = 'approved'
    and v.creator_id <> new.creator_id
  limit 1;

  if v_other is not null then
    raise exception
      'That video is already approved for %. One TikTok video counts for one creator.', v_other
      using errcode = '23505';
  end if;

  return new;
end;
$$;

comment on function public.assert_video_has_one_owner() is
  'Refuses to approve a video already approved for a different creator. Cross-creator only: the same creator filing one video against a job AND a contest entry is legitimate and stays allowed.';

drop trigger if exists content_submissions_one_owner on public.content_submissions;
create trigger content_submissions_one_owner
  before insert or update of status, embed_id, creator_id
  on public.content_submissions
  for each row execute function public.assert_video_has_one_owner();

drop trigger if exists contest_submissions_one_owner on public.contest_submissions;
create trigger contest_submissions_one_owner
  before insert or update of status, embed_id, creator_id
  on public.contest_submissions
  for each row execute function public.assert_video_has_one_owner();


-- ----------------------------------------------------------------------------
-- 3. An id that is not an id can never match anything.
-- ----------------------------------------------------------------------------
/*
 * `tiktok_video_daily.item_id` is checked `^[0-9]{6,32}$`. The two submission
 * tables had no check at all on `embed_id`, so a malformed value could be
 * stored, would match no money row ever, and would silently report zero for a
 * video that was earning. Worse, `tiktok_posted_at` decodes a date out of that
 * id to work out how far the sync must reach back, and a nonsense id decodes to
 * 1970 and drags the whole nightly job back fifty years.
 *
 * Same shape as the money table, so the two can actually be compared.
 */
alter table public.content_submissions
  drop constraint if exists content_submissions_embed_id_shape;
alter table public.content_submissions
  add constraint content_submissions_embed_id_shape
  check (embed_id is null or embed_id ~ '^[0-9]{6,32}$') not valid;

alter table public.contest_submissions
  drop constraint if exists contest_submissions_embed_id_shape;
alter table public.contest_submissions
  add constraint contest_submissions_embed_id_shape
  check (embed_id is null or embed_id ~ '^[0-9]{6,32}$') not valid;

/*
 * `not valid` then `validate`: it checks the existing rows without holding a
 * write lock on the whole table while it does. If either fails to validate,
 * there is bad data already stored and it needs looking at rather than forcing.
 */
alter table public.content_submissions validate constraint content_submissions_embed_id_shape;
alter table public.contest_submissions validate constraint contest_submissions_embed_id_shape;

-- The sync filters contest videos by brand every night and this was an
-- unindexed foreign key on the hot path.
create index if not exists contest_submissions_brand_idx
  on public.contest_submissions (brand_id, status);
