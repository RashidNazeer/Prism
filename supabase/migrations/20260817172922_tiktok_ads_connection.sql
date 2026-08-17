-- ============================================================================
-- TikTok ads: the connection, the accounts it can see, and the brand mapping.
--
-- WurxMediaHub runs GMV Max ads on creators' videos. This is the plumbing that
-- lets an ADMIN authorise our TikTok Business app once, after which the server
-- can read the spend, revenue and orders behind those videos. Creators never
-- see any of this; they only ever read numbers, and they are not told a TikTok
-- app exists.
--
-- THE ACCESS TOKEN IS THE WHOLE RISK. It reads a client's live ad spend. So it
-- lives in a table with RLS enabled and DELIBERATELY ZERO POLICIES, with the
-- grants revoked from anon and authenticated. Deny-by-default plus no policy
-- means no row is reachable with a user token, and that is true for an admin
-- too. Only the service role, inside an edge function, can read it.
--
-- Non-secret metadata (advertiser name, currency, timezone, which brand it maps
-- to) lives in SEPARATE tables that staff can read, so the admin screen can be
-- built without ever putting the token near a browser.
-- ============================================================================

-- --------------------------------------------------------------- the token --

create table public.tiktok_connections (
  id uuid primary key default gen_random_uuid(),

  -- The long-lived access token. TikTok's ads API issues NO refresh token, so
  -- this is the only credential we will ever hold; if it is revoked at their
  -- end the connection simply stops working and has to be re-authorised.
  access_token text not null,

  -- What the token is allowed to do, as TikTok reported it at exchange time.
  scope text,

  -- The advertiser ids TikTok named in the exchange response. Kept as returned,
  -- as the record of what was actually granted, separate from what we later
  -- discovered by calling their API.
  granted_advertiser_ids text[] not null default '{}',

  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz not null default now(),

  -- Proof of life. There is no refresh token and no expiry we can read, so a
  -- revoked connection would otherwise go quiet and every creator's numbers
  -- would silently freeze at their last value. The screen shows this.
  last_verified_at timestamptz,
  last_error text,

  -- Soft revoke: the row stays so the audit trail still resolves, but the token
  -- is overwritten with the empty string at the same moment.
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null
);

comment on table public.tiktok_connections is
  'TikTok Business API access tokens. RLS on with NO policies on purpose: unreadable with any user token, including an admin''s. Service role only.';

create index tiktok_connections_live_idx
  on public.tiktok_connections (connected_at desc)
  where revoked_at is null;

-- --------------------------------------------------- the single-use nonce ---

create table public.tiktok_oauth_states (
  -- The nonce itself is the key. Generated with crypto random in the edge
  -- function, never derived from anything guessable.
  state text primary key check (length(state) between 32 and 128),

  -- Who asked to connect. The callback is a PUBLIC route, because the person
  -- authorising may land back without a hub session, so this row is the only
  -- thing that says the flow was started by a real admin, and it is what the
  -- connection is attributed to.
  started_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),

  -- Short, because an OAuth round trip is a matter of minutes. An old nonce is
  -- refused rather than honoured.
  expires_at timestamptz not null,

  -- Burned on use. A second callback carrying the same state is refused, which
  -- is what stops a captured redirect being replayed.
  used_at timestamptz
);

comment on table public.tiktok_oauth_states is
  'Single-use OAuth nonces. RLS on with NO policies: only the edge function can mint or burn one. This is what makes the public callback route safe.';

create index tiktok_oauth_states_expiry_idx on public.tiktok_oauth_states (expires_at);

-- ------------------------------------------------- the accounts we can see --

