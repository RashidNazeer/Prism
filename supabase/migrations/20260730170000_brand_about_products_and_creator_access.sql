-- ============================================================================
-- Step 6, part two: the brand's story, its products, and the creator door.
-- ============================================================================
-- Three things happen here, and the first is the reason for the other two.
--
-- 1. THE SPLIT. Creators are about to read `brands` for the first time. That
--    table currently carries the allocated budget and the agency's client, and
--    hiding them is not possible: column level SELECT grants cannot separate
--    staff from creators, because both are the Postgres `authenticated` role.
--    So the commercial columns MOVE to their own staff-only table. After this
--    migration there is no budget column on anything a creator can reach. Not
--    filtered out. Not there. A future careless policy on `brands` cannot leak
--    money, because the money is not in `brands`.
--
-- 2. THE BRAND'S STORY. Logo, tagline and description, which is what a creator
--    reads before deciding whether they want to work with a brand at all.
--
-- 3. PRODUCTS. What the brand actually sells, with the commission we offer on
--    each one. Managed separately from the brand's own details, because adding
--    products is its own job and should not be buried in a brand form.
--
-- Reads open up for approved creators. Writes do not: there is still no
-- insert, update or delete policy on any of these tables, and every write goes
-- through the `manage-brand` Edge Function into a security definer function
-- that audits in the same transaction.
-- ============================================================================

-- ---------------------------------------------------------- brand: story ---

alter table public.brands
  add column logo_url text
    check (logo_url is null or length(logo_url) between 1 and 500),

  -- One line under the name, e.g. "Pain Relief & Recovery".
  add column tagline text
    check (tagline is null or length(trim(tagline)) between 1 and 160),

  add column description text
    check (description is null or length(description) <= 4000);

comment on column public.brands.logo_url is
  'Public URL in the brand-assets storage bucket. Creator facing.';

-- ---------------------------------------------------- brand: commercials ---
-- Everything a creator must never see, in one table with one gate on it.
-- One row per brand, so the brand id is the primary key as well as the
-- foreign key: there is no such thing as two budgets for one brand.

create table public.brand_commercials (
  brand_id uuid primary key references public.brands (id) on delete cascade,

  -- The agency's client behind the brand. Internal.
  client_name text check (client_name is null or length(trim(client_name)) <= 120),

  -- Money. numeric, never a float: a float cannot hold 0.10 exactly and this
  -- column decides what people get paid out of.
  budget_allocated numeric(14, 2) check (budget_allocated is null or budget_allocated >= 0),

  -- Denominates the budget above, and nothing else. Offers and products carry
  -- their own currency, because they are quoted to creators and this is not.
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.brand_commercials is
  'Internal commercial record for a brand: client and budget. Staff only, and deliberately NOT part of the brands table, so a creator read path cannot reach it by accident.';

-- Carry the existing rows across before the columns disappear.
insert into public.brand_commercials (brand_id, client_name, budget_allocated, currency)
select id, client_name, budget_allocated, currency
from public.brands;

alter table public.brands
  drop column client_name,
  drop column budget_allocated,
  drop column currency;

-- -------------------------------------------------------- brand products ---

create table public.brand_products (
  id uuid primary key default gen_random_uuid(),

  brand_id uuid not null references public.brands (id) on delete cascade,

  name text not null check (length(trim(name)) between 1 and 160),

  -- The product's id on TikTok Shop. Sales data will arrive keyed on this, so
  -- it is required and unique within the brand: two rows for one product would
  -- split a creator's numbers in half.
  external_product_id text not null
    check (length(trim(external_product_id)) between 1 and 64),

  image_url text check (image_url is null or length(image_url) between 1 and 500),

  -- Both optional. A product can be listed before its numbers are confirmed,
  -- and an empty field is honest where a made up one is not.
  price numeric(12, 2) check (price is null or price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  -- What we pay the creator, as a percentage. Creator facing, and the single
  -- most important number on the card.
  commission_rate numeric(5, 2)
    check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 100)),

  -- Short label on the card, for example "HERO".
  badge_title text check (badge_title is null or length(trim(badge_title)) between 1 and 32),

  is_active boolean not null default true,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (brand_id, external_product_id)
);

comment on table public.brand_products is
  'What a brand sells, and the commission we offer creators on each one. Every column here is creator facing by design.';

create index brand_products_brand_created_idx
  on public.brand_products (brand_id, created_at);

create index brand_products_brand_active_idx
  on public.brand_products (brand_id, is_active);

create trigger brand_commercials_touch_updated_at
  before update on public.brand_commercials
  for each row execute function public.touch_updated_at();

