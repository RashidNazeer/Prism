-- ============================================================================
-- Offers get a KIND, and a kind decides who is allowed to see them.
-- ============================================================================
-- Rashid, 2026-08-21, from his boss: offers divide into three, and the type
-- carries a guard rail rather than a note in the description.
--
--   RETAINER CAMPAIGN   a custom deal for named creators. "some are our top
--                       creators we create custom deals for them so don't wnt
--                       to show them to all creators". An ALLOW list, required.
--
--   VOLUME              for everyone. Optionally with named creators EXCLUDED,
--                       which is his addition: an offer everyone can take
--                       except the people who already have their own deal.
--
--   HIGH COMMISSION     no application, ever. Optionally narrowed to named
--                       creators; an empty list means everyone.
--
-- WHY THIS IS IN THE DATABASE AND NOT IN THE FORM. Today every approved
-- creator can read every active offer, so on dev all 41 of them can read all
-- 31 Penetrex deals: @dannydailyfinds is on $800 and can see that
-- @erinragancooper is on $2,000. That is the leak this closes, and a screen
-- that simply does not draw a card does not close it. Hiding a button is never
-- the security boundary. The database is.
--
-- WHAT DOES NOT CHANGE: `offers_select_own_requests`, added 2026-08-01, still
-- lets a creator read any offer they already have a request on. So taking
-- somebody off an allow list never takes away work already agreed, and never
-- blanks out the name of the thing they are being paid for. Removing somebody
-- stops them FINDING it; it does not reach into a promise already made.
-- ============================================================================

-- ------------------------------------------------------------------ kind ---

create type public.offer_kind as enum ('retainer', 'volume', 'high_commission');

comment on type public.offer_kind is
  'retainer: named creators only. volume: everyone, minus anyone excluded. high_commission: never needs an application, optionally narrowed to named creators.';

-- `volume` is the default because it is what every existing offer already
-- behaves like: visible to every approved creator. The backfill below then
-- moves the ones that are really custom deals onto `retainer`, so no offer
-- silently changes who can see it at the moment this migration runs.
alter table public.offers
  add column kind public.offer_kind not null default 'volume';

comment on column public.offers.kind is
  'Which of the three kinds of offer this is. Decides how offer_audience is read: an allow list for retainer and high_commission, a deny list for volume.';

create index offers_kind_idx on public.offers (kind, status);

-- -------------------------------------------------------------- audience ---

create table public.offer_audience (
  offer_id uuid not null references public.offers (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,

  /*
   * THE MODE IS ON THE ROW, NOT INFERRED FROM THE OFFER'S KIND, and that is
   * the single most important line in this file.
   *
   * If the mode were derived, switching an offer from Retainer to Volume would
   * silently turn "these three creators may see it" into "these three creators
   * may NOT see it" — the exact inversion of the intent, applied to real
   * money, with nothing on screen to show it had happened. Storing it means
   * such a switch produces rows that contradict the new kind, and the deferred
   * check below refuses the whole transaction instead.
   */
  mode text not null check (mode in ('allow', 'deny')),

  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),

  primary key (offer_id, creator_id)
);

comment on table public.offer_audience is
  'Who may (allow) or may not (deny) see an offer. STAFF ONLY: which creators are on a retainer is as confidential as the rate itself.';

-- The lookup the RLS check makes, once per offer per creator.
create index offer_audience_creator_idx on public.offer_audience (creator_id, offer_id);

alter table public.offer_audience enable row level security;

/*
 * NO CREATOR POLICY, DELIBERATELY. A creator must never be able to read this
 * table: the rows on a retainer name the other creators who were given the same
 * private deal. Visibility is answered instead by `can_see_offer` below, which
 * is SECURITY DEFINER and only ever asks about the caller.
 */
create policy "offer_audience_select_staff"
  on public.offer_audience for select to authenticated
  using (public.is_staff());

-- Auto expose is off, so nothing is reachable without an explicit grant, and
-- that includes service_role.
grant select on public.offer_audience to authenticated;
grant all privileges on table public.offer_audience to service_role;

-- --------------------------------------------------- the invariant, once ---

