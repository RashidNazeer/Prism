import type {
  CreatorBrand,
  CreatorOffer,
  CreatorProduct,
} from '@/lib/creator/useCreatorBrands';
import type { MyOfferApplication } from '@/lib/creator/useOfferApplications';
import { BrandGrid } from '@/routes/app/Brands';
import { BrandPageView } from '@/routes/app/BrandHub';
import { CONTEST_CASES } from '@/routes/dev/ContestsPreview';

/**
 * THE MARKETPLACE AND A BRAND'S PAGE, RENDERED AGAINST MADE-UP DATA.
 *
 * DEV ONLY (`/dev/brand-hub`), absent from a production build. Nobody on this
 * machine has a creator login, so this draws the REAL `BrandGrid` and
 * `BrandPageView` from the routes, not copies.
 *
 * `?case=` opens one on its own: grid, single, full, bare.
 */

const FILLED_BRAND: CreatorBrand = {
  id: 'preview-filled',
  name: 'Vitauthority',
  slug: 'vitauthority',
  logo_url: null,
  tagline: 'Supplements for women who lift',
  description:
    'We started in a garage in 2019 because every greens powder on the shelf tasted like a lawn. Nine products later we are still founder-run, we still answer our own DMs, and we still send every creator the full range before they film a word of it.',
  brand_color: '#2F7D62',
  hero_url: null,
  theme: null,
};

/** The brand from the screenshot: real, approved, and empty. */
const BARE_BRAND: CreatorBrand = {
  id: 'preview-bare',
  name: 'Swisse',
  slug: 'swisse',
  logo_url: null,
  tagline: null,
  description: null,
  brand_color: '#8A5BD6',
  hero_url: null,
  theme: null,
};

const PRODUCTS: CreatorProduct[] = [
  {
    id: 'p1',
    brand_id: FILLED_BRAND.id,
    name: 'Multi Collagen Burn',
    image_url: null,
    price: 49.95,
    currency: 'USD',
    commission_rate: 22,
    badge_title: 'Best seller',
  },
  {
    id: 'p2',
    brand_id: FILLED_BRAND.id,
    name: 'Apple Cider Vinegar Gummies',
    image_url: null,
    price: 29.0,
    currency: 'USD',
    commission_rate: 18,
    badge_title: null,
  },
  {
    /* No price and no rate. Both are legitimately null and neither may render
       as a zero or a "0%". */
    id: 'p3',
    brand_id: FILLED_BRAND.id,
    name: 'Daily Greens, unflavoured',
    image_url: null,
    price: null,
    currency: 'USD',
    commission_rate: null,
    badge_title: null,
  },
  {
    id: 'p4',
    brand_id: FILLED_BRAND.id,
    name: 'Night-time Magnesium',
    image_url: null,
    price: 34.5,
    currency: 'USD',
    commission_rate: 25,
    badge_title: 'New',
  },
];

const OFFERS: CreatorOffer[] = [
  {
    id: 'o1',
    brand_id: FILLED_BRAND.id,
    badge_title: 'Paid',
    title: 'Three videos on Collagen Burn',
    description: null,
    video_count: 3,
    reward_amount: 450,
    currency: 'USD',
    needs_application: true,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'o2',
    brand_id: FILLED_BRAND.id,
    badge_title: null,
    title: 'Boosted 30% on the gummies',
    description: null,
    video_count: null,
    reward_amount: null,
    currency: 'USD',
    needs_application: false,
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'o3',
    brand_id: FILLED_BRAND.id,
    badge_title: null,
    title: 'Greens launch, one video',
    description: null,
    video_count: 1,
    reward_amount: 180,
    currency: 'USD',
    needs_application: true,
    created_at: '2026-09-02T00:00:00Z',
  },
];

/**
 * ONE APPROVED REQUEST, so the summary has to split "open to you" from "you
 * are on" rather than printing a single total of three.
 */
const MINE: MyOfferApplication[] = [
  {
    id: 'a1',
    offer_id: 'o3',
    brand_id: FILLED_BRAND.id,
    status: 'approved',
    stage: 'content_pending',
    committed_amount: 180,
    committed_video_count: 1,
    currency: 'USD',
    note: null,
    decision_note: null,
    decided_at: '2026-09-04T00:00:00Z',
    created_at: '2026-09-03T00:00:00Z',
  },
];

