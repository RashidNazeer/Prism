-- ============================================================================
-- A CLIENT LINK CAN BE READ BACK, AND HAS A PAGE OF ITS OWN.
--
-- Rashid, 2026-09-18, looking at the list: "no option to copy again and we
-- should be able to open it and see details please make it properly".
--
-- THIS REVERSES THE 2026-09-17 DECISION TO STORE ONLY A FINGERPRINT, and the
-- reasoning it reverses was thin. Hashing protected against ONE case: this
-- table leaking on its own, without the rest of the database. But the thing a
-- link opens — every creator, video, budget and figure behind it — lives in the
-- same database, so an attacker holding this table already holds the data the
-- link would have shown them. The cost was real and daily: an admin who closed
-- the panel could never send that client their link again, and had to mint a
-- replacement and explain why.
--
-- What actually protects a link is unchanged, and none of it is hashing:
--   - RLS is on with NO policy, and the grants name only `service_role`, so
--     neither `anon` nor `authenticated` can read one row through the API
--   - the three functions are `security definer` and admit ops and admin only
--   - every link expires, can be revoked, and records every view
--
-- `token_hash` stays and remains the lookup key: it is indexed, unique, and the
-- Edge Function already hashes what a visitor presents. Links minted before
-- today have no stored token and cannot get one — the screen offers to replace
-- them instead.
-- ============================================================================

alter table public.collab_share_links
  add column if not exists token text;

comment on column public.collab_share_links.token is
  'The link itself, so an admin can copy it again. Null for links minted before 2026-09-18, which can only be replaced. Unreadable through the API: see the table''s grants.';

-- ================================================================ minting ==
drop function if exists public.collab_share_create(text, text[], integer, text[], boolean, boolean, boolean, boolean);

create or replace function public.collab_share_create(
  p_label           text,
  p_brands          text[],
  p_days            integer default 90,
  p_months          text[] default '{}',
  p_show_kpis       boolean default true,
  p_show_top_videos boolean default true,
  p_show_creators   boolean default true,
  p_show_videos     boolean default true
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id    uuid;
  v_exp   timestamptz;
  v_bad   text;
begin
  if not (public.is_service_role() or public.jwt_role()::text in ('ops', 'admin')) then
    raise exception 'Only an admin can create a client link' using errcode = '42501';
  end if;
  if p_brands is null or cardinality(p_brands) = 0 then
    raise exception 'Pick at least one brand' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'A link lasts between 1 and 365 days' using errcode = '22023';
  end if;
  select m into v_bad from unnest(coalesce(p_months, '{}')) m where m !~ '^\d{4}-\d{2}$' limit 1;
  if v_bad is not null then
    raise exception 'A month must look like 2026-09, not %', v_bad using errcode = '22023';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  v_exp := now() + make_interval(days => p_days);

  insert into public.collab_share_links (
    label, token, token_hash, token_hint, brands, months,
    show_kpis, show_top_videos, show_creators, show_videos,
    expires_at, created_by
  ) values (
    btrim(p_label),
    v_token,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    left(v_token, 6),
    p_brands,
    coalesce(p_months, '{}'),
    coalesce(p_show_kpis, true), coalesce(p_show_top_videos, true),
    coalesce(p_show_creators, true), coalesce(p_show_videos, true),
    v_exp, auth.uid()
  )
  returning public.collab_share_links.id into v_id;

  return query select v_id, v_token, v_exp;
end;
$$;

comment on function public.collab_share_create(text, text[], integer, text[], boolean, boolean, boolean, boolean) is
  'Mint a client share link. ops and admin only. The link is stored so it can be copied again; the hash stays as the lookup key.';

-- ================================================================ listing ==
drop function if exists public.collab_share_list();

create or replace function public.collab_share_list()
returns table (
  id uuid, label text, token text, token_hint text, brands text[], months text[],
  show_kpis boolean, show_top_videos boolean, show_creators boolean, show_videos boolean,
  expires_at timestamptz, revoked_at timestamptz, created_at timestamptz,
  last_viewed_at timestamptz, view_count integer, is_live boolean
)
language sql
security definer
set search_path = ''
as $$
  select l.id, l.label, l.token, l.token_hint, l.brands, l.months,
         l.show_kpis, l.show_top_videos, l.show_creators, l.show_videos,
         l.expires_at, l.revoked_at, l.created_at,
         l.last_viewed_at, l.view_count,
         (l.revoked_at is null and l.expires_at > now()) as is_live
  from public.collab_share_links l
  where public.is_service_role() or public.jwt_role()::text in ('ops', 'admin')
  order by l.created_at desc;
$$;

comment on function public.collab_share_list() is
  'Client share links for the admin screen, newest first, including the link itself. ops and admin only; anyone else gets no rows.';

-- ================================================================== opens ==
-- When a link was opened, newest first. Enough to see a link spreading; never
-- an address, because only a salted hash of one is kept.
create or replace function public.collab_share_opens(p_id uuid, p_limit integer default 50)
returns table (viewed_at timestamptz, visitor text, user_agent text)
language sql
security definer
set search_path = ''
as $$
  select v.viewed_at,
         left(coalesce(v.ip_hash, ''), 8) as visitor,
         v.user_agent
  from public.collab_share_views v
  where (public.is_service_role() or public.jwt_role()::text in ('ops', 'admin'))
    and v.link_id = p_id
  order by v.viewed_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.collab_share_opens(uuid, integer) is
  'When a client link was opened. The visitor is the first characters of a salted hash: enough to tell one reader from two, never an address.';

-- ================================================================ replace ==
-- A new link for the same client, in place: the old address stops working the
-- instant this returns, and the settings, the history and the view count stay.
create or replace function public.collab_share_replace(p_id uuid)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_exp   timestamptz;
begin
  if not (public.is_service_role() or public.jwt_role()::text in ('ops', 'admin')) then
    raise exception 'Only an admin can replace a client link' using errcode = '42501';
  end if;
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');

  update public.collab_share_links l
     set token = v_token,
         token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         token_hint = left(v_token, 6),
         revoked_at = null,
         expires_at = greatest(l.expires_at, now() + interval '30 days')
   where l.id = p_id
  returning l.expires_at into v_exp;

  if v_exp is null then
    raise exception 'No such link' using errcode = '22023';
  end if;
  return query select p_id, v_token, v_exp;
end;
$$;

comment on function public.collab_share_replace(uuid) is
  'Give a link a new address. The old one dies immediately; the brands, months, sections and view history stay. Used for links minted before the link itself was stored, and after one is shared by mistake.';

revoke all on function public.collab_share_create(text, text[], integer, text[], boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.collab_share_list() from public, anon;
revoke all on function public.collab_share_opens(uuid, integer) from public, anon;
revoke all on function public.collab_share_replace(uuid) from public, anon;
grant execute on function public.collab_share_create(text, text[], integer, text[], boolean, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.collab_share_list() to authenticated, service_role;
grant execute on function public.collab_share_opens(uuid, integer) to authenticated, service_role;
grant execute on function public.collab_share_replace(uuid) to authenticated, service_role;
