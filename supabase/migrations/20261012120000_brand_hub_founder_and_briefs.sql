-- ============================================================================
-- THE TWO PIECES OF A BRAND HUB THAT HAD NOWHERE TO LIVE.
--
-- Every hub a creator visits has the same structure, and the brand supplies the
-- content for it: an introduction with the founder and the accent colour,
-- products with their commission, briefs, offers and contests, and a read-only
-- view of the creators and the leaderboard. Four of those already had a home.
-- Two did not:
--
--   1. THE FOUNDER. A name, a role and a short note, three nullable columns on
--      `brands`. Creator facing, like tagline and description, so they ride the
--      existing table wide SELECT grant and the existing creator policy.
--
--   2. THE BRIEFS. What to make, the hooks to open with, and the do's and
--      don'ts. `collab_brand_briefs` is NOT this: that is an internal sheet of
--      document links the audit backend reads, keyed on a free text brand name.
--      This is the page a creator reads before filming.
--
-- NOT APPLIED to any database. Committed for review.
-- ============================================================================

-- ------------------------------------------------------------- founder -----
alter table public.brands
  add column if not exists founder_name text
    check (founder_name is null or length(trim(founder_name)) between 1 and 120),
  add column if not exists founder_role text
    check (founder_role is null or length(trim(founder_role)) between 1 and 120),
  add column if not exists founder_note text
    check (founder_note is null or length(trim(founder_note)) between 1 and 1000);

comment on column public.brands.founder_name is
  'Creator facing. Who started the brand, shown in the hub introduction. Optional.';
comment on column public.brands.founder_note is
  'Creator facing. A few sentences from the founder, in their own voice. Optional.';

-- --------------------------------------------------------------- briefs ----
create table public.brand_briefs (
  id uuid primary key default gen_random_uuid(),

  brand_id uuid not null references public.brands (id) on delete cascade,

  title text not null check (length(trim(title)) between 1 and 120),

  -- What to make, in plain words.
  what_to_make text check (what_to_make is null or length(trim(what_to_make)) between 1 and 2000),

  -- Three short lists. The write function trims every line, drops empty ones
  -- and refuses a line over 280 characters; these checks are the floor that a
  -- hand written update cannot go beneath.
  hooks text[] not null default '{}'
    check (cardinality(hooks) <= 10 and array_position(hooks, null) is null
           and length(array_to_string(hooks, '')) <= 2800),
  dos text[] not null default '{}'
    check (cardinality(dos) <= 10 and array_position(dos, null) is null
           and length(array_to_string(dos, '')) <= 2800),
  donts text[] not null default '{}'
    check (cardinality(donts) <= 10 and array_position(donts, null) is null
           and length(array_to_string(donts, '')) <= 2800),

  is_active boolean not null default true,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.brand_briefs is
  'What a creator should make for a brand: the idea, the hooks, the do''s and the don''ts. Every column is creator facing by design.';

create index brand_briefs_brand_created_idx
  on public.brand_briefs (brand_id, created_at);

create trigger brand_briefs_touch_updated_at
  before update on public.brand_briefs
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ RLS ----
alter table public.brand_briefs enable row level security;

create policy "brand_briefs_select_staff"
  on public.brand_briefs for select to authenticated
  using (public.is_staff());

-- Same gate as products: approved by the profiles table, not the JWT claim, and
-- only for a live brand. A hidden brief never reaches the browser.
create policy "brand_briefs_select_creator"
  on public.brand_briefs for select to authenticated
  using (
    is_active
    and (select public.is_approved_creator())
    and exists (
      select 1 from public.brands b
      where b.id = brand_briefs.brand_id and b.is_active
    )
  );

-- No insert, update or delete policy. Every write goes through manage-brand.

grant select on public.brand_briefs to authenticated;
grant all privileges on table public.brand_briefs to service_role;

-- ---------------------------------------------------------- write: briefs --
/*
 * Trims every line, drops the empty ones, and refuses a line that is too long
 * rather than cutting it off mid sentence.
 */
create or replace function private.clean_brief_lines(p_lines text[], p_what text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text[];
begin
  v_out := coalesce(
    array(
      select trim(x) from unnest(coalesce(p_lines, '{}'::text[])) as x
      where trim(coalesce(x, '')) <> ''
    ),
    '{}'::text[]
  );
  if cardinality(v_out) > 10 then
    raise exception 'keep % to ten lines or fewer', p_what using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_out) as y where length(y) > 280) then
    raise exception 'each line in % must be 280 characters or fewer', p_what
      using errcode = '22023';
  end if;
  return v_out;
end;
$$;

revoke all on function private.clean_brief_lines(text[], text) from public, anon, authenticated;
grant execute on function private.clean_brief_lines(text[], text) to service_role;