create trigger brand_products_touch_updated_at
  before update on public.brand_products
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Who may browse
-- ============================================================================
-- Deliberately NOT `is_staff()`, which reads the role from the JWT.
--
-- A token only refreshes about once an hour, so a creator approved thirty
-- seconds ago is still carrying `applicant` in their claims. Gating the brand
-- hub on that claim would mean somebody watches the approval land on their
-- dashboard, clicks straight through to the brands, and finds nothing there
-- for up to an hour. The profiles table is read instead, so approval takes
-- effect the moment it happens.
--
-- Security definer so it can read `profiles` without recursing back through
-- that table's own policies.

create or replace function public.is_approved_creator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('creator', 'ops', 'admin')
  );
$$;

comment on function public.is_approved_creator() is
  'True when the caller is an active creator or staff member, read from the profiles table rather than the JWT so an approval takes effect immediately.';

revoke all on function public.is_approved_creator() from public, anon;
grant execute on function public.is_approved_creator() to authenticated;

-- ----------------------------------------------------------- row security --

alter table public.brand_commercials enable row level security;
alter table public.brand_products enable row level security;

-- Staff, everything.
create policy "brand_commercials_select_staff"
  on public.brand_commercials for select to authenticated
  using (public.is_staff());

create policy "brand_products_select_staff"
  on public.brand_products for select to authenticated
  using (public.is_staff());

-- Creators, only what is live. Wrapped in `(select ...)` so Postgres evaluates
-- the check once per statement rather than once per row.
create policy "brands_select_creator"
  on public.brands for select to authenticated
  using (is_active and (select public.is_approved_creator()));

create policy "offers_select_creator"
  on public.offers for select to authenticated
  using (
    status = 'active'
    and (select public.is_approved_creator())
    and exists (
      select 1 from public.brands b
      where b.id = offers.brand_id and b.is_active
    )
  );

create policy "brand_products_select_creator"
  on public.brand_products for select to authenticated
  using (
    is_active
    and (select public.is_approved_creator())
    and exists (
      select 1 from public.brands b
      where b.id = brand_products.brand_id and b.is_active
    )
  );

-- There is NO creator policy on brand_commercials, and there must never be
-- one. That table is the reason the split exists.

-- ---------------------------------------------------------------- grants ---
-- Auto expose is off, so nothing is reachable without an explicit grant, and
-- that includes service_role.

grant select on public.brand_commercials to authenticated;
grant select on public.brand_products to authenticated;

grant all privileges on table public.brand_commercials to service_role;
grant all privileges on table public.brand_products to service_role;

-- ============================================================================
-- Writes. service_role only, one transaction each, audited.
-- ============================================================================

-- ------------------------------------------------------------ save_brand ---
-- Same signature as before, new body: the brand row and its commercial record
-- are written together, and the two halves are handed back merged so callers
-- still see one brand.

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
  v_comm   public.brand_commercials%rowtype;
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

    insert into public.brands (name, slug, store_id, is_active, created_by)
    values (v_name, v_slug, v_store, coalesce(p_is_active, true), v_actor.id)
    returning * into v_brand;

    v_action := 'brand.created';
  else
    update public.brands
    set name      = v_name,
        store_id  = v_store,
        is_active = coalesce(p_is_active, true)
    where id = p_brand_id
    returning * into v_brand;

    if not found then
      raise exception 'no such brand' using errcode = 'P0002';
    end if;

    v_action := 'brand.updated';
  end if;

  insert into public.brand_commercials (brand_id, client_name, budget_allocated, currency)
  values (v_brand.id, v_client, p_budget, upper(coalesce(p_currency, 'USD')))
  on conflict (brand_id) do update
    set client_name      = excluded.client_name,
        budget_allocated = excluded.budget_allocated,
        currency         = excluded.currency
  returning * into v_comm;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, v_action, 'brand', v_brand.id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_brand.name,
      'slug', v_brand.slug,
      'store_id', v_brand.store_id,
      'budget', v_comm.budget_allocated,
      'currency', v_comm.currency,
      'is_active', v_brand.is_active
    ))
  );

  -- Merged, so a caller still gets one brand shaped object.
  return to_jsonb(v_brand) || jsonb_build_object(
    'client_name', v_comm.client_name,
    'budget_allocated', v_comm.budget_allocated,
    'currency', v_comm.currency
  );
end;
$$;

-- ------------------------------------------------------ save_brand_about ---
-- Its own door rather than more parameters on save_brand. The About form owns
-- three fields and should not be able to touch the name, the store id or the
-- budget, even by sending a stale copy of them back.

