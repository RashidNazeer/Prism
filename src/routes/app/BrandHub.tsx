import { lazy, Suspense, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { m } from 'motion/react';
import { Package, Ticket } from 'lucide-react';
import { ApplyDialog } from '@/components/creator/ApplyDialog';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { OfferCard } from '@/components/creator/OfferCard';
import { ButtonLink } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  useCreatorBrand,
  useCreatorOffers,
  useCreatorProducts,
  type CreatorBrand,
  type CreatorOffer,
  type CreatorProduct,
} from '@/lib/creator/useCreatorBrands';
import {
  useMyOfferApplications,
  type MyOfferApplication,
} from '@/lib/creator/useOfferApplications';
import { money, percent } from '@/lib/money';
import { useCatalogueLive } from '@/lib/creator/useCatalogueLive';
import { useMyJobProgress } from '@/lib/work/job-progress';
import { cn } from '@/lib/utils';
import { BrandWorldShell } from '@/components/brand/BrandWorldShell';
import { BrandWorldHero } from '@/components/brand/BrandWorldHero';
import { useCreatorBrands } from '@/lib/creator/useCreatorBrands';

/*
 * THE THREE REAL SECTIONS ARE THE SAME SCREENS THE SIDEBAR ALREADY OPENS, each
 * handed this hub's brand id. Not a copy: one screen, two places it lives, so a
 * fix to the numbers can never land in one and miss the other.
 *
 * Lazily, and this matters. My numbers pulls in the chart, and Leaderboards
 * pulls in avatars and signed storage URLs. Importing them at the top would
 * fold all three into the Brand Hub chunk, so a creator browsing a brand's
 * offers would download the whole numbers screen to look at a product list.
 */
const HubNumbers = lazy(() => import('./MyNumbers').then((m) => ({ default: m.MyNumbers })));
const HubContests = lazy(() => import('./Contests').then((m) => ({ default: m.Contests })));
const HubLeaderboards = lazy(() =>
  import('./Leaderboards').then((m) => ({ default: m.Leaderboards }))
);

/** Skeletons, never a bare spinner. Roughly the shape of what is arriving. */
function SectionLoading() {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="wx-skeleton h-24 rounded-xl" />
        ))}
      </div>
      <div className="wx-skeleton h-64 rounded-xl" />
    </div>
  );
}

/**
 * A Brand Hub, as a creator sees it.
 *
 * Two sections are real: what the brand is and what it sells, and the offers on
 * the table. The rest are listed and plainly marked, the same honesty the
 * sidebar uses, because a creator should be able to see the shape of what is
 * coming without being able to click into an empty room.
 *
 * It opens on Overview rather than Offers, which is the opposite of the admin
 * hub. An admin arrives at a brand to do a job. A creator arrives to decide
 * whether they want to work with it at all, and that decision is made on the
 * brand and its products.
 */
const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'offers', label: 'Offers' },
  { key: 'numbers', label: 'My numbers' },
  { key: 'contests', label: 'Contests' },
  { key: 'leaderboards', label: 'Leaderboards' },
  /*
   * ONE SECTION WHERE THERE WERE TWO. Rashid, 2026-10-07, circling "Campaigns &
   * briefs" and "Creative studio": "I want the circled elements removed and
   * instead there should be only one element named Creators Library".
   *
   * It keeps the marked-but-unclickable treatment the two it replaces had,
   * because nothing is behind it yet either, and the rule below is the point of
   * this list: a creator should see the shape of what is coming without being
   * able to click into an empty room.
   */
  { key: 'library', label: 'Creators Library', soon: 'Next' },
] as const;

/*
 * WHAT IS ACTUALLY BEHIND A TAB, and the honesty is the point.
 *
 * My numbers, Contests and Leaderboards are real screens with real data, so
 * they open. Creators Library has no table, no rows and no screen anywhere in
 * this repo, so it stays marked and unclickable rather than opening an empty
 * room. Rashid asked for every section that is possible, and that one is not
 * yet possible.
 */
const BUILT = new Set(['overview', 'offers', 'numbers', 'contests', 'leaderboards']);

