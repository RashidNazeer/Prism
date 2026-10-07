-- ============================================================================
-- A PICTURE FOR A PRODUCT, FETCHED ONCE AND REMEMBERED.
--
-- Rashid, 2026-09-24: "also check if images can be fetcheable for cruva and
-- euka so we can show images of product in dropdown".
--
-- The onboarding picker has drawn a letter tile for almost every product since
-- it shipped, because the endpoint we were reading has no picture in it:
-- EUKA's `dashboard/products-performance` answers productId, title and twenty
-- figures and no image of any kind. That was true, and it is still true — but
-- it was never the whole story, and this table is the correction.
--
-- EUKA'S PUBLIC SPEC HAS TWO ENDPOINTS THAT DO CARRY ONE, and both are looked
-- up BY THE EXACT TIKTOK PRODUCT ID we already hold, so neither one is a guess
-- at somebody else's catalogue:
--
--   GET  /social-intelligence/products/{productId}?brandId=...   -> imageUrl
--        Our own shop's record, asked for with our own brand id.
--   POST /market-intelligence/tiktok/product/detail  (need_image) -> master_image_url
--        TikTok market data, keyed on the product id alone — which is how a
--        REACHER or CRUVA brand, with no EUKA brand id anywhere, can still get
--        a picture for a product it sells.
--
-- (The earlier finding stands and is worth keeping: the *list* endpoint,
-- `social-intelligence/products`, is market-wide, and asked for our brand id it
-- answered with another company's products. A LIST cannot be trusted here. A
-- LOOKUP BY ID can, because the id is ours.)
--
-- WHY A TABLE RATHER THAN A LOOKUP EVERY TIME: a brand's catalogue runs to a
-- hundred products, and one HTTP call per product every time somebody opens the
-- onboarding drawer would make the picker slower than the typing it replaced,
-- and would spend a third party's quota to learn the same answer repeatedly.
-- A product's photograph changes about never.
-- ============================================================================

create table if not exists public.collab_product_images (
  -- TikTok Shop's own product id, which is what every platform we read keys a
  -- product by. Shared across EUKA, Reacher and Cruva, so one brand moving
  -- platform does not orphan its pictures.
  product_id  text primary key check (length(trim(product_id)) between 1 and 80),

  -- The picture, on whoever's CDN serves it. NULL is a real and useful answer:
  -- it means "asked, and there is none", which is what stops us asking again
  -- every single time the drawer opens.
  image_url   text check (image_url is null or length(image_url) between 8 and 2000),

  -- Which lookup answered: 'euka-social' (our own shop record), 'euka-market'
  -- (TikTok market data by id), 'reacher' (their product catalogue), or
  -- 'none' when every route we have came back empty.
  source      text not null default 'none'
                check (source in ('euka-social', 'euka-market', 'reacher', 'cruva', 'none')),

  -- The product's title as the answering source spelled it, kept only so a
  -- picture that looks wrong can be checked against the name it came with
  -- rather than argued about.
  title       text,

  -- When we last asked. A miss is retried after a while — a product listed
  -- yesterday may have no image indexed yet and one tomorrow — and a hit is
  -- kept indefinitely.
  checked_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The reader looks up "everything I have for these ids", and the sweeper looks
-- for misses old enough to retry.
create index if not exists collab_product_images_stale_idx
  on public.collab_product_images (checked_at)
  where image_url is null;

comment on table public.collab_product_images is
  'Product pictures for the Paid Collabs onboarding picker, looked up once by TikTok product id and cached. A NULL image_url means "asked, none found" and is deliberate: it is what stops the same empty lookup running on every open.';

-- ------------------------------------------------------------ row security --
alter table public.collab_product_images enable row level security;

-- Whoever can see the Paid Collabs screens can see the product pictures on
-- them. There is nothing commercial in this table: an id, a title and a public
-- image URL, all of it already visible on TikTok Shop itself.
drop policy if exists collab_product_images_select on public.collab_product_images;
create policy collab_product_images_select on public.collab_product_images
  for select to authenticated
  using (public.is_collabs_viewer());

-- Nobody writes with a user token. The cache is filled by the collab-products
-- Edge Function holding the service key, which these policies do not apply to
-- — the same shape as collab_brand_photos and creator_avatars.

-- ------------------------------------------------------------------ grants --
-- Explicit, per table: "Automatically expose new tables" is OFF, and that also
-- switches off the default grants to service_role — without the second line
-- the Edge Function would silently read and write nothing.
grant select on table public.collab_product_images to authenticated;
grant all privileges on table public.collab_product_images to service_role;
