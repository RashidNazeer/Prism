-- ============================================================================
-- CLIENT SHARING: a read-only link that shows one or more brands' Paid Collabs
-- work to somebody with no login at all.
--
-- Rashid, 2026-09-17: "there should be a client sharing section which asad and
-- superadmin maybe boss can manage where they can create a link per brand or
-- maybe multiple brands in one link which they can share with clients. Clients
-- would need no login at all ... Only read access and only the brand they have
-- been shared."
--
-- THE LINK IS A PASSWORD, AND IS TREATED LIKE ONE.
--   - Only its SHA-256 fingerprint is stored. A leak of this table hands
--     nobody a working link, exactly as a leak of `profiles` hands nobody a
--     password. The link itself is returned once, at creation, and never
--     again — there is no "show me the link" later, by design.
--   - It expires. A date is required, not optional, so no link lives forever
--     by accident.
--   - It can be revoked, which is instant and permanent.
--   - Every view is recorded. A link that spreads is visible as a view count
--     climbing, which is the only warning a shared secret ever gives.
--
-- THESE TABLES ARE NOT READABLE BY ANYBODY THROUGH THE API. RLS is on with no
-- policy at all, and the grants name only `service_role`. `anon` and
-- `authenticated` are revoked explicitly. The only doors are:
--   - the three functions below, which admit `ops` and `admin` only, and
--   - the `collab-share` Edge Function, which runs as the service role, checks
--     the fingerprint itself, and returns a PROJECTED payload.
-- A client's browser never speaks to Postgres. It cannot: `anon` has no grant
-- on `wurxbase` either ("anon gets nothing", 20260828141439).
--
-- WHAT A CLIENT MAY SEE is decided in the Edge Function, not here, because it
-- is a projection rather than a permission: brand budget and what is left,
-- delivery, views, GMV, items sold, the videos and their spark codes, each
-- creator's name, TikTok and deal. NEVER ad spend, ROI, allocated, paid, cost
-- per video, payment status, phone numbers, emails, payment details or
-- internal comments.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- the link --
create table public.collab_share_links (
  id              uuid primary key default gen_random_uuid(),
  -- Who it is for, in the admin's own words: "Penetrex — Sarah at Penetrex".
  label           text not null check (length(btrim(label)) between 1 and 80),
  -- SHA-256 of the link, hex. Never the link itself.
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- The first few characters, so a person can tell two links apart in a list
  -- without the list being able to reconstruct either.
  token_hint      text not null check (length(token_hint) between 4 and 8),
  -- One link may carry several brands. Names as Paid Collabs stores them.
  brands          text[] not null check (cardinality(brands) between 1 and 50),
  -- Which parts of the brand page this client gets. Off means ABSENT from the
  -- payload, not hidden in the page.
  show_kpis       boolean not null default true,
  show_top_videos boolean not null default true,
  show_creators   boolean not null default true,
  show_videos     boolean not null default true,
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  last_viewed_at  timestamptz,
  view_count      integer not null default 0,
  constraint collab_share_links_expiry_ck check (expires_at > created_at)
);

comment on table public.collab_share_links is
  'Read-only client links into Paid Collabs. Only the SHA-256 of each link is stored; the link itself is shown once at creation. Not readable through the API by anyone: see collab_share_create / _list / _revoke and the collab-share function.';

create index collab_share_links_live_idx
  on public.collab_share_links (expires_at) where revoked_at is null;