/*
 * ONE DEFERRED CHECK RATHER THAN FOUR EAGER ONES.
 *
 * Saving a retainer means updating the offer and rewriting its list, in some
 * order, and any per-statement trigger would fire in the middle of that and
 * refuse a transaction that was about to be perfectly valid. A CONSTRAINT
 * TRIGGER that is DEFERRABLE INITIALLY DEFERRED runs at COMMIT, when the rows
 * have finished moving, so it can state the rule plainly and be right:
 *
 *   1. every audience row's mode matches what its offer's kind expects;
 *   2. a LIVE retainer has at least one creator on it.
 *
 * Rule 2 is Rashid's answer to "what should a retainer with nobody on it do":
 * *"Refuse to make it live"*. An offer that literally nobody on earth can see
 * is indistinguishable from a bug, and it would sit there looking like a
 * running campaign.
 *
 * It runs for direct SQL as well as for `save_offer`, which is the point: the
 * service role can write to these tables and must not be able to do it wrongly.
 */
create or replace function public.assert_offer_audience_sane()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  /*
   * SCOPED TO THE ROW THAT MOVED, never a scan of the whole table. A constraint
   * trigger has to be FOR EACH ROW, so a body that checked every offer would be
   * O(offers) per row and O(offers x rows) per statement — fine on 31 offers,
   * quietly ruinous on ten thousand, and the kind of thing that only shows up
   * once it is somebody's production evening.
   */
  v_offer_id uuid;
  v_offer public.offers%rowtype;
  v_wrong text;
begin
  /*
   * FOUR BRANCHES, NOT A CASE EXPRESSION, and both halves of that matter.
   *
   * NEW is UNASSIGNED on a DELETE — reading `new.id` there raises "record new
   * is not assigned yet" and takes the delete with it. And a CASE that mentions
   * both `new.id` and `new.offer_id` fails to COMPILE on whichever table lacks
   * the other field: plpgsql resolves every field reference in an expression,
   * not only the branch that runs. That is what "record new has no field id"
   * meant when this was first pushed.
   */
  if tg_table_name = 'offers' then
    if tg_op = 'DELETE' then v_offer_id := old.id; else v_offer_id := new.id; end if;
  else
    if tg_op = 'DELETE' then v_offer_id := old.offer_id; else v_offer_id := new.offer_id; end if;
  end if;

  select * into v_offer from public.offers where id = v_offer_id;
  -- The offer itself was deleted; its audience went with it by cascade.
  if not found then
    return null;
  end if;

  select a.mode into v_wrong
  from public.offer_audience a
  where a.offer_id = v_offer.id
    and a.mode <> case when v_offer.kind = 'volume' then 'deny' else 'allow' end
  limit 1;

  if v_wrong is not null then
    raise exception
      'offer "%" is a % but carries a "%" row. Clear its creator list before changing its type, or the people on it flip between allowed and excluded.',
      v_offer.title, v_offer.kind, v_wrong
      using errcode = '23514';
  end if;

  if v_offer.kind = 'retainer'
     and v_offer.status = 'active'
     and not exists (
       select 1 from public.offer_audience a
       where a.offer_id = v_offer.id and a.mode = 'allow'
     )
  then
    raise exception
      'retainer "%" is live with nobody on it, so no creator could see it. Add creators, or switch it off.',
      v_offer.title
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger offers_audience_sane
  after insert or update or delete on public.offers
  deferrable initially deferred
  for each row execute function public.assert_offer_audience_sane();

create constraint trigger offer_audience_sane
  after insert or update or delete on public.offer_audience
  deferrable initially deferred
  for each row execute function public.assert_offer_audience_sane();

-- ------------------------------------------------------ can I see this? ---

/*
 * THE RULE IS WRITTEN ONCE, IN ONE FUNCTION, AND EVERYTHING ELSE CALLS IT.
 *
 * There are two places that need this answer and they need it about different
 * people: the RLS policy asks about the caller, and `apply_for_offer` — which
 * is SECURITY DEFINER and therefore not subject to RLS at all — asks about the
 * actor whose id was passed in. Writing the allow/deny logic out twice is how
 * the two drift, and a drift here means one of them lets somebody through.
 *
 * So: the rule lives in the three-argument function, which is SERVICE ROLE
 * ONLY because it will answer about anybody. The caller-only wrapper below is
 * what `authenticated` may run, and it cannot be asked about anybody else
 * because it takes no creator argument.
 */