export function BrandHub() {
  const { slug } = useParams<{ slug: string }>();
  const { data: brands, isLoading: brandsLoading } = useCreatorBrands();
  const [params, setParams] = useSearchParams();
  const requested = params.get('section') ?? 'overview';
  const section = BUILT.has(requested) ? requested : 'overview';

  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  // Admin edits to brands, offers and products land here without a reload.
  useCatalogueLive();

  const { data: brand, isLoading, isError } = useCreatorBrand(slug);
  const { data: offers, isLoading: offersLoading } = useCreatorOffers(brand?.id);
  const { data: products, isLoading: productsLoading } = useCreatorProducts(brand?.id);
  const { data: mine } = useMyOfferApplications(brand?.id);

  const go = (key: string) => {
    const p = new URLSearchParams();
    if (key !== 'overview') p.set('section', key);
    setParams(p, { replace: true });
  };

  /*
   * NO SLUG MEANS "TAKE ME INTO A BRAND", not "show me a list of brands".
   * Rashid: "by default, one of the brand hub should be selected with it's own
   * theme". `/app/brands` therefore opens the first one rather than an index
   * page nobody asked for. Replace rather than push, so Back leaves the world
   * instead of bouncing between the redirect and its target.
   */
  if (!slug) {
    if (brandsLoading) return <WorldSkeleton />;
    const first = brands?.[0];
    if (first) return <Navigate to={`/app/brands/${first.slug}`} replace />;
    /*
     * NO BRANDS AT ALL is a real state with its own answer, not an error. It is
     * what an approved creator sees before anybody has opened a hub to them,
     * and falling through to "that brand hub is not open" would tell them
     * something had broken when nothing had.
     */
    return (
      <div className="bg-bg text-text flex min-h-screen items-center justify-center p-6">
        <div className="border-line bg-surface-1 max-w-md rounded-xl border p-8 text-center shadow-md">
          <p className="font-semibold">No brand hubs yet</p>
          <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">
            When Wurx opens a brand to you, it appears here with its own space: its offers, its
            contests and your numbers for it.
          </p>
          <ButtonLink to="/app" variant="secondary" size="sm" className="mt-5">
            Back to your dashboard
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (!approved) {
    return (
      <>
        <LockedUntilApproved />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <div className="max-w-3xl space-y-4">
          <div className="wx-skeleton h-10 w-64" />
          <div className="wx-skeleton h-10 w-full" />
          <div className="wx-skeleton h-40 rounded-xl" />
        </div>
      </>
    );
  }

  if (isError || !brand) {
    return (
      <>
        <div className="border-line bg-surface-1 max-w-lg rounded-xl border p-8 text-center shadow-md">
          <p className="font-semibold">That brand hub is not open</p>
          <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">
            It may have been retired, or it may not be one of yours. Nothing else is affected.
          </p>
          <ButtonLink to="/app/brands" variant="secondary" size="sm" className="mt-5">
            Back to brand hubs
          </ButtonLink>
        </div>
      </>
    );
  }

  /*
   * THE SECTIONS ARE THE RAIL NOW, not a row of pills above the content.
   * Rashid: "all offers, overview contest my numbers, for selected brands,
   * would be the menu on left side". Choosing a brand and choosing a section
   * are the same gesture in the same place, which is what makes this read as
   * moving around one world rather than loading pages.
   */
  return (
    <BrandWorldShell
      brand={brand}
      brands={brands?.length ? brands : [brand]}
      sections={SECTIONS}
      section={section}
      onSection={go}
    >
      {/*
        The hero only leads the OVERVIEW. On a working section a creator came
        to do something, and a half screen of brand poetry above their numbers
        is the "content starts high" rule broken in a nicer font.
      */}
      {section === 'overview' ? (
        <BrandWorldHero
          brand={brand}
          offerCount={offers?.length ?? 0}
          onExplore={() => go('offers')}
        />
      ) : null}

      <div className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-8">
        {section === 'offers' ? (
          <Offers
            offers={offers ?? []}
            mine={mine ?? []}
            loading={offersLoading}
            brandName={brand.name}
          />
        ) : section === 'numbers' ? (
          <Suspense fallback={<SectionLoading />}>
            <HubNumbers brandId={brand.id} />
          </Suspense>
        ) : section === 'contests' ? (
          <Suspense fallback={<SectionLoading />}>
            <HubContests hubBrandId={brand.id} />
          </Suspense>
        ) : section === 'leaderboards' ? (
          <Suspense fallback={<SectionLoading />}>
            <HubLeaderboards brandId={brand.id} />
          </Suspense>
        ) : (
          <Overview brand={brand} products={products ?? []} loading={productsLoading} />
        )}
      </div>
    </BrandWorldShell>
  );
}

/** While we work out which brand to open. Skeletons, never a bare spinner. */
function WorldSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="bg-surface-2 hidden w-[16.5rem] shrink-0 lg:block" />
      <div className="flex-1 p-6">
        <div className="wx-skeleton h-48 rounded-xl" />
        <div className="wx-skeleton mt-5 h-8 w-64 rounded-md" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- overview -- */

/**
 * The first thing inside a brand, and it is now only the things it sells.
 *
 * WHAT CAME OUT, and why. Rashid: "the boring meet the brand, A dedicated space
 * for creators turning trusted recovery products into great content. and button
 * below it see offer is wasting space no need remove it".
 *
 * He is right twice over. The paragraph was the brand's description, which the
 * hero directly above already prints in full, so the screen opened by saying
 * the same sentence twice. And "See 1 offer" was a second route to a tab that
 * is already lit in the rail and already has a button in the hero. Two of the
 * three blocks on this screen were repeating its neighbours.
 *
 * So the products are the section, and they get the room the duplication was
 * using.
 */
function Overview({
  brand,
  products,
  loading,
}: {
  brand: CreatorBrand;
  products: CreatorProduct[];
  loading: boolean;
}) {
  return (
    <div className="mt-2 grid gap-6">
      <section>
        <SectionHeading>What {brand.name} sells</SectionHeading>

        {loading ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="wx-skeleton h-[19rem] rounded-2xl" />
            ))}
          </ul>
        ) : products.length === 0 ? (
          <div className="border-line bg-surface-1 mt-4 rounded-2xl border px-6 py-12 text-center shadow-md">
            <Package size={24} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">Products are on their way</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              The brand has not listed its products here yet. They appear with the commission
              you earn on each one.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product, i) => (
              <m.li
                key={product.id}
                /*
                 * STAGGERED IN, and capped at six. Past that the last card in a
                 * long list waits most of a second for its turn, which stops
                 * reading as polish and starts reading as a slow page.
                 */
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: 'easeOut', delay: Math.min(i, 6) * 0.05 }}
                className="group border-line bg-surface-1 hover:border-accent/40 relative flex flex-col overflow-hidden rounded-2xl border shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                {/*
                  THE PICTURE LEADS, because a product a creator has never held
                  is a photograph before it is a name. Square, so a grid of them
                  lines up whatever shape the brand uploaded.
                */}
                <div className="bg-surface-2 relative aspect-square overflow-hidden">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                    />
                  ) : (
                    <span className="grid size-full place-items-center">
                      <Package size={26} aria-hidden className="text-faint" />
                    </span>
                  )}

                  {product.badge_title ? (
                    <span className="bg-surface-1/90 text-accent absolute top-3 left-3 rounded-full px-2.5 py-1 text-[0.625rem] font-bold tracking-[0.12em] uppercase shadow-sm backdrop-blur">
                      {product.badge_title}
                    </span>
                  ) : null}

                  {/*
                    THE NUMBER THEY CAME FOR, on the image rather than under it.
                    A creator scanning a grid is looking for the commission, and
                    on the picture it is found in one pass instead of one per
                    card.
                  */}
                  {percent(product.commission_rate) ? (
                    <span className="bg-accent text-on-accent absolute right-3 bottom-3 rounded-full px-3 py-1.5 shadow-lg">
                      <span className="font-display text-[1rem] leading-none font-bold">
                        {percent(product.commission_rate)}
                      </span>
                      <span className="ml-1.5 text-[0.625rem] font-semibold tracking-[0.1em] uppercase opacity-90">
                        your cut
                      </span>
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col gap-1 p-4">
                  <p className="leading-snug font-semibold break-words">{product.name}</p>
                  {product.price !== null ? (
                    <p className="font-display text-muted text-[0.875rem]">
                      {money(product.price, product.currency)}
                    </p>
                  ) : null}
                </div>
              </m.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        {children}
      </h2>
      <span aria-hidden className="bg-line h-px flex-1" />
    </div>
  );
}