-- --------------------------------------------------------------- the views --
-- Who opened it, and when. The address is hashed: it is enough to tell "the
-- same visitor again" from "a second person", which is the question a spreading
-- link raises, without keeping anybody's address.
create table public.collab_share_views (
  id         bigserial primary key,
  link_id    uuid not null references public.collab_share_links (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  ip_hash    text,
  user_agent text
);

create index collab_share_views_link_idx
  on public.collab_share_views (link_id, viewed_at desc);

comment on table public.collab_share_views is
  'One row per client page view of a share link. The visitor address is stored only as a salted hash.';

-- -------------------------------------------------------- deny by default --
alter table public.collab_share_links enable row level security;
alter table public.collab_share_views enable row level security;
-- No policies on purpose. With RLS on and no policy, every request through
-- PostgREST reads nothing and writes nothing, whatever role it carries.

revoke all on table public.collab_share_links from anon, authenticated;
revoke all on table public.collab_share_views from anon, authenticated;
grant all privileges on table public.collab_share_links to service_role;
grant all privileges on table public.collab_share_views to service_role;
grant usage, select on sequence public.collab_share_views_id_seq to service_role;

-- ================================================================ minting ==
-- Returns the link ONCE. Nothing stores it, so it cannot be shown again; a
-- client who loses it gets a new one, which is also how a leak is contained.
create or replace function public.collab_share_create(
  p_label           text,
  p_brands          text[],
  p_days            integer default 90,
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
begin
  -- ops and admin only. NOT ads_manager, and not the read-only collabs roles:
  -- `is_staff()` admits ads_manager since 2026-09-15, so it is deliberately not
  -- used here. Handing out a brand's data is an owner's decision.
  if not (public.is_service_role() or public.jwt_role()::text in ('ops', 'admin')) then
    raise exception 'Only an admin can create a client link' using errcode = '42501';
  end if;
  if p_brands is null or cardinality(p_brands) = 0 then
    raise exception 'Pick at least one brand' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'A link lasts between 1 and 365 days' using errcode = '22023';
  end if;

  -- 24 random bytes, url-safe, unpadded: 32 characters, 192 bits. Guessing one
  -- is not a thing that happens.
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  v_exp := now() + make_interval(days => p_days);

  insert into public.collab_share_links (
    label, token_hash, token_hint, brands,
    show_kpis, show_top_videos, show_creators, show_videos,
    expires_at, created_by
  ) values (
    btrim(p_label),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    left(v_token, 6),
    p_brands,
    coalesce(p_show_kpis, true), coalesce(p_show_top_videos, true),
    coalesce(p_show_creators, true), coalesce(p_show_videos, true),
    v_exp, auth.uid()
  )
  returning public.collab_share_links.id into v_id;

  return query select v_id, v_token, v_exp;
end;
$$;

comment on function public.collab_share_create(text, text[], integer, boolean, boolean, boolean, boolean) is
  'Mint a client share link. Returns the link once; only its hash is stored. ops and admin only.';

-- ================================================================ listing ==
-- Everything about a link EXCEPT anything that could rebuild it.
create or replace function public.collab_share_list()
returns table (
  id uuid, label text, token_hint text, brands text[],
  show_kpis boolean, show_top_videos boolean, show_creators boolean, show_videos boolean,
  expires_at timestamptz, revoked_at timestamptz, created_at timestamptz,
  last_viewed_at timestamptz, view_count integer, is_live boolean
)
language sql
security definer
set search_path = ''
as $$
  select l.id, l.label, l.token_hint, l.brands,
         l.show_kpis, l.show_top_videos, l.show_creators, l.show_videos,
         l.expires_at, l.revoked_at, l.created_at,
         l.last_viewed_at, l.view_count,
         (l.revoked_at is null and l.expires_at > now()) as is_live
  from public.collab_share_links l
  where public.is_service_role() or public.jwt_role()::text in ('ops', 'admin')
  order by l.created_at desc;
$$;

comment on function public.collab_share_list() is
  'Client share links for the admin screen. Never returns anything a link could be rebuilt from. ops and admin only; anyone else gets no rows.';

-- =============================================================== revoking ==
create or replace function public.collab_share_revoke(p_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_when timestamptz;
begin
  if not (public.is_service_role() or public.jwt_role()::text in ('ops', 'admin')) then
    raise exception 'Only an admin can revoke a client link' using errcode = '42501';
  end if;
  update public.collab_share_links
     set revoked_at = coalesce(revoked_at, now())
   where id = p_id
  returning revoked_at into v_when;
  if v_when is null then
    raise exception 'No such link' using errcode = '22023';
  end if;
  return v_when;
end;
$$;

comment on function public.collab_share_revoke(uuid) is
  'Switch a client link off for good. Instant, and there is no un-revoke: mint a new link instead.';

revoke all on function public.collab_share_create(text, text[], integer, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.collab_share_list() from public, anon;
revoke all on function public.collab_share_revoke(uuid) from public, anon;
grant execute on function public.collab_share_create(text, text[], integer, boolean, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.collab_share_list() to authenticated, service_role;
grant execute on function public.collab_share_revoke(uuid) to authenticated, service_role;