create or replace function public.save_brand_about(
  p_actor_id uuid,
  p_brand_id uuid,
  p_logo_url text default null,
  p_tagline text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_brand public.brands%rowtype;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  update public.brands
  set logo_url    = nullif(trim(coalesce(p_logo_url, '')), ''),
      tagline     = nullif(trim(coalesce(p_tagline, '')), ''),
      description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_brand_id
  returning * into v_brand;

  if not found then
    raise exception 'no such brand' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'brand.about_updated', 'brand', v_brand.id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_brand.name,
      'has_logo', v_brand.logo_url is not null,
      'tagline', v_brand.tagline
    ))
  );

  return to_jsonb(v_brand);
end;
$$;

-- ---------------------------------------------------------- save_product ---

create or replace function public.save_product(
  p_actor_id uuid,
  p_brand_id uuid,
  p_name text,
  p_external_product_id text,
  p_product_id uuid default null,
  p_image_url text default null,
  p_price numeric default null,
  p_currency text default 'USD',
  p_commission_rate numeric default null,
  p_badge_title text default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    public.profiles%rowtype;
  v_product  public.brand_products%rowtype;
  v_brand    public.brands%rowtype;
  v_name     text := nullif(trim(coalesce(p_name, '')), '');
  v_external text := nullif(trim(coalesce(p_external_product_id, '')), '');
  v_badge    text := nullif(trim(coalesce(p_badge_title, '')), '');
  v_image    text := nullif(trim(coalesce(p_image_url, '')), '');
  v_action   text;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if v_name is null then
    raise exception 'a product needs a name' using errcode = '22023';
  end if;
  if v_external is null then
    raise exception 'a product needs its TikTok Shop product id' using errcode = '22023';
  end if;

  select * into v_brand from public.brands where id = p_brand_id;
  if not found then
    raise exception 'no such brand' using errcode = 'P0002';
  end if;

  if p_product_id is null then
    insert into public.brand_products (
      brand_id, name, external_product_id, image_url, price, currency,
      commission_rate, badge_title, is_active, created_by
    )
    values (
      p_brand_id, v_name, v_external, v_image, p_price,
      upper(coalesce(p_currency, 'USD')), p_commission_rate, v_badge,
      coalesce(p_is_active, true), v_actor.id
    )
    returning * into v_product;

    v_action := 'product.created';
  else
    update public.brand_products
    set name                = v_name,
        external_product_id = v_external,
        image_url           = v_image,
        price               = p_price,
        currency            = upper(coalesce(p_currency, 'USD')),
        commission_rate     = p_commission_rate,
        badge_title         = v_badge,
        is_active           = coalesce(p_is_active, true)
    -- brand_id is intentionally NOT updatable, for the same reason an offer
    -- cannot move brands: it would silently change whose product it is.
    where id = p_product_id and brand_id = p_brand_id
    returning * into v_product;

    if not found then
      raise exception 'no such product on that brand' using errcode = 'P0002';
    end if;

    v_action := 'product.updated';
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, v_action, 'product', v_product.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_brand.id,
      'name', v_product.name,
      'external_product_id', v_product.external_product_id,
      'price', v_product.price,
      'currency', v_product.currency,
      'commission_rate', v_product.commission_rate,
      'is_active', v_product.is_active
    ))
  );

  return to_jsonb(v_product);
end;
$$;

-- -------------------------------------------------------- delete_product ---

create or replace function public.delete_product(p_actor_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   public.profiles%rowtype;
  v_product public.brand_products%rowtype;
  v_brand   public.brands%rowtype;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_product from public.brand_products where id = p_product_id;
  if not found then
    raise exception 'no such product' using errcode = 'P0002';
  end if;

  select * into v_brand from public.brands where id = v_product.brand_id;

  -- Audit row first, in the same transaction, so the record of what was
  -- removed survives the removal.
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'product.deleted', 'product', v_product.id,
    jsonb_strip_nulls(jsonb_build_object(
      'brand', v_brand.name,
      'brand_id', v_product.brand_id,
      'name', v_product.name,
      'external_product_id', v_product.external_product_id,
      'price', v_product.price,
      'currency', v_product.currency
    ))
  );

  delete from public.brand_products where id = p_product_id;

  return to_jsonb(v_product);
end;
$$;

-- ----------------------------------------------------------------- locks ---
-- Server side only. A user token cannot reach any of these even by name.

revoke all on function
  public.save_brand_about(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function
  public.save_product(uuid, uuid, text, text, uuid, text, numeric, text, numeric, text, boolean)
  from public, anon, authenticated;
revoke all on function public.delete_product(uuid, uuid) from public, anon, authenticated;

grant execute on function
  public.save_brand_about(uuid, uuid, text, text, text) to service_role;
grant execute on function
  public.save_product(uuid, uuid, text, text, uuid, text, numeric, text, numeric, text, boolean)
  to service_role;
grant execute on function public.delete_product(uuid, uuid) to service_role;
