-- ============================================================================
-- A brand gets a PALETTE, not a colour.
--
-- Rashid, 2026-08-25: "we currently let admin choose only one color but I need
-- full customization here for brands hub such that admin can decide a
-- particular area such as hero section menu items all pages in menu section
-- each with 3 to 4 colors (then we will derive gradient fror that) ... The
-- reason is that some brands have multo color themes so our app should be
-- designed accoridnlgy".
--
-- WHAT THE PREVIOUS MIGRATION GOT WRONG. `20260824170709_brand_world_look.sql`
-- argued for one colour on safety grounds: a colour chosen in an admin picker
-- lives in a ROW, `pnpm check:contrast` guards `tokens.css` and cannot see a
-- row, so handing an admin five pickers would hand them five ways to ship a hub
-- creators cannot read.
--
-- The safety argument was right. The conclusion drawn from it was not. What one
-- colour was protecting was READABILITY, and readability is not a property of
-- how MANY colours somebody picks. It is a property of which colours are used
-- as TEXT, and an admin was never picking those.
--
-- So the rule sharpens instead of the freedom shrinking:
--
--   THE ADMIN PICKS FILLS. THE PRODUCT PICKS INKS.
--
-- `src/lib/brand-theme.ts` holds every picked colour inside a lightness band
-- its area can support, keeping the hue and the saturation exactly, and then
-- chooses every text colour by MEASURING contrast against every fill it will
-- cross, including the middle stops of a four colour gradient, which is exactly
-- where a heading quietly stops being readable.
-- `scripts/check-brand-theme.mjs` throws 1200 deterministic random multi-colour
-- themes at that inside `pnpm build`, and was run by hand at 40,000 before this
-- migration was written. It found two real defects on the first run, one of
-- them in the ORIGINAL one-colour code: the accent gradient ran from the accent
-- to the far end of the hero, so half of every gradient button in dark mode was
-- far darker than the colour its label had been chosen against.
--
-- WHY JSONB AND NOT SIXTEEN COLUMNS. The shape is a list per area and the areas
-- will grow. Sixteen nullable text columns would be a migration every time
-- somebody wants a fourth stop, and would still not express "these three are
-- ordered". The trade is that a jsonb column can hold anything, so the shape is
-- checked below rather than hoped for.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Is this shape a theme we are willing to store?
-- ----------------------------------------------------------------------------
/*
 * The identical rule is written three more times: in Zod in the browser, in Zod
 * in the Edge Function, and in `readBrandThemeConfig` in the code that paints
 * with it. This is the copy that is TRUE, because it is the only one a
 * hand-written `update` cannot go around.
 *
 * IMMUTABLE, because a check constraint may only call functions that are. It
 * reads nothing but its argument, so that is honest rather than convenient.
 */
create or replace function public.brand_theme_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key        text;
  v_area       jsonb;
  v_area_key   text;
  v_stop       jsonb;
  v_count      int;
  v_max        int;