/* --------------------------------------------------------------- offers -- */

/**
 * Which pile does an offer belong in, from this creator's point of view?
 *
 * ONE function, because the three places that need the answer MUST agree: the
 * figures on the strip, the counts beside the tabs, and which cards a tab
 * actually shows. Working it out three times is how a tab comes to read
 * "Under way 2" and then draw three cards.
 */
type OfferBucket = 'open' | 'live' | 'paid';

function bucketFor(request: MyOfferApplication | undefined): OfferBucket {
  if (request?.status === 'approved') return request.stage === 'paid' ? 'paid' : 'live';
  /*
   * A PENDING REQUEST COUNTS AS UNDER WAY. It is not work yet, but a creator
   * who has asked for an offer and is waiting on us does not think of it as
   * still open to them, and putting it back in "Open to you" would invite them
   * to apply for the same thing twice.
   */
  if (request?.status === 'pending') return 'live';
  return 'open';
}

const BUCKETS = [
  { key: 'all', label: 'Everything' },
  { key: 'open', label: 'Open to you' },
  { key: 'live', label: 'Under way' },
  { key: 'paid', label: 'Paid' },
] as const;

/**
 * The offers a brand has on the table, as a creator sees them.
 *
 * Rashid, 2026-08-25: *"polish the ui more specially the offers page of brand
 * hubs for creators"*. It was a bare grid of cards in whatever order the
 * database returned them, which meant a creator with a sample on the way and
 * two of five videos filmed had to hunt for that card among the ones they have
 * never touched.
 *
 * WORK COMES FIRST is the organising idea. Three figures answer the two
 * questions anybody opens this tab with, the tabs cut the list down when there
 * is genuinely more than one kind of thing here, and inside every view an offer
 * somebody is actually ON sorts above one they have not started.
 */
