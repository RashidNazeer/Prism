-- ============================================================================
-- A PICTURE FOR A BRAND THAT EUKA HAS NEVER HEARD OF.
--
-- Rashid, 2026-09-23, after Irwin Naturals started reading from Reacher: "can
-- we have a photo (dp) of the brand as well like we have of other brands".
--
-- Every brand face in Paid Collabs comes from EUKA today: `BrandFace` finds the
-- Euka store for the brand and asks for its photo. Irwin Naturals has no Euka
-- store at all, so it falls back to a gradient letter — and so would any future
-- brand that sells somewhere Euka does not reach.
--
-- This is the photo of last resort: one row per brand NAME, holding an object
-- in the existing public `brand-assets` bucket. The screen prefers Euka's
-- photo, exactly as it does now, and only looks here when there is none.
--
-- NAME, NOT ID, and that is deliberate. Paid Collabs brands are free text on
-- `wurxbase.creators.brand`; most of them have no row in `public.brands` at all
-- (that table is the Brand Hub side, which only Penetrex uses). The name is the
-- only key both sides share.
-- ============================================================================

create table if not exists public.collab_brand_photos (
  -- Trimmed, as it is written on the Paid Collabs rows. Compared case
  -- insensitively by the reader below, so "Irwin naturals" finds it too.
  brand      text primary key check (length(trim(brand)) between 1 and 120),

  -- Object name inside `brand-assets`, which is a PUBLIC bucket: the URL is
  -- built from this and needs no signing. A brand logo is a public thing and
  -- is already creator-facing elsewhere in the product.
  path       text not null check (length(trim(path)) between 1 and 300),

  -- Where it came from: 'unavatar' (the brand's own TikTok picture), 'upload'
  -- (a file somebody gave us) or 'url'. Kept so a wrong picture can be traced
  -- to how it arrived rather than argued about.
  source     text not null default 'upload',

  -- The TikTok handle it was fetched by, when it was fetched by one. A rename
  -- then shows up as a mismatch instead of a silently stale face.
  handle     text,
  bytes      integer check (bytes is null or bytes >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.collab_brand_photos is
  'A brand picture for Paid Collabs brands that EUKA has no store for (Irwin Naturals is the first). The screen prefers the EUKA photo and reads this only when there is none. `path` is an object in the public brand-assets bucket.';

-- ------------------------------------------------------------ row security --
alter table public.collab_brand_photos enable row level security;

-- Whoever can see the Paid Collabs screens can see the brand faces on them.
drop policy if exists collab_brand_photos_select on public.collab_brand_photos;
create policy collab_brand_photos_select on public.collab_brand_photos
  for select to authenticated
  using (public.is_collabs_viewer());

-- Nobody writes with a user token. The picture is put there by a staff tool
-- holding the service key, which is not subject to these policies — the same
-- shape as creator_avatars.

-- ------------------------------------------------------------------ grants --
-- Explicit, per table: "Automatically expose new tables" is OFF, and that also
-- switches off the default grants to service_role.
grant select on table public.collab_brand_photos to authenticated;
grant all privileges on table public.collab_brand_photos to service_role;