create table public.tiktok_ad_accounts (
  -- TikTok's own id, a big numeric string rather than a uuid. Used as the key
  -- because it is the id every one of their endpoints speaks in, and inventing
  -- a second identity for the same thing only creates a mapping to get wrong.
  advertiser_id text primary key check (advertiser_id ~ '^[0-9]{6,32}$'),

  connection_id uuid not null
    references public.tiktok_connections (id) on delete cascade,

  name text,

  -- The account reports in its OWN currency and timezone, not ours. Both are
  -- displayed beside every figure we ever show, because a number whose units
  -- are assumed is a number that will eventually be wrong.
  currency text,
  timezone text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.tiktok_ad_accounts is
  'Non-secret metadata about the ad accounts a connection can reach. Staff readable; written only by the edge function.';

create index tiktok_ad_accounts_connection_idx
  on public.tiktok_ad_accounts (connection_id);

-- ------------------------------------------ the stores, and the mapping ----

create table public.tiktok_stores (
  store_id text primary key check (store_id ~ '^[0-9]{6,32}$'),

  advertiser_id text not null
    references public.tiktok_ad_accounts (advertiser_id) on delete cascade,

  name text,

  -- MANDATORY on every GMV Max report call. Discovered from
  -- /gmv_max/store/list/ and kept here so reporting never has to go and ask
  -- again mid-request.
  store_authorized_bc_id text,

  -- THE MAPPING, and it is deliberately nullable.
  --
  -- Rashid, 2026-08-17: "some brands are not yet added so admin can add later
  -- and then map". So an unmapped store is a NORMAL state, not a broken one:
  -- the connection is made once and the mapping is maintained afterwards from
  -- the settings screen, as brands arrive.
  --
  -- `on delete set null` rather than cascade: deleting a brand must never
  -- silently delete our record of a TikTok store, it just leaves it unmapped
  -- and visible again on the screen.
  brand_id uuid references public.brands (id) on delete set null,
  mapped_by uuid references public.profiles (id) on delete set null,
  mapped_at timestamptz,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.tiktok_stores is
  'TikTok Shop stores under each ad account, and which Wurx brand each one is. brand_id is nullable on purpose: mapping is maintained over time, not at connect time.';

create index tiktok_stores_advertiser_idx on public.tiktok_stores (advertiser_id);

-- A brand can have more than one store, but a store is exactly one brand, and
-- the index makes "which stores are this brand's" a lookup rather than a scan.
create index tiktok_stores_brand_idx
  on public.tiktok_stores (brand_id)
  where brand_id is not null;

-- ============================================================================
-- Row security. Deny by default on all four, then open the two safe ones for
-- reading only.
-- ============================================================================

alter table public.tiktok_connections  enable row level security;
alter table public.tiktok_oauth_states enable row level security;
alter table public.tiktok_ad_accounts  enable row level security;
alter table public.tiktok_stores       enable row level security;

/*
 * NO POLICIES AT ALL on the two secret tables, and that is the point rather
 * than an omission. RLS on with no policy denies every row to every user token.
 * Do not "fix" this by adding an admin read policy: an admin does not need to
 * see an access token to manage a connection, and a token an admin can read is
 * a token that can leak from a browser.
 */

-- Staff read the account list, so the settings screen can be built.
create policy "tiktok_ad_accounts_select_staff"
  on public.tiktok_ad_accounts
  for select
  to authenticated
  using (public.is_staff());

-- Staff read the stores and their mapping, for the same reason.
create policy "tiktok_stores_select_staff"
  on public.tiktok_stores
  for select
  to authenticated
  using (public.is_staff());

/*
 * READ ONLY, on purpose, both of them. There is no insert, update or delete
 * policy: mapping a store to a brand decides whose ad spend a creator is shown,
 * so it goes through the edge function which re-checks the caller's role
 * server-side and writes an audit row in the same breath. Hiding a button is
 * never the boundary here either.
 */

-- ============================================================================
-- Grants. `Automatically expose new tables` is OFF on both projects, which also
-- switches off the default grants to service_role, so every table needs its
-- service_role grant spelled out or the edge functions silently see nothing.
-- ============================================================================

revoke all on table public.tiktok_connections  from anon, authenticated;
revoke all on table public.tiktok_oauth_states from anon, authenticated;
revoke all on table public.tiktok_ad_accounts  from anon, authenticated;
revoke all on table public.tiktok_stores       from anon, authenticated;

grant all privileges on table public.tiktok_connections  to service_role;
grant all privileges on table public.tiktok_oauth_states to service_role;
grant all privileges on table public.tiktok_ad_accounts  to service_role;
grant all privileges on table public.tiktok_stores       to service_role;

-- The two readable tables need SELECT for the policies above to have anything
-- to permit. A policy without a grant is a locked door in a wall with no door.
grant select on table public.tiktok_ad_accounts to authenticated;
grant select on table public.tiktok_stores      to authenticated;

-- ============================================================================
-- One view for the settings screen, so it makes a single request rather than
-- three and a join in the browser.
--
-- `security_invoker = true` so the view is read AS the caller and the policies
-- above still apply. Without it a view is a hole straight through RLS.
-- ============================================================================

create view public.tiktok_account_map
with (security_invoker = true) as
  select
    s.store_id,
    s.name                    as store_name,
    s.store_authorized_bc_id,
    s.brand_id,
    b.name                    as brand_name,
    s.mapped_at,
    a.advertiser_id,
    a.name                    as advertiser_name,
    a.currency,
    a.timezone,
    a.last_seen_at
  from public.tiktok_stores s
  join public.tiktok_ad_accounts a on a.advertiser_id = s.advertiser_id
  left join public.brands b        on b.id = s.brand_id;

comment on view public.tiktok_account_map is
  'One row per TikTok store with its ad account and the Wurx brand it maps to. security_invoker, so the staff-only policies on the underlying tables still decide who sees it.';

grant select on public.tiktok_account_map to authenticated;
grant all privileges on public.tiktok_account_map to service_role;