create or replace function public.offer_is_for(
  p_offer_id uuid,
  p_kind public.offer_kind,
  p_creator_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'volume' then not exists (
      select 1 from public.offer_audience a
      where a.offer_id = p_offer_id
        and a.mode = 'deny'
        and a.creator_id = p_creator_id
    )
    when 'retainer' then exists (
      select 1 from public.offer_audience a
      where a.offer_id = p_offer_id
        and a.mode = 'allow'
        and a.creator_id = p_creator_id
    )
    -- Optional narrowing: an empty list means everyone, which is what makes it
    -- optional rather than a second retainer.
    when 'high_commission' then
      not exists (
        select 1 from public.offer_audience a
        where a.offer_id = p_offer_id and a.mode = 'allow'
      )
      or exists (
        select 1 from public.offer_audience a
        where a.offer_id = p_offer_id
          and a.mode = 'allow'
          and a.creator_id = p_creator_id
      )
  end;
$$;

comment on function public.offer_is_for(uuid, public.offer_kind, uuid) is
  'Whether one named creator may discover one offer. The whole audience rule, written once. Service role only: it answers about anybody, so authenticated callers get can_see_offer instead.';

revoke all on function public.offer_is_for(uuid, public.offer_kind, uuid)
  from public, anon, authenticated;
grant execute on function public.offer_is_for(uuid, public.offer_kind, uuid) to service_role;

/*
 * What a signed-in creator may ask: only ever about themselves. No creator
 * argument exists to be changed, so there is nothing to tamper with.
 */
create or replace function public.can_see_offer(p_offer_id uuid, p_kind public.offer_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.offer_is_for(p_offer_id, p_kind, (select auth.uid()));
$$;

comment on function public.can_see_offer(uuid, public.offer_kind) is
  'Whether the CALLER may discover this offer. Reads auth.uid() itself and takes no creator argument, so it cannot be asked about anybody else.';

revoke all on function public.can_see_offer(uuid, public.offer_kind) from public, anon;
grant execute on function public.can_see_offer(uuid, public.offer_kind) to authenticated;

-- ------------------------------------------------------------ the policy ---

/*
 * The browsing policy, now audience aware. `offers_select_own_requests` is
 * untouched and sits beside it, so an offer you already asked for stays
 * readable however this one answers.
 */
drop policy "offers_select_creator" on public.offers;

create policy "offers_select_creator"
  on public.offers for select to authenticated
  using (
    status = 'active'
    and (select public.is_approved_creator())
    and exists (
      select 1 from public.brands b
      where b.id = offers.brand_id and b.is_active
    )
    and public.can_see_offer(offers.id, offers.kind)
  );

-- ------------------------------------------------------------- backfill ---

/*
 * THE 31 PENETREX OFFERS BECOME RETAINERS, NAMED TO WHOEVER IS ALREADY ON THEM.
 *
 * Checked before writing this rather than assumed: there are 31 offers and 31
 * distinct (video_count, reward_amount) pairs, so no two are the same deal.
 * 26 have exactly one creator; the rest have the handful who share those exact
 * terms. Every one of the 41 creators is on exactly one offer. They are
 * individual rates between $200 and $2,000, which is Rashid's own definition of
 * a retainer campaign, and they are currently readable by all 41 people.
 *
 * The rule below is deliberately narrow: an offer becomes a retainer ONLY if
 * somebody already has a request on it. An offer nobody has asked for has no
 * evidence about who it was meant for, so it stays `volume` and visible, which
 * is exactly how it behaves today. Nothing here can quietly hide an offer that
 * we cannot name an owner for.
 */
insert into public.offer_audience (offer_id, creator_id, mode)
select distinct a.offer_id, a.creator_id, 'allow'
from public.offer_applications a
where a.status in ('approved', 'pending')
on conflict (offer_id, creator_id) do nothing;

update public.offers o
set kind = 'retainer'
where exists (
  select 1 from public.offer_audience a
  where a.offer_id = o.id and a.mode = 'allow'
);

-- ------------------------------------------------------------ save_offer ---

/*
 * DROPPED AND RECREATED, NOT REPLACED.
 *
 * `create or replace` on a function with a NEW ARGUMENT creates a SECOND
 * OVERLOAD rather than replacing anything, and PostgREST then picks between
 * them by the argument names a request happens to send. That is how, on
 * 2026-08-20, `creator_daily_performance` served its old body to a two-argument
 * caller and returned an empty chart under a full set of cards. Adding a
 * parameter is exactly that case, so the old signature goes first.
 */
drop function if exists public.save_offer(
  uuid, uuid, text, integer, numeric, uuid, text, text, text, public.offer_status, boolean
);

create or replace function public.save_offer(
  p_actor_id uuid,
  p_brand_id uuid,
  p_title text,
  p_video_count integer,
  p_reward_amount numeric,
  p_offer_id uuid default null,
  p_badge_title text default null,
  p_description text default null,
  p_currency text default 'USD',
  p_status public.offer_status default 'active',
  p_needs_application boolean default true,
  p_kind public.offer_kind default 'volume',
  p_audience uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_offer    public.offers%rowtype;
  v_brand    public.brands%rowtype;
  v_title    text := nullif(trim(coalesce(p_title, '')), '');
  v_badge    text := nullif(trim(coalesce(p_badge_title, '')), '');
  v_desc     text := nullif(trim(coalesce(p_description, '')), '');
  v_kind     public.offer_kind := coalesce(p_kind, 'volume');
  v_audience uuid[] := coalesce(p_audience, '{}');
  v_mode     text;
  v_needs    boolean;
  v_stranger uuid;
  v_action   text;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if v_title is null then
    raise exception 'an offer needs a title' using errcode = '22023';
  end if;

  select * into v_brand from public.brands where id = p_brand_id;
  if not found then
    raise exception 'no such brand' using errcode = 'P0002';
  end if;

  /*
   * HIGH COMMISSION NEVER NEEDS AN APPLICATION. Rashid: *"for these offers do
   * not show user that checkbox"*. The form hides it; this decides it, so the
   * rule holds for anything that calls the function rather than only for what
   * the form sends.
   */
  v_needs := case
    when v_kind = 'high_commission' then false
    else coalesce(p_needs_application, true)
  end;

  -- A volume offer's list excludes; the other two include. This is the only
  -- place the mapping is written down, and the deferred trigger enforces it.
  v_mode := case when v_kind = 'volume' then 'deny' else 'allow' end;

  /*
   * EVERY NAMED ID MUST BE A REAL CREATOR. The Edge Function resolves handles
   * and emails to ids before calling this, but it is not the only possible
   * caller, and a stray uuid here would be a person who does not exist quietly
   * counting as somebody who may see a private deal.
   */
  if array_length(v_audience, 1) is not null then
    select x into v_stranger
    from unnest(v_audience) as x
    where not exists (
      select 1 from public.profiles p
      where p.id = x and p.role = 'creator' and p.is_active
    )
    limit 1;

    if v_stranger is not null then
      raise exception 'one of the creators named on this offer is not an active creator (%)', v_stranger
        using errcode = '22023';
    end if;
  end if;

  if p_offer_id is null then
    insert into public.offers (
      brand_id, badge_title, title, description, video_count,
      reward_amount, currency, status, needs_application, kind, created_by
    )
    values (
      p_brand_id, v_badge, v_title, v_desc, p_video_count,
      p_reward_amount, upper(coalesce(p_currency, 'USD')),
      coalesce(p_status, 'active'), v_needs, v_kind, v_actor.id
    )
    returning * into v_offer;

    v_action := 'offer.created';
  else
    update public.offers
    set badge_title       = v_badge,
        title             = v_title,
        description       = v_desc,
        video_count       = p_video_count,
        reward_amount     = p_reward_amount,
        currency          = upper(coalesce(p_currency, 'USD')),
        status            = coalesce(p_status, 'active'),
        needs_application = v_needs,
        kind              = v_kind,
        updated_at        = now()
    -- brand_id is intentionally NOT updatable, and the WHERE clause is how
    -- that is enforced. An offer moving between brands would silently change
    -- who is paying for it.
    where id = p_offer_id and brand_id = p_brand_id
    returning * into v_offer;

    if not found then
      raise exception 'no such offer on that brand' using errcode = 'P0002';
    end if;

    v_action := 'offer.updated';
  end if;

  /*
   * THE LIST IS REPLACED WHOLESALE, never merged. An admin editing an offer is
   * looking at the complete list in front of them; a merge would mean somebody
   * they deleted from the box stayed on the offer, which on a retainer is a
   * private rate still visible to somebody they meant to remove.
   */
  delete from public.offer_audience where offer_id = v_offer.id;

  if array_length(v_audience, 1) is not null then
    insert into public.offer_audience (offer_id, creator_id, mode, added_by)
    select distinct v_offer.id, x, v_mode, v_actor.id
    from unnest(v_audience) as x;
  end if;

  /*
   * The same audit shape as before, plus the three facts this change adds.
   * WHO CAN SEE A DEAL IS AN AUDITED FACT: if a creator ever asks why an offer
   * stopped appearing, the answer has to be recoverable, and "how many people
   * were on it before and after" is the question that gets asked first.
   */
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, v_action, 'offer', v_offer.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_brand.id,
      'title', v_offer.title,
      'video_count', v_offer.video_count,
      'reward_amount', v_offer.reward_amount,
      'currency', v_offer.currency,
      'status', v_offer.status,
      'needs_application', v_offer.needs_application,
      'kind', v_offer.kind,
      'audience_mode', v_mode,
      'audience_count', coalesce(array_length(v_audience, 1), 0)
    ))
  );

  -- The whole row, as before. Callers read fields off this.
  return to_jsonb(v_offer);
