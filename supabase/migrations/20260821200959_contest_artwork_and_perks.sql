-- ============================================================================
-- A contest should look like a brand, not like a form that was filled in.
-- ============================================================================
-- Rashid, 2026-08-22, with a design: *"contest is not a normal thing dude it
-- must represent a brand with images emojis taglines"*, and about the admin
-- side, *"admin has to sroll on one page to see who accepted what's going on
-- each and everything this is very bad"*.
--
-- WHAT WAS ALREADY HERE, and it is most of it. `banner_url` has existed since
-- the contests schema landed on 2026-08-13, with the crop decided (3:1), the
-- bucket decided (`brand-assets`, public read, staff write, 2 MB, no SVG) and
-- the URL check written. What it never had was a control: the setup form's own
-- comment says "There is no banner control on this screen", so the column has
-- sat empty and unreachable ever since. That is the hero image in the design,
-- and it needs no schema change at all.
--
-- SO THE ANSWER TO "HOW MANY IMAGES" IS TWO, and one of them already exists:
--
--   1. the hero behind the title and the countdown   -> banner_url, existed
--   2. the picture beside "Why join this contest?"   -> card_image_url, new
--   3. the brand's own mark on the pill              -> brands.logo_url, existed
--
-- Both new fields are OPTIONAL and the screens are designed to be right without
-- them, because the first contests will have neither and a layout that only
-- works once somebody uploads artwork is a layout that looks broken by default.
-- ============================================================================

alter table public.contests
  add column card_image_url text check (
    card_image_url is null
    or (card_image_url ~* '^https://' and length(card_image_url) between 12 and 2048)
  );

comment on column public.contests.card_image_url is
  'Optional product or lifestyle picture beside the "why join" panel. Same bucket, same rules and same reasoning as banner_url: public read, so nothing commercial may appear in it.';

/*
 * THE SELLING POINTS, ONE PER LINE, IN THE ADMIN'S OWN WORDS.
 *
 * A text column rather than a `text[]`, and that is deliberate. An array would
 * need array-editing UI — add a row, remove a row, reorder — for content that
 * is three short lines somebody types once. One textarea split on newlines is
 * the same shape the offer audience box uses, and the screens cap what they
 * draw rather than the column capping what can be stored.
 *
 * Creator readable, like every other column on this table. It is marketing copy
 * for the people being marketed to; there is nothing to protect. The rule that
 * NOTHING COMMERCIAL goes in a creator-readable contest field still applies:
 * no budget, no margin, no rate card, no client name that is not already public.
 */
alter table public.contests
  add column perks text check (perks is null or length(perks) <= 600);

comment on column public.contests.perks is
  'Why a creator should enter, one reason per line. Creator readable. No commercial detail: contest_commercials exists for that.';

/*
 * `save_contest` gains both, and is DROPPED FIRST rather than replaced.
 *
 * A new parameter makes an OVERLOAD, not a replacement — Postgres identifies a
 * function by its whole argument list — and PostgREST then chooses between the
 * two by the argument names a request happens to send. That is how, on
 * 2026-08-20, one function served its old body to a caller and returned an
 * empty chart under a full set of cards, and how `save_offer` would have
 * written offers with no audience yesterday. The grants name the signature
 * literally, so they are re-issued against the new one.
 */
do $$
declare
  v_sig text;
begin
  select oid::regprocedure::text into v_sig
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname = 'save_contest'
  limit 1;

  if v_sig is not null then
    execute format('drop function %s', v_sig);
  end if;
end;
$$;

-- ------------------------------------------------------- save_contest ---

/*
 * The body below is the one from
 * `20260814010000_contest_deliverables_and_progress.sql`, extracted from that
 * file rather than retyped, with two parameters appended and carried into the
 * insert and the update. Retyping a function body is how, on 2026-08-20,
 * `review_contest_progress` came back with `message` where the column is
 * `staff_message` and lost a rule that had only ever lived in its own prose.
 */
