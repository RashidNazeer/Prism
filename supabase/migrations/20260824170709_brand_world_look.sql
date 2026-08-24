-- ============================================================================
-- A brand gets a colour and a hero image, and that is ALL it gets.
--
-- Rashid wants a creator opening a Brand Hub to land in "a new world" that
-- belongs to the brand rather than to Wurx: its own colours, its own hero, the
-- Wurx chrome out of the way.
--
-- ONE COLOUR, NOT A PALETTE, and that is a safety decision rather than a
-- simplification. Every other colour in this product lives in
-- `src/styles/tokens.css`, where `pnpm check:contrast` fails the build if dark
-- and light drift or any pair drops below WCAG AA. A colour chosen in an admin
-- colour picker lives HERE, in a row, and that guard cannot see it. Nothing
-- would fail. An admin could pick a pale mint and hand every creator a hub they
-- cannot read, and the first anybody would hear of it is a complaint.
--
-- So the admin picks one hex and nothing else. `src/lib/brand-theme.ts` derives
-- the rail, the hero, the page, the cards and every text colour from it, and
-- picks the text by MEASURING contrast rather than by taste.
-- `scripts/check-brand-theme.mjs` runs 88 colours, including pure yellow, pure
-- white, black and a full hue circle, through 13 text-on-background pairs in
-- both modes, and it runs inside `pnpm build`. That is the guard that replaces
-- the one the database bypasses.
--
-- WHY THE COLUMN IS STILL JUST TEXT. A hex is a hex. The check constraint
-- refuses anything that is not six hex digits behind a hash, so a malformed
-- value cannot reach the browser and be silently ignored there.
-- ============================================================================

alter table public.brands
  add column if not exists brand_color text
    check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  /*
   * The picture behind the hero. Same shape of check as `contests.banner_url`:
   * https only, and a sane length, so a row cannot carry a `javascript:` URL or
   * a data URI big enough to matter.
   */
  add column if not exists hero_url text
    check (
      hero_url is null
      or (hero_url ~* '^https://' and length(hero_url) between 12 and 2048)
    );

comment on column public.brands.brand_color is
  'The one colour an admin picks for this brand''s hub. Everything else is derived from it in src/lib/brand-theme.ts, including every text colour, which is chosen by measuring contrast. Null means the hub falls back to the Wurx gold.';

comment on column public.brands.hero_url is
  'The image behind a Brand Hub hero. Optional: every hub is designed to be right with no image at all, because that is the state most brands are in.';

-- ----------------------------------------------------------------------------
-- The admin write path.
-- ----------------------------------------------------------------------------
/*
 * DROPPED FIRST. `create or replace function` with a changed argument list
 * creates a SECOND OVERLOAD rather than replacing anything, and PostgREST binds
 * an RPC by the argument names a request sends. The old five-argument body
 * would stay alive and keep answering `brand.about` calls, silently ignoring
 * the two new fields. This repo has already lost a day to exactly that, twice.
 */
drop function if exists public.save_brand_about(uuid, uuid, text, text, text);

create or replace function public.save_brand_about(
  p_actor_id uuid,
  p_brand_id uuid,
  p_logo_url text default null,
  p_tagline text default null,
  p_description text default null,
  p_brand_color text default null,
  p_hero_url text default null
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
begin
  v_actor := public.assert_active_staff(p_actor_id);

  /*
   * CHECKED HERE TOO, not only in the column and not only in the browser.
   * The constraint would refuse a bad value with a constraint error, which
   * reaches an admin as a wall of Postgres. This says what is wrong instead.
   */
  if v_color is not null and v_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'a brand colour must be a six digit hex, like #173d36'
      using errcode = '22023';
  end if;

  update public.brands
  set logo_url    = nullif(trim(coalesce(p_logo_url, '')), ''),
      tagline     = nullif(trim(coalesce(p_tagline, '')), ''),
      description = nullif(trim(coalesce(p_description, '')), ''),
      brand_color = v_color,
      hero_url    = nullif(trim(coalesce(p_hero_url, '')), '')
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
      -- Worth auditing: it changes what every creator at this brand sees.
      'brand_color', v_brand.brand_color,
      'has_hero', v_brand.hero_url is not null
    ))
  );

  return to_jsonb(v_brand);
end;
$$;

revoke all on function public.save_brand_about(uuid, uuid, text, text, text, text, text)
  from anon, authenticated, public;
grant execute on function public.save_brand_about(uuid, uuid, text, text, text, text, text)
  to service_role;