end;
$$;

revoke all on function public.save_offer(
  uuid, uuid, text, integer, numeric, uuid, text, text, text,
  public.offer_status, boolean, public.offer_kind, uuid[]
) from public, anon, authenticated;

grant execute on function public.save_offer(
  uuid, uuid, text, integer, numeric, uuid, text, text, text,
  public.offer_status, boolean, public.offer_kind, uuid[]
) to service_role;

-- ------------------------------------------------- the write path, gated ---

/*
 * `apply_for_offer` IS SECURITY DEFINER, SO RLS DOES NOT PROTECT IT.
 *
 * This is the hole that makes the whole feature decorative if it is missed,
 * and it is a two-step escalation rather than a one-step leak:
 *
 *   1. a creator who was never shown a retainer needs only its id — a stale
 *      tab, a copied link, a guess — to call this function, because it reads
 *      the offer AS OWNER and never consults the browsing policy;
 *   2. the row it inserts then satisfies `offers_select_own_requests`, which
 *      grants them a PERMANENT read of the offer they were meant not to see.
 *
 * And it does not stop at reading: the request lands in the staff queue
 * looking exactly like a legitimate one, and approving it snapshots the terms
 * and charges `brand_commercials.budget_used`. Real money moves.
 *
 * The check goes BEFORE the duplicate check on purpose. After it, somebody
 * barred from an offer would learn from a '55006' that they already have a row
 * on it, which is a fact about a deal they are not party to.
 *
 * The body below is the one from `20260731183000_offers_are_taken_as_written`,
 * unchanged apart from the inserted block. Same signature, so `create or
 * replace` genuinely replaces rather than adding an overload.
 */
