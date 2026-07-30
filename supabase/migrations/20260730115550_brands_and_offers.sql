-- ============================================================================
-- Step 6, part one: brands and their offers.
-- ============================================================================
-- A BRAND is a seller's store on TikTok Shop. A BRAND HUB is everything that
-- hangs off that brand: offers, campaigns, contests, promotions, discounts and
-- the creators working with it. This migration lays the brand itself and the
-- first section, offers.
--
-- An OFFER is what a brand will pay a creator for content. "Five videos, $300."
-- `needs_application` decides whether a creator has to ask first or can simply
-- take it.
--
-- Deliberately NOT built yet, but the shape is chosen so they drop in without
-- reshaping anything: campaigns, contests, promotions, discounts, creator
-- enrolments, and creator-proposed custom offers (videos plus the amount they
-- want) with an admin approve or reject step.
--
-- Access, phase one: staff only, on both tables.
--   Creators will need to browse brands and offers, and that read path is
--   deliberately NOT shipped here. `brands` carries commercial data (the
--   allocated budget, the client's name) that must never reach a creator, and
--   column-level SELECT grants cannot help because staff and creators are both
--   `authenticated`. When the creator hub is built it gets a column-limited
--   view over this table, written against the real requirements. Shipping a
--   guess at that today would be shipping an untested way to leak a budget.
-- ============================================================================

create type public.offer_status as enum ('active', 'inactive');

-- ---------------------------------------------------------------- brands ---

create table public.brands (
  id uuid primary key default gen_random_uuid(),

  name text not null check (length(trim(name)) between 1 and 120),

  -- Stable, URL safe, and generated from the name on creation only. It is
  -- never regenerated on rename: creators will have brand hub links, and a
  -- rename must not quietly break every one of them.
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),

  -- The brand's identity on TikTok Shop. Unique because two brands sharing one
  -- store is always a mistake, and catching a pasted duplicate at the door is
  -- cheaper than untangling it later.
  store_id text not null unique check (length(trim(store_id)) between 1 and 64),

  -- The agency's client behind the brand. Internal, never creator facing.
  client_name text check (client_name is null or length(trim(client_name)) <= 120),

  -- Money. numeric, never a float: a float cannot hold 0.10 exactly and this
  -- column decides what people get paid out of.
  budget_allocated numeric(14, 2) check (budget_allocated is null or budget_allocated >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  -- Soft switch rather than deletion. A brand with history should stop being
  -- offered to creators, not vanish.
  is_active boolean not null default true,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.brands is
  'A seller store on TikTok Shop. The root of a Brand Hub.';

create index brands_active_name_idx on public.brands (is_active, name);
create index brands_created_at_idx on public.brands (created_at desc);
-- Substring search on the brand list, the same trigram approach the
-- application queue uses.
create index brands_name_trgm_idx
  on public.brands using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------- offers ---

create table public.offers (
  id uuid primary key default gen_random_uuid(),

  -- An offer has no meaning without its brand, so it goes when the brand goes.
  -- NOTE for whoever adds creator enrolments: hang them off `offers` with
  -- `on delete restrict`, so a brand carrying real creator commitments cannot
  -- be deleted out from under them.
  brand_id uuid not null references public.brands (id) on delete cascade,

  -- Short label on the card, for example "TOP PICK". Optional.
  badge_title text check (badge_title is null or length(trim(badge_title)) between 1 and 32),

  title text not null check (length(trim(title)) between 1 and 120),
  description text check (description is null or length(description) <= 2000),

  video_count integer not null check (video_count between 1 and 1000),

  reward_amount numeric(12, 2) not null check (reward_amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  status public.offer_status not null default 'active',

  -- True: the creator has to apply and be approved. False: it is theirs to
  -- take. This is the difference between a pre-approved offer and one a human
  -- has to sign off, so it is a column, not a note in the description.
  needs_application boolean not null default true,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.offers is
  'What a brand pays a creator for content. Always belongs to exactly one brand.';

create index offers_brand_created_idx on public.offers (brand_id, created_at desc);
create index offers_brand_status_idx on public.offers (brand_id, status);
create index offers_open_idx
  on public.offers (brand_id)
  where status = 'active' and not needs_application;

-- ----------------------------------------------------------- row security --

alter table public.brands enable row level security;
alter table public.offers enable row level security;

-- Staff read everything. Nobody writes with a user token at all: there is no
-- insert, update or delete policy on either table, on purpose. Every write goes
-- through the security definer functions below, which the Edge Function calls
-- after re-checking the caller's role.
create policy "brands_select_staff"
  on public.brands for select to authenticated
  using (public.is_staff());

create policy "offers_select_staff"
  on public.offers for select to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------- grants ---
-- Auto expose is off, so nothing is reachable without an explicit grant, and
-- that includes service_role.

grant select on public.brands to authenticated;
grant select on public.offers to authenticated;

grant all privileges on table public.brands to service_role;
grant all privileges on table public.offers to service_role;

-- ------------------------------------------------------------ timestamps --

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger brands_touch_updated_at
  before update on public.brands
  for each row execute function public.touch_updated_at();

create trigger offers_touch_updated_at
  before update on public.offers
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------- realtime ---
-- Two admins can be in the same brand hub at once, and later creators will be
-- watching an offer list while it is edited. Row level security still applies
-- to realtime, so only people who may read a row are told that it changed.

alter publication supabase_realtime add table public.brands;
alter publication supabase_realtime add table public.offers;
alter table public.brands replica identity full;
alter table public.offers replica identity full;

-- ============================================================================
-- Writes. service_role only, one transaction each, audited.
-- ============================================================================

-- Shared gate. Every write function starts here, so "who may change a brand"
-- is answered in exactly one place.
create or replace function public.assert_active_staff(p_actor_id uuid)
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
begin
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found then
    raise exception 'unknown actor' using errcode = '42501';
  end if;
  if v_actor.role not in ('ops', 'admin') or not v_actor.is_active then
    raise exception 'that account is not active staff' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

-- ------------------------------------------------------------ save_brand ---

create or replace function public.save_brand(
  p_actor_id uuid,
  p_name text,
  p_store_id text,
  p_brand_id uuid default null,
  p_client_name text default null,
  p_budget numeric default null,
  p_currency text default 'USD',
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  public.profiles%rowtype;
  v_brand  public.brands%rowtype;
  v_name   text := nullif(trim(coalesce(p_name, '')), '');
  v_store  text := nullif(trim(coalesce(p_store_id, '')), '');
  v_client text := nullif(trim(coalesce(p_client_name, '')), '');
  v_slug   text;
  v_base   text;
  v_n      integer := 1;
  v_action text;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if v_name is null then
    raise exception 'a brand needs a name' using errcode = '22023';
  end if;
  if v_store is null then
    raise exception 'a brand needs a store id' using errcode = '22023';
  end if;

  if p_brand_id is null then
    -- Slug is derived once, here, and then left alone forever.
    v_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
    if v_base = '' then
      v_base := 'brand';
    end if;
    v_slug := v_base;
    while exists (select 1 from public.brands b where b.slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;

    insert into public.brands (
      name, slug, store_id, client_name, budget_allocated, currency, is_active, created_by
    )
    values (
      v_name, v_slug, v_store, v_client, p_budget, upper(coalesce(p_currency, 'USD')),
      coalesce(p_is_active, true), v_actor.id
    )
    returning * into v_brand;

    v_action := 'brand.created';
  else
    update public.brands
    set name             = v_name,
        store_id         = v_store,
        client_name      = v_client,
        budget_allocated = p_budget,
        currency         = upper(coalesce(p_currency, 'USD')),
        is_active        = coalesce(p_is_active, true)
    where id = p_brand_id
    returning * into v_brand;

    if not found then
      raise exception 'no such brand' using errcode = 'P0002';
    end if;

    v_action := 'brand.updated';
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, v_action, 'brand', v_brand.id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_brand.name,
      'slug', v_brand.slug,
      'store_id', v_brand.store_id,
      'budget', v_brand.budget_allocated,
      'currency', v_brand.currency,
      'is_active', v_brand.is_active
    ))
  );

  return to_jsonb(v_brand);
end;
$$;

-- ------------------------------------------------------------ save_offer ---

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
  p_needs_application boolean default true
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
  v_title  text := nullif(trim(coalesce(p_title, '')), '');
  v_badge  text := nullif(trim(coalesce(p_badge_title, '')), '');
  v_desc   text := nullif(trim(coalesce(p_description, '')), '');
  v_action text;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if v_title is null then
    raise exception 'an offer needs a title' using errcode = '22023';
  end if;

  select * into v_brand from public.brands where id = p_brand_id;
  if not found then
    raise exception 'no such brand' using errcode = 'P0002';
  end if;

  if p_offer_id is null then
    insert into public.offers (
      brand_id, badge_title, title, description, video_count,
      reward_amount, currency, status, needs_application, created_by
    )
    values (
      p_brand_id, v_badge, v_title, v_desc, p_video_count,
      p_reward_amount, upper(coalesce(p_currency, 'USD')),
      coalesce(p_status, 'active'), coalesce(p_needs_application, true), v_actor.id
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
        needs_application = coalesce(p_needs_application, true)
    -- brand_id is intentionally NOT updatable. An offer moving between brands
    -- would silently change who is paying for it.
    where id = p_offer_id and brand_id = p_brand_id
    returning * into v_offer;

    if not found then
      raise exception 'no such offer on that brand' using errcode = 'P0002';
    end if;

    v_action := 'offer.updated';
  end if;

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
      'needs_application', v_offer.needs_application
    ))
  );

  return to_jsonb(v_offer);
end;
$$;

-- ---------------------------------------------------------- delete_offer ---

create or replace function public.delete_offer(p_actor_id uuid, p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_offer public.offers%rowtype;
  v_brand public.brands%rowtype;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_offer from public.offers where id = p_offer_id;
  if not found then
    raise exception 'no such offer' using errcode = 'P0002';
  end if;

  select * into v_brand from public.brands where id = v_offer.brand_id;

  -- The audit row is written BEFORE the delete, in the same transaction, so
  -- the record of what was removed survives the removal.
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'offer.deleted', 'offer', v_offer.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_offer.brand_id,
      'title', v_offer.title,
      'video_count', v_offer.video_count,
      'reward_amount', v_offer.reward_amount,
      'currency', v_offer.currency
    ))
  );

  delete from public.offers where id = p_offer_id;

  return to_jsonb(v_offer);
end;
$$;

-- ----------------------------------------------------------------- locks ---
-- Server side only. A user token cannot reach any of these even by name, which
-- is the whole point of putting brand and offer writes behind an Edge Function
-- that re-checks the caller first.

revoke all on function public.assert_active_staff(uuid) from public, anon, authenticated;
revoke all on function public.save_brand(uuid, text, text, uuid, text, numeric, text, boolean)
  from public, anon, authenticated;
revoke all on function public.save_offer(uuid, uuid, text, integer, numeric, uuid, text, text, text, public.offer_status, boolean)
  from public, anon, authenticated;
revoke all on function public.delete_offer(uuid, uuid) from public, anon, authenticated;

grant execute on function public.save_brand(uuid, text, text, uuid, text, numeric, text, boolean)
  to service_role;
grant execute on function public.save_offer(uuid, uuid, text, integer, numeric, uuid, text, text, text, public.offer_status, boolean)
  to service_role;
grant execute on function public.delete_offer(uuid, uuid) to service_role;
