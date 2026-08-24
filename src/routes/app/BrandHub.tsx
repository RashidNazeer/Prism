import { lazy, Suspense, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { m } from 'motion/react';
import { Package, Ticket } from 'lucide-react';
import { ApplyDialog } from '@/components/creator/ApplyDialog';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { OfferCard } from '@/components/creator/OfferCard';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
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
const HubNumbers = lazy(() =>
  import('./MyNumbers').then((m) => ({ default: m.MyNumbers }))
);
const HubContests = lazy(() =>
  import('./Contests').then((m) => ({ default: m.Contests }))
);
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
  { key: 'briefs', label: 'Campaigns & briefs', soon: 'Next' },
  { key: 'studio', label: 'Creative studio', soon: 'Later' },
] as const;

/*
 * WHAT IS ACTUALLY BEHIND A TAB, and the honesty is the point.
 *
 * My numbers, Contests and Leaderboards are real screens with real data, so
 * they open. Campaigns & briefs and Creative studio have no table, no rows and
 * no screen anywhere in this repo, so they stay marked and unclickable rather
 * than opening an empty room. Rashid asked for every section that is possible,
 * and these two are not yet possible.
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
            When Wurx opens a brand to you, it appears here with its own space:
            its offers, its contests and your numbers for it.
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
        <Overview
          brand={brand}
          products={products ?? []}
          loading={productsLoading}
          offerCount={offers?.length ?? 0}
          onSeeOffers={() => go('offers')}
        />
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

function Overview({
  brand,
  products,
  loading,
  offerCount,
  onSeeOffers,
}: {
  brand: CreatorBrand;
  products: CreatorProduct[];
  loading: boolean;
  offerCount: number;
  onSeeOffers: () => void;
}) {
  return (
    <div className="mt-6 grid max-w-5xl gap-8">
      <section>
        <SectionHeading>Meet the brand</SectionHeading>
        {brand.description ? (
          <p className="text-muted mt-3 max-w-3xl leading-relaxed whitespace-pre-line">
            {brand.description}
          </p>
        ) : (
          <p className="text-faint mt-3 text-[0.875rem] leading-relaxed">
            This brand has not written its introduction yet.
          </p>
        )}

        {offerCount > 0 ? (
          <Button variant="secondary" size="sm" className="mt-5" onClick={onSeeOffers}>
            See {offerCount} {offerCount === 1 ? 'offer' : 'offers'}
          </Button>
        ) : null}
      </section>

      <section>
        <SectionHeading>What they sell</SectionHeading>

        {loading ? (
          <ul className="mt-3 grid gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="wx-skeleton h-16 rounded-xl" />
            ))}
          </ul>
        ) : products.length === 0 ? (
          <div className="border-line bg-surface-1 mt-3 rounded-xl border px-6 py-12 text-center shadow-md">
            <Package size={24} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">Products are on their way</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              The brand has not listed its products here yet. They appear with the commission
              you earn on each one.
            </p>
          </div>
        ) : (
          <ul className="border-line mt-3 overflow-hidden rounded-2xl border">
            {products.map((product, i) => (
              <li
                key={product.id}
                className={cn(
                  'bg-surface-1 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5',
                  i > 0 && 'border-line border-t'
                )}
              >
                <span className="border-line bg-surface-2 grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="size-full object-cover" />
                  ) : (
                    <Package size={16} aria-hidden className="text-faint" />
                  )}
                </span>

                <span className="min-w-0 flex-1 basis-40">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold break-words">{product.name}</span>
                    {product.badge_title ? (
                      <span className="bg-accent-soft text-accent rounded-full px-2 py-0.5 text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
                        {product.badge_title}
                      </span>
                    ) : null}
                  </span>
                  {product.price !== null ? (
                    <span className="font-display text-muted mt-0.5 block text-[0.8125rem]">
                      {money(product.price, product.currency)}
                    </span>
                  ) : null}
                </span>

                {/* The number they actually came for. */}
                {percent(product.commission_rate) ? (
                  <span className="shrink-0 text-right">
                    <span className="font-display text-accent block text-[1.1875rem] font-semibold">
                      {percent(product.commission_rate)}
                    </span>
                    <span className="text-muted block text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
                      Your cut
                    </span>
                  </span>
                ) : null}
              </li>
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
  // How much of each job here has been filmed. Cached by TanStack Query, so
  // this is the same read the offers list and the home screen already made.
  const { data: progress } = useMyJobProgress();

  if (loading) {
    return (
      <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="wx-skeleton h-52 rounded-xl" />
        ))}
      </ul>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="border-line bg-surface-1 mt-6 max-w-2xl rounded-xl border px-6 py-14 text-center shadow-md">
        <Ticket size={26} aria-hidden className="text-faint mx-auto" />
        <p className="mt-4 font-semibold">No offers open right now</p>
        <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
          {brandName} has nothing on the table at the moment. New offers land here as soon as
          they go live.
        </p>
      </div>
    );
  }

  /*
   * The newest request per offer wins.
   *
   * A creator can be rejected and ask again, so an offer can carry several
   * rows. `mine` arrives newest first, so the first match is the one that
   * describes where they stand today.
   */
  const latestFor = (offerId: string) => mine.find((a) => a.offer_id === offerId) ?? null;

  return (
    <>
      <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {offers.map((offer, i) => (
          <m.li
            key={offer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
          >
            <OfferCard
              offer={offer}
              request={latestFor(offer.id) ?? undefined}
              progress={progress?.get(latestFor(offer.id)?.id ?? '')}
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
    </>
  );
}
