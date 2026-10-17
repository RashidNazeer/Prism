import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BrandHeader } from '@/components/creator/brand/BrandHeader';
import type { BrandMiniStats } from '@/components/creator/brand/useBrandMiniStats';
import { AccentScope, Overview, SectionControl } from '@/routes/app/BrandHub';
import type {
  CreatorBrand,
  CreatorOffer,
  CreatorProduct,
} from '@/lib/creator/useCreatorBrands';
import type { MyOfferApplication } from '@/lib/creator/useOfferApplications';
import type { MyStanding } from '@/lib/creator/useLeaderboard';
import type { ChartPoint } from '@/components/charts';

/**
 * THE BRAND HUB'S OVERVIEW, RENDERED AGAINST MADE-UP FIGURES, SO IT CAN BE
 * LOOKED AT.
 *
 * DEV ONLY — registered behind `import.meta.env.DEV` in `src/app/router.tsx`,
 * absent from any production bundle. Open it at `/dev/brand-hub` with
 * `pnpm dev`.
 *
 * WHY IT EXISTS. Nobody on this machine has a creator login and Supabase is
 * unreachable from the sandbox, so `/app/brands/swisse` cannot be opened. The
 * 2026-10-17 rework of this screen is almost entirely about how much room an
 * ABSENT thing takes, and that is a question you can only answer by looking.
 * `HomePreview` exists for the same reason and this follows its pattern.
 *
 * IT RENDERS THE REAL COMPONENTS — `AccentScope`, `BrandHeader`,
 * `SectionControl` and `Overview`, imported from the route itself, not copies.
 * A copy would drift and then agree with itself.
 *
 * THE TWO CASES THAT MATTER, side by side:
 *
 *   - BARE: the brand Rashid screenshotted. No introduction, no products, no
 *     offers, and she is not on its board. This used to be three full-height
 *     "on its way" cards plus an unranked card — a screen and a half that said
 *     nothing. It should now be ONE note and ONE line.
 *   - FILLED: products with rates, offers (some open, some she is on), an
 *     introduction, and a real standing.
 *
 * BOTH THEMES, by nesting `data-theme`, because the tokens are declared per
 * theme and the dark face is the one being retuned this week. A dark block
 * nested in a light page blurs a LIGHT backdrop, so the panels read paler here
 * than in the real app, where the ground is near-black. Judge the LAYOUT on
 * this page and the colour on the real one.
 *
 * DO NOT READ THE BLUR BUDGET OFF THIS PAGE. It stacks up to six hubs at once,
 * so it paints up to twelve blurred layers against a budget of three. The hub
 * itself paints TWO: the header panel and the overview panel. Everything
 * inside either of them is `wx-neo-raised-sm` or `wx-neo-inset`, which is the
 * same material with the blur left off. `?case=` opens
 * one case on its own: `bare`, `filled`, or `loading`.
 */

/* ------------------------------------------------------------- fixtures -- */

const day = (i: number) => `Oct ${((i % 31) + 1).toString()}`;

const gmvSeries: ChartPoint[] = Array.from({ length: 30 }, (_, i) => ({
  label: day(i),
  /* A hole in the middle, because a real brand window has days TikTok
     withheld, and "null is not zero" has to be visible in a preview. */
  value: i > 12 && i < 17 ? null : Math.round(620 + Math.sin(i / 3) * 280 + i * 29),
}));

const videoSeries: ChartPoint[] = Array.from({ length: 30 }, (_, i) => ({
  label: day(i),
  value: i % 6 === 2 ? null : Math.round(1 + (i % 4)),
}));

const FILLED_STATS: BrandMiniStats = {
  loading: false,
  isError: false,
  measured: true,
  gmv: 18420,
  gmvBefore: 14980,
  gmvSeries,
  videos: 37,
  videoSeries,
  currency: 'USD',
  from: '2026-09-18',
  to: '2026-10-17',
};

/**
 * NOTHING MEASURED, which is a different state from zero and has to look like
 * it. Both figures are `null`, both tracks are empty, and the commission line
 * under them reads the same as it always does.
 */
const BARE_STATS: BrandMiniStats = {
  loading: false,
  isError: false,
  measured: false,
  gmv: null,
  gmvBefore: null,
  gmvSeries: [],
  videos: null,
  videoSeries: [],
  currency: null,
  from: null,
  to: null,
};

const LOADING_STATS: BrandMiniStats = { ...BARE_STATS, loading: true };

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

const STANDING: MyStanding = {
  rank: 7,
  gmv: 18420,
  spend: 0,
  orders: 212,
  videos: 37,
  currency: 'USD',
  total_creators: 184,
  top_percent: 4,
};