create or replace function public.apply_for_offer(
  p_actor_id uuid,
  p_offer_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  public.profiles%rowtype;
  v_offer  public.offers%rowtype;
  v_brand  public.brands%rowtype;
  v_row    public.offer_applications%rowtype;
  v_handle text;
  v_note   text := nullif(trim(coalesce(p_note, '')), '');
begin
  v_actor := public.assert_active_creator(p_actor_id);

  select * into v_offer from public.offers where id = p_offer_id;
  if not found then
    raise exception 'no such offer' using errcode = 'P0002';
  end if;
  if v_offer.status <> 'active' then
    raise exception 'that offer is not open' using errcode = '22023';
  end if;

  select * into v_brand from public.brands where id = v_offer.brand_id;
  if not found or not v_brand.is_active then
    raise exception 'that brand is not open' using errcode = '22023';
  end if;

  -- THE AUDIENCE GATE. Same rule as the browsing policy, same function, so the
  -- two cannot drift into disagreeing about who is allowed.
  if not public.offer_is_for(v_offer.id, v_offer.kind, v_actor.id) then
    raise exception 'that offer is not open to you' using errcode = '42501';
  end if;

  if not v_offer.needs_application then
    raise exception 'that offer is already yours, there is nothing to apply for'
      using errcode = '22023';
  end if;

  -- An offer with no stated terms is still applyable. The rule that an offer
  -- needing an application must carry terms is enforced where it belongs, on
  -- the admin's side of the product, and refusing a creator here because an
  -- admin left a field empty would punish the wrong person.

  if exists (
    select 1 from public.offer_applications a
    where a.offer_id = p_offer_id
      and a.creator_id = v_actor.id
      and a.status in ('pending', 'approved')
  ) then
    raise exception 'you have already asked for this one' using errcode = '55006';
  end if;

  select a.tiktok_handle into v_handle
  from public.applications a
  where a.user_id = v_actor.id
  order by a.created_at desc
  limit 1;

  insert into public.offer_applications (
    offer_id, brand_id, creator_id, creator_handle, creator_name, creator_email,
    currency, note
  )
  values (
    p_offer_id, v_offer.brand_id, v_actor.id, v_handle, v_actor.display_name,
    v_actor.email, v_offer.currency, v_note
  )
  returning * into v_row;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id,
    target_user_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'offer_application.created',
    'offer_application', v_row.id, v_actor.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'offer', v_offer.title,
      'offer_id', v_offer.id,
      'video_count', v_offer.video_count,
      'reward_amount', v_offer.reward_amount,
      'currency', v_offer.currency
    ))
  );

  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------- approving is gated too, once ---