create or replace function public.save_contest(
  p_actor_id uuid,
  p_brand_id uuid,
  p_name text,
  p_expires_at timestamptz,
  p_expires_at_timezone text,
  p_contest_id uuid default null,
  p_description text default null,
  p_brief_url text default null,
  p_banner_url text default null,
  p_opens_at timestamptz default null,
  p_currency text default 'USD',
  p_status public.contest_status default 'inactive',
  p_needs_admin_approval boolean default true,
  p_card_image_url text default null,
  p_perks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_brand    public.brands%rowtype;
  v_before   public.contests%rowtype;
  v_contest  public.contests%rowtype;
  v_name     text := nullif(trim(coalesce(p_name, '')), '');
  v_desc     text := nullif(trim(coalesce(p_description, '')), '');
  v_brief    text := nullif(trim(coalesce(p_brief_url, '')), '');
  v_banner   text := nullif(trim(coalesce(p_banner_url, '')), '');
  v_card     text := nullif(trim(coalesce(p_card_image_url, '')), '');
  v_perks    text := nullif(trim(coalesce(p_perks, '')), '');
  v_zone     text := nullif(trim(coalesce(p_expires_at_timezone, '')), '');
  v_currency text := upper(coalesce(nullif(trim(coalesce(p_currency, '')), ''), 'USD'));
  v_opens    timestamptz;
  v_live     integer;
  v_budget   numeric;
  v_action   text;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if v_name is null then
    raise exception 'a contest needs a name' using errcode = '22023';
  end if;
  if p_expires_at is null then
    raise exception 'a contest needs a deadline' using errcode = '22023';
  end if;
  if v_zone is null then
    raise exception 'a deadline needs the timezone it was set in' using errcode = '22023';
  end if;

  -- An offset like '+01:00' and an abbreviation like 'BST' both look plausible
  -- and both fail here. An offset is wrong twice a year, and 'BST' is ambiguous
  -- between British Summer Time and Bougainville Standard Time.
  if not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = v_zone
  ) then
    raise exception '% is not a timezone we can store a deadline in', v_zone
      using errcode = '22023';
  end if;

  select * into v_brand from public.brands where id = p_brand_id;
  if not found then
    raise exception 'no such brand' using errcode = 'P0002';
  end if;

  if p_contest_id is null then
    v_opens := coalesce(p_opens_at, now());

    if p_expires_at <= v_opens then
      raise exception 'a contest has to close after it opens' using errcode = '22023';
    end if;

    -- No M7 check on the create path: a contest that does not exist yet carries
    -- no deliverables, so there is no reward to exceed a budget. It arrives with
    -- the first save_contest_deliverable call, which carries the refusal.
    insert into public.contests (
      brand_id, name, description, brief_url, banner_url, card_image_url, perks,
      status, needs_admin_approval, opens_at, expires_at, expires_at_timezone,
      currency, created_by
    )
    values (
      p_brand_id, v_name, v_desc, v_brief, v_banner, v_card, v_perks,
      coalesce(p_status, 'inactive'), coalesce(p_needs_admin_approval, true),
      v_opens, p_expires_at, v_zone, v_currency, v_actor.id
    )
    returning * into v_contest;

    v_action := 'contest.created';
  else
    /*
     * Locked before ANY branch decides anything, and matched on brand_id as well
     * as id. contests.brand_id is never updatable (rule F6): a contest moving
     * between brands would silently spend one brand's budget on another brand's
     * products.
     */
    select * into v_before
    from public.contests
    where id = p_contest_id and brand_id = p_brand_id
    for update;

    if not found then
      raise exception 'no such contest on that brand' using errcode = 'P0002';
    end if;

    -- Terminal means terminal for the whole row, not for the deadline alone.
    if v_before.settled_at is not null then
      raise exception 'that contest has been settled, so it cannot be edited any more'
        using errcode = '22023';
    end if;
    if v_before.cancelled_at is not null then
      raise exception 'that contest was cancelled, so it cannot be edited any more'
        using errcode = '22023';
    end if;

    v_opens := coalesce(p_opens_at, v_before.opens_at);

    if p_expires_at <= v_opens then
      raise exception 'a contest has to close after it opens' using errcode = '22023';
    end if;

    -- L11. Extending an expired but unsettled contest is fine and audited;
    -- pulling the deadline back to now or earlier while people are in it is not,
    -- however innocent the typo looked.
    if p_expires_at <> v_before.expires_at and p_expires_at <= now() then
      select count(*) into v_live
      from public.contest_entries e
      where e.contest_id = p_contest_id and e.status in ('pending', 'approved');

      if v_live > 0 then
        raise exception
          '% creator(s) are in this contest, so the deadline cannot move into the past, end it with Cancel or Settle',
          v_live
          using errcode = '22023';
      end if;
    end if;

    -- F2, the frozen tier. The currency is the dimension every frozen promise
    -- was quoted in, so it stops being editable the moment one exists.
    if v_currency <> v_before.currency and exists (
      select 1
      from public.contest_entry_terms t
      join public.contest_entries e on e.id = t.entry_id
      where e.contest_id = p_contest_id
    ) then
      raise exception
        'somebody has already been promised something in %, so the currency cannot change now',
        v_before.currency
        using errcode = '22023';
    end if;

    -- The N7 refusal used to sit here, and it is gone with judging_basis. There
    -- are no ranked prizes to need a stated basis.

    -- M7, under the lock this function already holds.
    select c.total_budget into v_budget
    from public.contest_commercials c
    where c.contest_id = p_contest_id;

    perform public.assert_contest_within_budget(p_contest_id, v_currency, v_budget);

    update public.contests
    set name                 = v_name,
        description          = v_desc,
        brief_url            = v_brief,
        banner_url           = v_banner,
        card_image_url       = v_card,
        perks                = v_perks,
        status               = coalesce(p_status, v_before.status),
        needs_admin_approval = coalesce(p_needs_admin_approval, v_before.needs_admin_approval),
        opens_at             = v_opens,
        expires_at           = p_expires_at,
        expires_at_timezone  = v_zone,
        currency             = v_currency
    -- brand_id is deliberately absent from this SET list. See rule F6.
    where id = p_contest_id
    returning * into v_contest;

    v_action := 'contest.updated';
  end if;

  -- The deadline and its zone travel together, for the same reason the two
  -- columns do: one without the other is a different moment.
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, v_action, 'contest', v_contest.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_contest.brand_id,
      'name', v_contest.name,
      'status', v_contest.status::text,
      'needs_admin_approval', v_contest.needs_admin_approval,
      'opens_at', v_contest.opens_at,
      'expires_at', v_contest.expires_at,
      'expires_at_timezone', v_contest.expires_at_timezone,
      'currency', v_contest.currency,
      'brief_url', v_contest.brief_url,
      'banner_url', v_contest.banner_url,
      'has_card_image', v_contest.card_image_url is not null,
      'has_perks', v_contest.perks is not null,
      -- A boolean as well as the value, because jsonb_strip_nulls removes a
      -- cleared field entirely and "who took the artwork down" is exactly the
      -- question the log is asked.
      'has_banner', v_contest.banner_url is not null
    ))
  );

  return to_jsonb(v_contest);
end;
$$;

revoke all on function public.save_contest(
  uuid, uuid, text, timestamptz, text, uuid, text, text, text,
  timestamptz, text, public.contest_status, boolean, text, text
) from public, anon, authenticated;

grant execute on function public.save_contest(
  uuid, uuid, text, timestamptz, text, uuid, text, text, text,
  timestamptz, text, public.contest_status, boolean, text, text
) to service_role;