create or replace function public.save_brand_brief(
  p_actor_id uuid,
  p_brand_id uuid,
  p_title text,
  p_what_to_make text default null,
  p_hooks text[] default '{}',
  p_dos text[] default '{}',
  p_donts text[] default '{}',
  p_is_active boolean default true,
  p_brief_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.brand_briefs%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_what  text := nullif(trim(coalesce(p_what_to_make, '')), '');
  v_hooks text[] := private.clean_brief_lines(p_hooks, 'hooks');
  v_dos   text[] := private.clean_brief_lines(p_dos, 'do''s');
  v_donts text[] := private.clean_brief_lines(p_donts, 'don''ts');
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if length(v_title) not between 1 and 120 then
    raise exception 'a brief needs a title of up to 120 characters' using errcode = '22023';
  end if;
  if v_what is not null and length(v_what) > 2000 then
    raise exception 'what to make is too long' using errcode = '22023';
  end if;

  if p_brief_id is null then
    insert into public.brand_briefs (
      brand_id, title, what_to_make, hooks, dos, donts, is_active, created_by
    )
    values (
      p_brand_id, v_title, v_what, v_hooks, v_dos, v_donts, coalesce(p_is_active, true),
      v_actor.id
    )
    returning * into v_row;
  else
    -- brand_id is deliberately not in the SET list: moving a brief between
    -- brands would silently change whose creators read it.
    update public.brand_briefs
    set title = v_title, what_to_make = v_what, hooks = v_hooks, dos = v_dos,
        donts = v_donts, is_active = coalesce(p_is_active, true)
    where id = p_brief_id and brand_id = p_brand_id
    returning * into v_row;

    if not found then
      raise exception 'no such brief' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role,
    case when p_brief_id is null then 'brand.brief_created' else 'brand.brief_updated' end,
    'brand', v_row.brand_id,
    jsonb_build_object('brief_id', v_row.id, 'title', v_row.title, 'is_active', v_row.is_active)
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.save_brand_brief(uuid, uuid, text, text, text[], text[], text[], boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.save_brand_brief(uuid, uuid, text, text, text[], text[], text[], boolean, uuid)
  to service_role;

create or replace function public.delete_brand_brief(p_actor_id uuid, p_brief_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.brand_briefs%rowtype;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  select * into v_row from public.brand_briefs where id = p_brief_id;
  if not found then
    raise exception 'no such brief' using errcode = 'P0002';
  end if;

  -- Audited BEFORE the delete, so the record of what went survives it.
  insert into public.audit_log (
    actor_id, actor_email, actor_role, action, subject_type, subject_id, detail
  )
  values (
    v_actor.id, v_actor.email, v_actor.role, 'brand.brief_deleted', 'brand', v_row.brand_id,
    jsonb_build_object('brief_id', v_row.id, 'title', v_row.title)
  );

  delete from public.brand_briefs where id = p_brief_id;
  return jsonb_build_object('id', p_brief_id);
end;
$$;

revoke all on function public.delete_brand_brief(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_brand_brief(uuid, uuid) to service_role;

-- --------------------------------------------- write: the hub introduction --
/*
 * DROPPED FIRST, BY ITS FULL ARGUMENT LIST. A changed argument list under
 * `create or replace` creates a second overload that PostgREST would keep
 * binding to by name, silently dropping the new fields.
 */
drop function if exists public.save_brand_about(uuid, uuid, text, text, text, text, text, jsonb);

create or replace function public.save_brand_about(
  p_actor_id uuid,
  p_brand_id uuid,
  p_logo_url text default null,
  p_tagline text default null,
  p_description text default null,
  p_brand_color text default null,
  p_hero_url text default null,
  p_theme jsonb default null,
  p_founder_name text default null,
  p_founder_role text default null,
  p_founder_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_brand public.brands%rowtype;
  v_color text := nullif(trim(coalesce(p_brand_color, '')), '');
  v_theme jsonb := p_theme;
begin
  v_actor := public.assert_active_staff(p_actor_id);

  if v_color is not null and v_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'a brand colour must be a six digit hex, like #173d36'
      using errcode = '22023';
  end if;

  if v_theme is not null and (jsonb_typeof(v_theme) <> 'object' or v_theme = '{}'::jsonb) then
    v_theme := null;
  end if;

  if not public.brand_theme_ok(v_theme) then
    raise exception 'that brand theme is not a shape we can store: each area needs one to four colours like #173d36'
      using errcode = '22023';
  end if;

  update public.brands
  set logo_url     = nullif(trim(coalesce(p_logo_url, '')), ''),
      tagline      = nullif(trim(coalesce(p_tagline, '')), ''),
      description  = nullif(trim(coalesce(p_description, '')), ''),
      brand_color  = v_color,
      hero_url     = nullif(trim(coalesce(p_hero_url, '')), ''),
      theme        = v_theme,
      founder_name = nullif(trim(coalesce(p_founder_name, '')), ''),
      founder_role = nullif(trim(coalesce(p_founder_role, '')), ''),
      founder_note = nullif(trim(coalesce(p_founder_note, '')), '')
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
      'tagline', v_brand.tagline,
      'brand_color', v_brand.brand_color,
      'theme', v_brand.theme,
      'has_hero', v_brand.hero_url is not null,
      'founder_name', v_brand.founder_name
    ))
  );

  return to_jsonb(v_brand);
end;
$$;

revoke all on function public.save_brand_about(uuid, uuid, text, text, text, text, text, jsonb, text, text, text)
  from anon, authenticated, public;
grant execute on function public.save_brand_about(uuid, uuid, text, text, text, text, text, jsonb, text, text, text)
  to service_role;