begin
  if p is null then
    return true;
  end if;

  if jsonb_typeof(p) <> 'object' then
    return false;
  end if;

  /*
   * ONLY THE KEYS WE KNOW. An unrecognised key is a typo, a half-finished
   * feature or another product's data, and in every one of those cases refusing
   * it is better than storing something the renderer will silently ignore.
   */
  for v_key in select jsonb_object_keys(p) loop
    if v_key not in ('v', 'hero', 'rail', 'page', 'accent') then
      return false;
    end if;
  end loop;

  if (p ? 'v') and coalesce(p ->> 'v', '') <> '1' then
    return false;
  end if;

  foreach v_area_key in array array['hero', 'rail', 'page', 'accent'] loop
    continue when not (p ? v_area_key);

    v_area := p -> v_area_key;
    if jsonb_typeof(v_area) <> 'object' then
      return false;
    end if;

    -- The hero is the only area with a direction, and pages and buttons have no
    -- pale variant: they follow the light or dark theme the creator chose.
    for v_key in select jsonb_object_keys(v_area) loop
      if v_key not in ('stops', 'angle', 'tone') then
        return false;
      end if;
      if v_key = 'angle' and v_area_key <> 'hero' then
        return false;
      end if;
      if v_key = 'tone' and v_area_key not in ('hero', 'rail') then
        return false;
      end if;
    end loop;

    if jsonb_typeof(v_area -> 'stops') <> 'array' then
      return false;
    end if;

    v_max := case when v_area_key = 'hero' then 4 else 3 end;
    v_count := jsonb_array_length(v_area -> 'stops');
    if v_count < 1 or v_count > v_max then
      return false;
    end if;

    for v_stop in select * from jsonb_array_elements(v_area -> 'stops') loop
      if jsonb_typeof(v_stop) <> 'string' then
        return false;
      end if;
      -- Six digit hex, lower case, exactly as the browser canonicalises it.
      if (v_stop #>> '{}') !~ '^#[0-9a-f]{6}$' then
        return false;
      end if;
    end loop;

    if (v_area ? 'angle') then
      if jsonb_typeof(v_area -> 'angle') <> 'number' then
        return false;
      end if;
      if (v_area ->> 'angle')::numeric < 0 or (v_area ->> 'angle')::numeric > 360 then
        return false;
      end if;
    end if;

    if (v_area ? 'tone') and (v_area ->> 'tone') not in ('auto', 'light') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.brand_theme_ok(jsonb) is
  'Shape guard for brands.theme. Fills only: an area is an ordered list of one to four six-digit hex colours, plus an angle on the hero and a tone on the hero and the menu. No text colour is storable, because every text colour is computed by measuring contrast in src/lib/brand-theme.ts.';

-- ----------------------------------------------------------------------------
-- The column.
-- ----------------------------------------------------------------------------
alter table public.brands
  add column if not exists theme jsonb;

/*
 * Added separately and by name so it can be dropped and rewritten later without
 * touching the column. `not valid` is deliberately NOT used: there are no rows
 * with a theme yet, so there is nothing to grandfather in, and a validated
 * constraint is the one that is true of everything rather than of everything
 * from now on.
 */
alter table public.brands
  drop constraint if exists brands_theme_shape;

alter table public.brands
  add constraint brands_theme_shape check (public.brand_theme_ok(theme));

comment on column public.brands.theme is
  'What an admin customised beyond brand_color: up to four colours each for the hero, the menu, the pages and the buttons. Null means every area is derived from brand_color, which is what every brand looked like before 2026-08-25. Only FILLS live here; text colours are computed against them.';

-- ----------------------------------------------------------------------------
-- The admin write path.
-- ----------------------------------------------------------------------------
/*
 * DROPPED FIRST, AND BY ITS FULL ARGUMENT LIST. `create or replace function`
 * with a changed argument list creates a SECOND OVERLOAD rather than replacing
 * anything, and PostgREST binds an RPC by the argument NAMES a request sends.
 * The old seven-argument body would stay alive, keep answering every
 * `brand.about` call that did not mention a theme, and silently drop the new
 * field. This repo has already lost a day to exactly that, twice, which is why
 * this paragraph is in every migration that touches a function signature.
 */
drop function if exists public.save_brand_about(uuid, uuid, text, text, text, text, text);

create or replace function public.save_brand_about(
  p_actor_id uuid,
  p_brand_id uuid,
  p_logo_url text default null,
  p_tagline text default null,
  p_description text default null,
  p_brand_color text default null,
  p_hero_url text default null,
  p_theme jsonb default null
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

  /*
   * CHECKED HERE TOO, not only in the column and not only in the browser.
   * The constraint would refuse a bad value with a constraint error, which
   * reaches an admin as a wall of Postgres. This says what is wrong instead.
   */
  if v_color is not null and v_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'a brand colour must be a six digit hex, like #173d36'
      using errcode = '22023';
  end if;

  -- An empty object is how a form says "I customised nothing", and storing it
  -- would leave a row that is neither null nor a theme for every reader to
  -- special-case forever.
  if v_theme is not null and (jsonb_typeof(v_theme) <> 'object' or v_theme = '{}'::jsonb) then
    v_theme := null;
  end if;

  if not public.brand_theme_ok(v_theme) then
    raise exception 'that brand theme is not a shape we can store: each area needs one to four colours like #173d36'
      using errcode = '22023';
  end if;

  update public.brands
  set logo_url    = nullif(trim(coalesce(p_logo_url, '')), ''),
      tagline     = nullif(trim(coalesce(p_tagline, '')), ''),
      description = nullif(trim(coalesce(p_description, '')), ''),
      brand_color = v_color,
      hero_url    = nullif(trim(coalesce(p_hero_url, '')), ''),
      theme       = v_theme
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
      -- Worth auditing in full: between them these decide what every creator at
      -- this brand looks at, and "the hub went purple" needs an answer.
      'brand_color', v_brand.brand_color,
      'theme', v_brand.theme,
      'has_hero', v_brand.hero_url is not null
    ))
  );

  return to_jsonb(v_brand);
end;
$$;

revoke all on function public.save_brand_about(uuid, uuid, text, text, text, text, text, jsonb)
  from anon, authenticated, public;
grant execute on function public.save_brand_about(uuid, uuid, text, text, text, text, text, jsonb)
  to service_role;