/* ---------------------------------------------------------------- page --- */

/** One case, with the header above it exactly as the hub stacks them. */
function Case({
  brand,
  stats,
  products,
  offers,
  mine,
  loading,
}: {
  brand: CreatorBrand;
  stats: BrandMiniStats;
  products: CreatorProduct[];
  offers: CreatorOffer[];
  mine: MyOfferApplication[];
  loading: boolean;
}) {
  /* The section control is live, so the tabs and the hairline between the two
     groups can be clicked and looked at. Nothing navigates: this page has no
     router state of its own and the sections themselves need a database. */
  const [section, setSection] = useState('overview');

  return (
    <AccentScope brand={brand}>
      <BrandHeader brand={brand} stats={stats}>
        <SectionControl
          brand={brand}
          section={section}
          offerCount={loading ? undefined : offers.length}
          onSection={setSection}
        />
      </BrandHeader>

      <Overview
        brand={brand}
        products={products}
        loading={loading}
        failed={false}
        onRetry={() => Promise.resolve()}
        offers={offers}
        mine={mine}
        offersLoading={loading}
        onSection={setSection}
      />
    </AccentScope>
  );
}

/**
 * SEEDS THE ONE READ `Overview` MAKES ITSELF.
 *
 * `HubStanding` calls `useMyStanding` rather than taking a prop, which is right
 * in the app and inconvenient here: with Supabase unreachable it would sit on
 * a skeleton forever. Writing the answer straight into the query cache under
 * the key that hook uses means the component takes the normal path and no
 * request is made at all — so what renders is the real code, not a stub.
 *
 * `null` is seeded for the bare brand, because "not on this board" is one of
 * the two states being looked at.
 */
function useSeededStandings(ready: () => void) {
  const queryClient = useQueryClient();
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    const key = (brandId: string) => [
      'creator',
      'leaderboard',
      'me',
      '2000-01-01',
      to,
      brandId,
    ];
    queryClient.setQueryData(key(FILLED_BRAND.id), STANDING);
    queryClient.setQueryData(key(BARE_BRAND.id), null);
    ready();
  }, [queryClient, to, ready]);
}

const CASES = ['bare', 'filled', 'loading'] as const;
type CaseName = (typeof CASES)[number];

export function BrandHubPreview() {
  const [seeded, setSeeded] = useState(false);
  const ready = useMemo(() => () => setSeeded(true), []);
  useSeededStandings(ready);

  const requested = new URLSearchParams(window.location.search).get('case');
  const only = CASES.find((c) => c === requested);
  const shown: CaseName[] = only ? [only] : [...CASES];

  const render = (name: CaseName) => {
    if (name === 'filled')
      return (
        <Case
          brand={FILLED_BRAND}
          stats={FILLED_STATS}
          products={PRODUCTS}
          offers={OFFERS}
          mine={MINE}
          loading={false}
        />
      );
    if (name === 'loading')
      return (
        <Case
          brand={FILLED_BRAND}
          stats={LOADING_STATS}
          products={[]}
          offers={[]}
          mine={[]}
          loading
        />
      );
    return (
      <Case
        brand={BARE_BRAND}
        stats={BARE_STATS}
        products={[]}
        offers={[]}
        mine={[]}
        loading={false}
      />
    );
  };

  const LABELS: Record<CaseName, string> = {
    bare: 'BARE — nothing filled in, not on the board (the screenshot)',
    filled: 'FILLED — products, offers, an introduction, a real standing',
    loading: 'LOADING — every read still in flight. No zeros anywhere',
  };

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <h1 className="text-[1.25rem] font-bold">Brand hub overview, dev preview</h1>
      <p className="text-muted mt-1 max-w-prose text-[0.8125rem] leading-relaxed">
        The real <code>BrandHeader</code>, <code>SectionControl</code> and <code>Overview</code>{' '}
        against made-up figures, because there is no creator login on this machine. Add{' '}
        <code>?case=bare</code>, <code>?case=filled</code> or <code>?case=loading</code> to open
        one on its own.
        {seeded ? null : ' Seeding the standing cache…'}
      </p>

      {/*
        NOTHING RENDERS UNTIL THE CACHE IS SEEDED, and this is not a nicety.
        `HubStanding` fires `useMyStanding` the moment it mounts, so rendering
        before the seed lands means two real requests to a Supabase this
        sandbox cannot reach, two 401s in the console, and both standings stuck
        in their ERROR state for the rest of the session — which looks exactly
        like a bug in the screen being previewed.
      */}
      {!seeded
        ? null
        : (['light', 'dark'] as const).map((theme) => (
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