/** A flat mark on a square, as an SVG data URI. `size` is the intrinsic pixel width. */
const logo = (bg: string, fg: string, size = 512) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 64 64'><rect width='64' height='64' fill='${bg}'/><circle cx='32' cy='32' r='15' fill='${fg}'/><circle cx='32' cy='32' r='6' fill='${bg}'/></svg>`
  );
const LOGO_LIGHT = logo('#f6f1e7', '#c0507a');
const LOGO_DARK = logo('#14161f', '#e5b93c');
const LOGO_MID = logo('#d9822b', '#ffffff');
const LOGO_SMALL = logo('#c8262d', '#f5c518', 96);

const BRANDS: CreatorBrand[] = [
  { ...FILLED_BRAND, name: 'Vitauthority', logo_url: LOGO_LIGHT },
  { ...BARE_BRAND, name: 'Swisse', logo_url: LOGO_DARK, brand_color: '#14161f' },
  { ...FILLED_BRAND, id: 'b3', name: 'Aurelia', slug: 'aurelia', tagline: 'Skin that looks like skin', brand_color: '#C0507A' },
  { ...FILLED_BRAND, id: 'b4', name: 'Glow Lab', slug: 'glow-lab', tagline: null, description: 'Sunscreen, serums and a very long description that should never run past two lines on any card in the grid.', brand_color: '#D08A1E', logo_url: LOGO_MID },
  { ...BARE_BRAND, id: 'b5', name: 'Northwind Outdoor', slug: 'northwind', brand_color: null },
  { ...FILLED_BRAND, id: 'b6', name: 'Penetrex', slug: 'pawsome', tagline: 'Recovery and relief', brand_color: '#C8262D', logo_url: LOGO_SMALL },
  { ...FILLED_BRAND, id: 'b7', name: 'Pawsome', slug: 'pawsome2', tagline: 'Treats dogs ask for', brand_color: '#7A5A2F' },
  { ...FILLED_BRAND, id: 'b8', name: 'Tidewater', slug: 'tidewater', tagline: 'Swim and surf', brand_color: '#2F6FB5' },
];

const COUNTS: Record<string, number> = {
  [FILLED_BRAND.id]: 3,
  b3: 1,
  b4: 12,
  b6: 2,
  b7: 1,
  b8: 4,
};
/** Offers she has already asked for, per brand. Aurelia: all of them. */
const TAKEN: Record<string, number> = { [FILLED_BRAND.id]: 1, b3: 1, [BARE_BRAND.id]: 1 };
const RATES: Record<string, number> = { [FILLED_BRAND.id]: 25, b3: 18, b4: 12.5, b6: 15 };
const WORKING = new Set([FILLED_BRAND.id, 'b3', BARE_BRAND.id]);

const CASES = ['grid', 'single', 'full', 'bare'] as const;
type CaseName = (typeof CASES)[number];

const LABELS: Record<CaseName, string> = {
  grid: 'MARKETPLACE: six brands, logos and monograms, rate or not, working-with mix',
  single: 'MARKETPLACE: one brand',
  full: 'BRAND PAGE: offers, contests and products',
  bare: 'BRAND PAGE: nothing but the header',
};

function render(name: CaseName) {
  if (name === 'grid') return <BrandGrid brands={BRANDS} counts={COUNTS} rates={RATES} working={WORKING} taken={TAKEN} />;
  if (name === 'single') return <BrandGrid brands={[BARE_BRAND]} counts={{}} />;
  if (name === 'full')
    return (
      <BrandPageView
        brand={FILLED_BRAND}
        offers={OFFERS}
        mine={MINE}
        progress={undefined}
        products={PRODUCTS}
        contests={CONTEST_CASES.joinable ?? []}
      />
    );
  return (
    <BrandPageView
      brand={BARE_BRAND}
      offers={[]}
      mine={[]}
      progress={undefined}
      products={[]}
      contests={[]}
    />
  );
}

export function BrandHubPreview() {
  const requested = new URLSearchParams(window.location.search).get('case');
  const only = CASES.find((c) => c === requested);
  const shown: CaseName[] = only ? [only] : [...CASES];

  return (
    <div className="min-h-screen p-4 sm:p-6">
      {(['light', 'dark'] as const).map((theme) => (
        <section
          key={theme}
          data-theme={theme}
          className="bg-app mt-6 rounded-2xl p-4 sm:p-5"
        >
          <p className="text-faint text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            {theme}
          </p>
          {shown.map((name) => (
            <div key={name} className="mt-4">
              <p className="text-muted text-[0.75rem] font-semibold">{LABELS[name]}</p>
              <div className="mt-2">{render(name)}</div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
