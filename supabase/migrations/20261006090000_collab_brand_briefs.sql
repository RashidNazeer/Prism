-- ============================================================================
-- THE BRIEF A BRAND'S VIDEOS ARE MEANT TO FOLLOW.
--
-- Umar, 2026-10-06: "whenever I click the categorise/process button for a
-- certain brand its relevant brief and the new videos are sent to this
-- machine". Creative angle testing (Paid Collabs -> Reporting) is filed by hand
-- today: somebody watches each video and drops it into an angle. The audit
-- backend can do the watching, but only if it is told which brief the brand's
-- creators were given -- and until now nothing in this database knew that. The
-- only brief link anywhere was `contests.brief_url`, which is a contest's, not
-- a brand's.
--
-- This is that link: one row per BRIEF. Most brands have one. A brand with two
-- focus products has two, and they are usually two TABS of the same Google
-- Doc -- which is why the tab is part of the URL here (`?tab=t.xxxx`) and why
-- the product is its own column. Without the tab, Google exports every tab as
-- one text and a Lung Health video is judged against Colon Cleanse concepts.
--
-- NAME, NOT ID, for the same reason as collab_brand_photos: Paid Collabs
-- brands are free text on `wurxbase.creators.brand` and most have no row in
-- `public.brands`. The reader compares case-insensitively and trimmed.
--
-- `angles` is the list of creative concepts the brief names, in the brief's
-- order. They become the angle categories. Stored, not re-derived on every
-- run, so that a model wording a concept slightly differently one night cannot
-- open a second category beside the first.
--
-- THE ROWS BELOW ARE REAL, NOT SEED DATA. They are the briefs in Umar's sheet
-- on 2026-10-06, read from the documents themselves (every one was fetched and
-- its concept list extracted, not typed). `on conflict do nothing`, so
-- re-running this never overwrites a brief somebody has since corrected.
-- ============================================================================

