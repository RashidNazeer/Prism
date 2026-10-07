-- ============================================================================
-- WHICH MONTHS A CLIENT LINK MAY SHOW.
--
-- Rashid, 2026-09-17, on the first version: "Be careful here we need to have
-- custom control we can set that which data should be shared with them and
-- which not like which month data".
--
-- An EMPTY list means every month, which is what the links minted yesterday
-- carry and what most links will want. A non-empty list is a whitelist: the
-- client's month switcher offers those months and nothing else, and asking for
-- an unlisted month serves an allowed one instead of the one asked for. The
-- rule lives in the Edge Function, because that is where the projection is
-- built; this column is the instruction it reads.
--
-- The months are 'YYYY-MM'. They are checked when a link is minted rather than
-- by a constraint, so the error can say which one is wrong.
-- ============================================================================

alter table public.collab_share_links
  add column if not exists months text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'collab_share_links_months_ck') then
    alter table public.collab_share_links
      add constraint collab_share_links_months_ck check (cardinality(months) <= 60);
  end if;
end;
$$;

comment on column public.collab_share_links.months is
  'Whitelist of YYYY-MM months this link may show. Empty means every month.';

-- The signature changes, so the old one goes rather than lingering as an
-- overload somebody could call by accident and get an all-months link from.
drop function if exists public.collab_share_create(text, text[], integer, boolean, boolean, boolean, boolean);

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
  -- ops and admin only. NOT ads_manager, though is_staff() admits it: handing
  -- a brand's numbers to an outsider is an owner's decision.
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
    label, token_hash, token_hint, brands, months,
    show_kpis, show_top_videos, show_creators, show_videos,
    expires_at, created_by
  ) values (
    btrim(p_label),
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
  'Mint a client share link. Returns the link once; only its hash is stored. Empty p_months means every month. ops and admin only.';

-- The list gains the months, so the admin screen can show what each link opens.
-- DROPPED FIRST: `create or replace` cannot change a function's OUT columns
-- ("cannot change return type of existing function"), and adding a column to a
-- `returns table` is exactly that.
drop function if exists public.collab_share_list();

create or replace function public.collab_share_list()
returns table (
  id uuid, label text, token_hint text, brands text[], months text[],
  show_kpis boolean, show_top_videos boolean, show_creators boolean, show_videos boolean,
  expires_at timestamptz, revoked_at timestamptz, created_at timestamptz,
  last_viewed_at timestamptz, view_count integer, is_live boolean
)
language sql
security definer
set search_path = ''
as $$
  select l.id, l.label, l.token_hint, l.brands, l.months,
         l.show_kpis, l.show_top_videos, l.show_creators, l.show_videos,
         l.expires_at, l.revoked_at, l.created_at,
         l.last_viewed_at, l.view_count,
         (l.revoked_at is null and l.expires_at > now()) as is_live
  from public.collab_share_links l
  where public.is_service_role() or public.jwt_role()::text in ('ops', 'admin')
  order by l.created_at desc;
$$;

revoke all on function public.collab_share_create(text, text[], integer, text[], boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.collab_share_create(text, text[], integer, text[], boolean, boolean, boolean, boolean) to authenticated, service_role;
revoke all on function public.collab_share_list() from public, anon;
grant execute on function public.collab_share_list() to authenticated, service_role;