/*
 * THE SECOND WAY MONEY MOVES ON A DEAL SOMEBODY IS NOT ON.
 *
 * A creator applies while they are allowed. An admin then takes them off the
 * list. The request is still sitting in the queue looking ordinary, and
 * approving it runs `review_offer_application`, which snapshots the terms and
 * adds the amount to `brand_commercials.budget_used`. Nobody is told.
 *
 * A TRIGGER RATHER THAN A CHANGE TO THAT FUNCTION, deliberately.
 * `review_offer_application` has been re-issued five times across five
 * migrations and is long; copying it again to add four lines is how a body
 * gets subtly retyped, which this project has already been bitten by. A
 * trigger on the table catches every path into 'approved' — that function,
 * a future one, and direct SQL — and is small enough to read in one go.
 *
 * It fires only on the TRANSITION into approved, so re-saving an already
 * approved row for some other reason cannot start failing later.
 */
create or replace function public.assert_offer_application_audience()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.offer_kind;
begin
  if new.status <> 'approved' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;
  end if;

  select kind into v_kind from public.offers where id = new.offer_id;
  if v_kind is null then
    return new;
  end if;

  if not public.offer_is_for(new.offer_id, v_kind, new.creator_id) then
    raise exception
      'that creator is not on this offer''s list any more, so approving it would commit money on a deal they cannot see. Put them back on the offer, or reject the request.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger offer_applications_audience_gate
  before insert or update on public.offer_applications
  for each row execute function public.assert_offer_application_audience();

-- --------------------------------------- what your own request still buys ---

/*
 * NARROWED, AND THIS IS A DECISION RATHER THAN A TIDY-UP.
 *
 * `offers_select_own_requests` is PERMISSIVE and OR'd with every other SELECT
 * policy on offers, so whatever it allows, it allows regardless of the
 * audience list. It was written so that work already agreed never loses the
 * name of the thing being paid for, and that reasoning still holds — for work
 * that exists.
 *
 * It did not hold for a REJECTED or WITHDRAWN request. Those carry no work and
 * no money, and leaving them in meant: apply to a retainer, get turned down,
 * and keep reading that creator's private rate for ever. Combined with the
 * old ungated `apply_for_offer` it was a two-step way in for anybody who could
 * get hold of an offer id, which is why both are closed in the same migration.
 *
 * So: pending and approved keep the read. Live jobs, finished jobs and
 * requests still waiting all still show their offer's title and money on the
 * creator's dashboard, Content and pipeline screens. A rejected request shows
 * the offer as gone, which is what it is.
 */
drop policy "offers_select_own_requests" on public.offers;

create policy "offers_select_own_requests"
  on public.offers for select to authenticated
  using (
    exists (
      select 1
      from public.offer_applications a
      where a.offer_id = offers.id
        and a.creator_id = (select auth.uid())
        and a.status in ('pending', 'approved')
    )
  );

drop policy "brands_select_own_requests" on public.brands;

create policy "brands_select_own_requests"
  on public.brands for select to authenticated
  using (
    exists (
      select 1
      from public.offer_applications a
      where a.brand_id = brands.id
        and a.creator_id = (select auth.uid())
        and a.status in ('pending', 'approved')
    )
  );