create table if not exists public.collab_brand_briefs (
  id         uuid primary key default gen_random_uuid(),

  -- As it is written on the Paid Collabs rows. Compared trimmed and case
  -- insensitively, by the unique index below and by every reader.
  brand      text not null check (length(btrim(brand)) between 1 and 120),

  -- Which focus product this brief is for. Empty for a brand with one brief.
  -- It is what the audit backend hands back as the brief a video followed.
  product    text not null default '' check (length(product) <= 80),

  -- Order within the brand: the document's first tab first.
  position   smallint not null default 0 check (position between 0 and 20),

  -- A Google Doc, shared "anyone with the link can view". The backend fetches
  -- Google Docs only, and a doc that is not public comes back as a sign-in
  -- page, so anything else is refused here rather than discovered mid-job.
  brief_url  text not null
             check (brief_url ~ '^https://docs\.google\.com/document/d/[A-Za-z0-9_-]{16,}'
                    and length(brief_url) <= 400),

  -- The creative concepts the brief names, in its own order.
  angles     text[] not null default '{}',

  -- A brief that has been replaced is switched off, not deleted: the videos
  -- already filed under its angles still need to say where those came from.
  is_active  boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.collab_brand_briefs is
  'The content brief(s) a Paid Collabs brand''s creators follow: one row per brief, two for a brand with two focus products (a Google Doc tab each). Keyed by brand NAME, like collab_brand_photos. `angles` are the creative concepts the brief names and become the angle-testing categories.';

-- One brief per brand + product, whatever the capitalisation.
create unique index if not exists collab_brand_briefs_brand_product_idx
  on public.collab_brand_briefs (lower(btrim(brand)), lower(btrim(product)));

drop trigger if exists collab_brand_briefs_touch_updated_at on public.collab_brand_briefs;
create trigger collab_brand_briefs_touch_updated_at
  before update on public.collab_brand_briefs
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------ row security --
alter table public.collab_brand_briefs enable row level security;

-- Whoever can see the Paid Collabs screens can see which brief a brand is on.
drop policy if exists collab_brand_briefs_select on public.collab_brand_briefs;
create policy collab_brand_briefs_select on public.collab_brand_briefs
  for select to authenticated
  using (public.is_collabs_viewer());

-- No insert, update or delete policy. A brief is changed through an Edge
-- Function that re-checks the caller's role and holds the service key.

-- ------------------------------------------------------------------ grants --
-- Explicit, per table: "Automatically expose new tables" is OFF, and that also
-- switches off the default grants to service_role.
grant select on table public.collab_brand_briefs to authenticated;
grant all privileges on table public.collab_brand_briefs to service_role;

-- ------------------------------------------------------------- the briefs --
insert into public.collab_brand_briefs (brand, product, position, brief_url, angles)
values
  ('Bentgo', '', 0,
   'https://docs.google.com/document/d/1kCzspQD7owu-nQnJCfQTIXXXevzJY_sAD1a7_LXfdlU/edit?tab=t.0',
   array['Steady & Warm', 'Partner Approved', 'POV: Hydration for Busy Days']::text[]),
  ('Biostime Shop US', '', 0,
   'https://docs.google.com/document/d/1uWKQMZbOZW_LcEMC5cnFPMfDUTrA19A75JnqzVPzBq8/edit?tab=t.0',
   array['He’s Not Ignoring Me… He’s Knocked Out', 'Why I Stopped Giving My Kids Melatonin']::text[]),
  ('Dr Tobias', 'Colon 14 Day Cleanse', 0,
   'https://docs.google.com/document/d/1lEKrZzZ51fEHmUgwg5ksBw6eYsvYNmI9xPZHSxalz1Q/edit?tab=t.0',
   array['The Japanese Gut Health Secret', 'What Really Happens During a Colon Cleanse', 'How I Went From Bloated to Flat in a Few Days', 'If Joey Chestnut Swears By This, I Need It']::text[]),
  ('Dr Tobias', 'Lung Health', 1,
   'https://docs.google.com/document/d/1lEKrZzZ51fEHmUgwg5ksBw6eYsvYNmI9xPZHSxalz1Q/edit?tab=t.iyd0i3cnge8e',
   array['3 Signs Your Lungs May Need Extra Support', 'If Your Lungs Have Been Exposed to Toxins for Years, Watch This', 'I Heard a Pharmacist Say This About Your Lungs After the Flu']::text[]),
  ('Dr. Harvey''s', 'Holistix', 0,
   'https://docs.google.com/document/d/1MuFGuZaxWH6MVGRDG27QccfYHX7sOmYUG7k2FFm01H4/edit?tab=t.0',
   array['The Comparison Angle (Best Performing Angle)', 'It’s Not Just Bad Breath, It’s Their Health', 'It’s Not Just Bad Breath, It’s Their Health (Variation #2)']::text[]),
  ('FlyWell', '', 0,
   'https://docs.google.com/document/d/15OneQVq4X0oPqj6Teh3DX_7up1IFq8KSx9TOODL6sjc/edit?tab=t.0',
   array['Travel Essential', 'The Science Behind It', 'Tired Day Fix!']::text[]),
  ('Honeysticks', '', 0,
   'https://docs.google.com/document/d/1LxsoOl72aVFvzWhMPNGx32_LUG_3JD-6zh6REJ13L70/edit?tab=t.0',
   array['Playtime', 'I’m returning these']::text[]),
  ('JoyMode', '', 0,
   'https://docs.google.com/document/d/1A4XJaM7rtQJL-_LITVgD1RZRpHjECKJE_zEYrnUoNSo/edit?tab=t.0',
   array['Performance She Noticed', 'POV: Meatmaxxing', 'No More Useless Marathons']::text[]),
  ('Kenashii', '', 0,
   'https://docs.google.com/document/d/1sT-cmKCfffYgrLFCw71We3r7iZSdS_0D32itaWE3DXY/edit?tab=t.0',
   array['Quick and Clean Air', 'Waxing Guide', 'POV: Experiment Time']::text[]),
  ('Penetrex', '', 0,
   'https://docs.google.com/document/d/1Zfq6PLrJgGxzqNnLEWMQcLJJnS3VnjA9YvDtlMllm1M/edit?tab=t.0',
   array['The Accidental Discovery Crack-Reveal Concept', 'My Dad’s Honest Reaction', 'The No more Gatekeeping Trend (Gym Edition)', 'Nobody Warned Me About 40']::text[]),
  ('Swisse', '', 0,
   'https://docs.google.com/document/d/1g4_33htyHJl7A4z7aVV0zax1hJsXE8FI8sACcSkuAy8/edit?tab=t.0',
   array['Visual hook (Top performing angle)', 'What I wish I could tell my younger self']::text[])
on conflict (lower(btrim(brand)), lower(btrim(product))) do nothing;

-- NOT IN THE SHEET YET, so no row and no categorising until they have one:
--   Apothecary
--   Aqua Sonic
--   Aurelia
--   Yesday
--   Inno Supps
--   Irwin Naturals
--   Klassy Network
--   Pure Daily Care