function Offers({
  offers,
  mine,
  loading,
  brandName,
}: {
  offers: CreatorOffer[];
  mine: MyOfferApplication[];
  loading: boolean;
  brandName: string;
}) {
  const [applyingTo, setApplyingTo] = useState<CreatorOffer | null>(null);
  const [tab, setTab] = useState<string>('all');
  // How much of each job here has been filmed. Cached by TanStack Query, so
  // this is the same read the offers list and the home screen already made.
  const { data: progress } = useMyJobProgress();

  /*
   * The newest request per offer wins.
   *
   * A creator can be rejected and ask again, so an offer can carry several
   * rows. `mine` arrives newest first, so the first match is the one that
   * describes where they stand today.
   */
  const latestFor = (offerId: string) => mine.find((a) => a.offer_id === offerId);

  const rows = offers.map((offer) => {
    const request = latestFor(offer.id);
    return { offer, request, bucket: bucketFor(request) };
  });

  const ORDER: Record<OfferBucket, number> = { live: 0, open: 1, paid: 2 };
  const sorted = [...rows].sort((a, b) => ORDER[a.bucket] - ORDER[b.bucket]);

  const counts = {
    all: rows.length,
    open: rows.filter((r) => r.bucket === 'open').length,
    live: rows.filter((r) => r.bucket === 'live').length,
    paid: rows.filter((r) => r.bucket === 'paid').length,
  };

  /*
   * A FILTER OVER ONE PILE IS FURNITURE, not a filter. The tabs appear only
   * once there are genuinely two kinds of thing here, so a brand with three
   * open offers and nothing else does not get a row of controls where three of
   * the four would do nothing.
   */
  const showTabs = [counts.open, counts.live, counts.paid].filter((n) => n > 0).length > 1;
  const shown = showTabs && tab !== 'all' ? sorted.filter((r) => r.bucket === tab) : sorted;

  if (loading) {
    return (
      <div className="mt-2">
        <div className="wx-skeleton h-[5.5rem] rounded-2xl" />
        <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-64 rounded-xl" />
          ))}
        </ul>
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="border-line bg-surface-1 mt-2 max-w-2xl rounded-2xl border px-6 py-14 text-center shadow-md">
        <Ticket size={26} aria-hidden className="text-faint mx-auto" />
        <p className="mt-4 font-semibold">No offers open right now</p>
        <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
          {brandName} has nothing on the table at the moment. New offers land here as soon as
          they go live.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <OfferSummary rows={rows} counts={counts} />

      {showTabs ? (
        /*
          TRANSPARENT TABS, the same ones the contest cards use. Rashid asked
          for those by name on 2026-08-24 and there is no reason for this screen
          to invent a second vocabulary for the identical gesture. No filled
          pills and no box: the underline carries which one is open, and the row
          scrolls sideways inside itself on a phone rather than wrapping.
        */
        <div className="border-line mt-6 overflow-x-auto border-b">
          <div role="tablist" aria-label="Which offers" className="flex min-w-max gap-1">
            {BUCKETS.map((b) => {
              const n = counts[b.key];
              // An empty pile gets no tab. "Paid 0" is a question nobody asked.
              if (b.key !== 'all' && n === 0) return null;
              const active = tab === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(b.key)}
                  className={cn(
                    'relative flex min-h-[44px] shrink-0 items-center gap-1.5 px-3 text-[0.8125rem] font-semibold transition-colors',
                    active ? 'text-text' : 'text-muted hover:text-text'
                  )}
                >
                  {b.label}
                  <span
                    className={cn(
                      'font-display text-[0.75rem]',
                      active ? 'text-accent' : 'text-faint'
                    )}
                  >
                    {n}
                  </span>
                  {active ? (
                    /*
                      A PLAIN SPAN, not a `layoutId` that slides between tabs.
                      This app mounts `LazyMotion features={domAnimation}` in
                      strict mode, which deliberately does not ship the layout
                      engine, so a shared-layout underline would either do
                      nothing or warn in the console on every click. Zero
                      console errors is a promise here, not an aspiration.
                    */
                    <span
                      aria-hidden
                      className="bg-accent absolute inset-x-2 -bottom-px h-[2px] rounded-full"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map(({ offer, request }, i) => (
          <m.li
            /*
             * KEYED ON THE OFFER, so changing tab re-uses the card a creator
             * was already looking at rather than tearing it down and animating
             * a new one in. An accordion they opened survives the filter.
             */
            key={offer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: 'easeOut', delay: Math.min(i, 6) * 0.04 }}
          >
            <OfferCard
              offer={offer}
              request={request}
              progress={progress?.get(request?.id ?? '')}
              onApply={() => setApplyingTo(offer)}
            />
          </m.li>
        ))}
      </ul>

      {applyingTo ? (
        <ApplyDialog
          offer={applyingTo}
          brandName={brandName}
          onClose={() => setApplyingTo(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Three figures, before any card.
 *
 * WHY IT IS WORTH THE ROOM. A creator opening this tab is answering one of two
 * questions: what could I take on, and what have I been promised. Both were
 * previously answerable only by reading every card and adding up in your head,
 * which on a brand with thirty offers is not answerable at all.
 *
 * A STRIP RATHER THAN THREE TILES. Three bordered boxes above a grid of
 * bordered cards is four competing rectangles and the cards lose. Hairlines
 * between the figures, one soft wash of the brand behind them, and the offers
 * keep the emphasis they should have.
 */
function OfferSummary({
  rows,
  counts,
}: {
  rows: { offer: CreatorOffer; request: MyOfferApplication | undefined; bucket: OfferBucket }[];
  counts: { all: number; open: number; live: number; paid: number };
}) {
  /*
   * COMMITTED MONEY IS THE FROZEN FIGURE, never the offer's own.
   *
   * Both numbers freeze at approval, and re-pricing an offer applies to whoever
   * is approved NEXT, so `committed_amount` is what this creator was promised
   * and `reward_amount` is what the next person would be. Summing the second
   * would quietly promise somebody money that was never theirs.
   *
   * Grouped by currency rather than added blindly. It is almost always one, but
   * a brand paying some creators in GBP and others in USD would otherwise show
   * a total that is not a real amount in any currency at all.
   */
  const byCurrency = new Map<string, number>();
  for (const { request } of rows) {
    if (request?.status !== 'approved' || request.committed_amount == null) continue;
    byCurrency.set(
      request.currency,
      (byCurrency.get(request.currency) ?? 0) + Number(request.committed_amount)
    );
  }
  const totals = [...byCurrency.entries()];

  const figures: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Open to you', value: String(counts.open) },
    { label: 'You are on', value: String(counts.live + counts.paid) },
  ];
  if (totals.length > 0) {
    figures.push({
      label: 'Agreed with you',
      value: totals.map(([currency, amount]) => money(amount, currency)).join('   '),
      strong: true,
    });
  }

  return (
    <div
      className="border-line flex flex-wrap items-center gap-x-7 gap-y-4 rounded-2xl border px-5 py-4 shadow-sm"
      /*
        THE BRAND'S OWN COLOUR, at a whisper. Held at 9% over the card surface
        because a creator reads figures off this: a saturated panel behind
        numbers is a poster rather than a dashboard. It is a `color-mix` on the
        accent rather than the accent gradient, because a gradient behind a row
        of numbers changes the contrast under each one.
      */
      style={{
        background: 'color-mix(in srgb, var(--wx-accent) 9%, var(--wx-surface-1))',
      }}
    >
      {figures.map((f, i) => (
        <div key={f.label} className="flex items-center gap-7">
          {i > 0 ? <span aria-hidden className="bg-line hidden h-9 w-px sm:block" /> : null}
          <div>
            <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {f.label}
            </p>
            <p
              className="font-display mt-1.5 text-[1.375rem] leading-none font-semibold"
              /*
                THE INK, not the fill. `--wx-brand-accent-ink` is the accent
                walked away from the card until it clears 4.5:1 as TEXT, which
                is not the same colour as the one that fills a button. Falls
                back to the ordinary accent outside a brand world, where this
                component is never rendered but could be.
              */
              style={
                f.strong ? { color: 'var(--wx-brand-accent-ink, var(--wx-accent))' } : undefined
              }
            >
              {f.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
