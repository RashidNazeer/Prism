import { Fragment, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { m } from 'motion/react';
import { ArrowRight, Check, ChevronDown, Flag, Package, Ticket, Trophy } from 'lucide-react';
import { DataError, EmptyState } from '@/components/ui/DataState';
import { useMyStanding } from '@/lib/creator/useLeaderboard';
import { ApplyDialog } from '@/components/creator/ApplyDialog';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { OfferCard } from '@/components/creator/OfferCard';
import { Button, ButtonLink } from '@/components/ui/Button';
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
import { NeoCardSkeleton } from '@/components/brand/NeoSkeleton';
import { useTheme } from '@/components/theme/theme-context';
import { BrandChip } from '@/components/brand/BrandWorldHero';
import { FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import {
  DEFAULT_BRAND_COLOR,
  deriveBrandTheme,
  paletteToAccentVars,
  readBrandThemeConfig,
} from '@/lib/brand-theme';
import { useCreatorBrands } from '@/lib/creator/useCreatorBrands';
import { BrandHeader } from '@/components/creator/brand/BrandHeader';
import { useBrandMiniStats } from '@/components/creator/brand/useBrandMiniStats';

/*
 * THE THREE REAL SECTIONS ARE THE SAME SCREENS THE SIDEBAR ALREADY OPENS, each
 * handed this hub's brand id. Not a copy: one screen, two places it lives, so a
 * fix to the numbers can never land in one and miss the other.
 *
 * Lazily, and this matters. My numbers pulls in the charts, and Leaderboards
 * pulls in avatars and signed storage URLs. Importing them at the top would
 * fold all three into the Brand Hub chunk, so a creator browsing a brand's
 * offers would download the whole numbers screen to look at a product list.
 */
const loadNumbers = () => import('./MyNumbers').then((mod) => ({ default: mod.MyNumbers }));
const loadContests = () => import('./Contests').then((mod) => ({ default: mod.Contests }));
const loadLeaderboards = () =>
  import('./Leaderboards').then((mod) => ({ default: mod.Leaderboards }));

const HubNumbers = lazy(loadNumbers);
const HubContests = lazy(loadContests);
const HubLeaderboards = lazy(loadLeaderboards);

const SECTION_LOADERS: Record<string, () => Promise<unknown>> = {
  numbers: loadNumbers,
  contests: loadContests,
  leaderboards: loadLeaderboards,
};

/**
 * START DOWNLOADING THE SECTION'S JAVASCRIPT THE MOMENT THE ROUTE MOUNTS.
 *
 * `lazy()` only fetches a chunk when the component first renders, and that is
 * after the brand has resolved, so the network sat idle through the brand read.
 * Calling the same `import()` early puts the chunk in flight alongside the data.
 * The module cache makes it free when `lazy` asks for it again.
 *
 * The section being opened goes first; the others wait for an idle moment so
 * a creator who only wants the offers does not compete with them for bandwidth.
 */
function useWarmSectionChunks(section: string) {
  useEffect(() => {
    void SECTION_LOADERS[section]?.();

    const rest = Object.entries(SECTION_LOADERS).filter(([key]) => key !== section);
    const run = () => {
      for (const [, load] of rest) void load();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1500);
    return () => window.clearTimeout(id);
  }, [section]);
}

/**
 * Starts the creator's job progress read at once on the Offers tab, instead of
 * when the offers list finally renders. It needs no brand id (the view is
 * filtered by row level security) and shares its cache entry with `Offers`.
 */
function WarmJobProgress() {
  useMyJobProgress();
  return null;
}

/** Skeletons, never a bare spinner. Roughly the shape of what is arriving. */
function SectionLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <NeoCardSkeleton key={i} className="h-24" />
        ))}
      </div>
      <NeoCardSkeleton className="h-64" />
    </div>
  );
}

/**
 * A Brand Hub, as a creator sees it.
 *
 * REDESIGNED 2026-10-16 (§10 of the redesign brief). The half-screen brand
 * hero is gone and a BRAND HEADER takes its place: logo, name and her measured
 * figures on this brand. The sections are a SEGMENTED CONTROL at the foot of
 * that header rather than a filter row of their own, which is one fewer
 * blurred surface and one fewer row of chrome between a creator and the thing
 * she came to read.
 *
 * REWORKED AGAIN 2026-10-17, after Rashid used it: *"brands hub is really
 * difficult for creators to operate work on the UX"*. Three changes, each with
 * its own note below, and ONE RULE BEHIND ALL OF THEM: an absent thing takes
 * less room than a present one.
 *
 *   - `Overview` leads with what she can act on and says what a brand has not
 *     filled in once, in one line, instead of in three full-height cards.
 *   - `HubSection` no longer numbers the regions 1–5, because they are not
 *     steps and numbering them promised a process she was failing at.
 *   - `SECTIONS` is five grouped tabs that wrap, not six that scroll sideways
 *     with a dead one among them.
 *
 * It still opens on Overview rather than Offers, which is the opposite of the
 * admin hub. An admin arrives at a brand to do a job. A creator arrives to
 * decide whether they want to work with it at all — but that decision starts
 * with what is on the table, so the FIRST THING INSIDE Overview is now their
 * offers and contests rather than the brand's introduction.
 *
 * EVERY SECTION THAT EXISTED STILL EXISTS, and every URL still resolves:
 * `/app/brands`, `/app/brands/:slug`, and `?section=overview|offers|numbers|`
 * `contests|leaderboards`. Nothing a creator could reach before either
 * redesign is unreachable after this one.
 *
 * WHAT IT NEVER READS: the client behind a brand, or the budget allocated to
 * it. Both live in `brand_commercials` behind a staff-only policy, and no hook
 * this file touches selects either column.
 */
/*
 * FIVE DESTINATIONS, GROUPED, AND THE SIXTH IS NOT A TAB ANY MORE.
 *
 * Rashid, 2026-10-17: "brands hub is really difficult for creators to operate",
 * and: "Six sections for one brand, one of them permanently disabled, is a lot
 * of navigation for a screen reached by tapping a brand."
 *
 * He is right, and the row had three separate problems:
 *
 *   1. A DISABLED TAB IS FURNITURE. "Creators Library NEXT" could never be
 *      tapped, yet it took a slot in the control and a share of the width. It
 *      is still named — he asked for it by name on 2026-10-07 and a creator
 *      should see the shape of what is coming — but as a quiet line UNDER the
 *      control rather than as a thing that looks tappable and is not.
 *   2. THE ROW SCROLLED SIDEWAYS. It was `flex-nowrap` inside an
 *      `overflow-x-auto`, which put "Leaderboards" off the edge of a 375px
 *      phone. `FilterBar`'s own note says why that is wrong: "a row that
 *      scrolls sideways hides a filter behind an edge, and on a phone nobody
 *      finds it." `FilterTabs` already wraps; the hub was overriding it.
 *   3. FIVE PEERS, THREE OF WHICH ARE HERS NOT THE BRAND'S. `this brand`,
 *      `Offers` and `Contests` are about the brand and are what she came for.
 *      `My numbers` and `Leaderboards` are her own screens, narrowed to this
 *      brand, and already in the sidebar. They are grouped second, after a
 *      hairline, so the row reads as "the brand, then you" instead of five
 *      equal choices.
 *
 * `overview` is still first and still the default, so every existing link,
 * every `?section=` in `scripts/`, and the no-slug redirect are unchanged. It
 * is labelled "This brand" because "Overview" names a shape rather than a
 * subject, and its CONTENT now leads with what she can act on — see `Overview`.
 */
const SECTIONS = [
  { key: 'overview', label: 'This brand', group: 'brand' },
  { key: 'offers', label: 'Offers', group: 'brand' },
  { key: 'contests', label: 'Contests', group: 'brand' },
  { key: 'numbers', label: 'My numbers', group: 'mine' },
  { key: 'leaderboards', label: 'Leaderboards', group: 'mine' },
] as const;

/**
 * NAMED, NOT NAVIGABLE. Nothing is behind the Creators Library yet — no table,
 * no rows, no screen in this repo — so it is a sentence rather than a control
 * that cannot be used. Rashid asked for the name to be visible; he did not ask
 * for a dead button.
 */
const NEXT_UP = { label: 'Creators Library', when: 'Next' } as const;

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
  const {
    data: brands,
    isLoading: brandsLoading,
    isError: brandsError,
    refetch: refetchBrands,
  } = useCreatorBrands();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const requested = params.get('section') ?? 'overview';
  const section = BUILT.has(requested) ? requested : 'overview';

  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  // Admin edits to brands, offers and products land here without a reload.
  useCatalogueLive();
  useWarmSectionChunks(section);

  const { data: brand, isLoading, isError, refetch: refetchBrand } = useCreatorBrand(slug);
  const { data: offers, isLoading: offersLoading } = useCreatorOffers(brand?.id);
  const {
    data: products,
    isLoading: productsLoading,
    isError: productsError,
    refetch: refetchProducts,
  } = useCreatorProducts(brand?.id);
  const { data: mine } = useMyOfferApplications(brand?.id);

  /*
   * SWITCHING SECTION KEEPS THE PERIOD AND LOCKS THE BRAND.
   *
   * The period (`?period`, `?from`, `?to`) is carried across, because somebody
   * who chose 7 days to read their numbers has not changed their mind about the
   * window by tapping Contests and back.
   *
   * `?brand` is this hub's brand, and it is set rather than carried: My numbers
   * no longer takes a `brandId` prop — §6 moved its period and brand into the
   * URL so Home and that screen share one state — so the URL IS how the brand
   * filter is locked now. See the effect below, which holds the lock.
   */
  const go = (key: string) => {
    const p = new URLSearchParams();
    for (const carry of ['period', 'from', 'to']) {
      const value = params.get(carry);
      if (value) p.set(carry, value);
    }
    if (key !== 'overview') p.set('section', key);
    if (key === 'numbers' && brand) p.set('brand', brand.id);
    setParams(p, { replace: true });
  };

  /*
   * THE BRAND FILTER STAYS LOCKED TO THE HUB YOU ARE STANDING IN.
   *
   * My numbers carries its own brand chip, and inside a hub that chip would
   * otherwise leave the header saying one brand while the figures under it
   * describe another. Two answers, depending on which half of the screen you
   * read.
   *
   * So: a brand that is not this one snaps back — unless it is a brand she has
   * a hub for, in which case the chip is honoured by MOVING to that hub, which
   * is the one reading where both halves end up telling the truth.
   */
  useEffect(() => {
    if (section !== 'numbers' || !brand) return;
    const picked = params.get('brand');
    if (picked === brand.id) return;

    /* A LINK CAN ARRIVE BEFORE THE HUB LIST DOES. Snapping back while the list
       is still in flight would throw away a brand she deliberately linked to,
       so a pick we cannot place yet waits for the list rather than losing. */
    if (picked && !brands) return;

    const other = picked ? brands?.find((b) => b.id === picked) : undefined;
    if (other) {
      navigate(`/app/brands/${other.slug}?section=numbers&brand=${other.id}`, {
        replace: true,
      });
      return;
    }

    const p = new URLSearchParams(params);
    p.set('brand', brand.id);
    setParams(p, { replace: true });
  }, [section, brand, brands, params, setParams, navigate]);

  /*
   * NO SLUG MEANS "TAKE ME INTO A BRAND", not "show me a list of brands".
   * Rashid: "by default, one of the brand hub should be selected with it's own
   * theme". `/app/brands` therefore opens the first one rather than an index
   * page nobody asked for. Replace rather than push, so Back leaves the hub
   * instead of bouncing between the redirect and its target.
   */
  if (!slug) {
    if (brandsLoading) return <HubSkeleton />;
    /* D: the list failed. Not the same as "you have no hubs", so say so. */
    if (brandsError) {
      return (
        <DataError
          title="Your brand hubs would not load"
          body="Something went wrong on our side, not yours. Try again in a moment."
          onRetry={() => refetchBrands()}
        />
      );
    }
    const first = brands?.[0];
    if (first) return <Navigate to={`/app/brands/${first.slug}`} replace />;
    /*
     * C: NO BRANDS AT ALL is a real state with its own answer, not an error. It
     * is what an approved creator sees before anybody has opened a hub to them,
     * and falling through to "that brand hub is not open" would tell them
     * something had broken when nothing had.
     */
    return (
      <EmptyState
        title="You are not in a brand hub yet"
        body="When a brand opens its hub to you, it appears here with its own space: what it sells, what it wants from you, its offers and contests, and where you rank."
        action={
          <ButtonLink to="/app" variant="secondary" size="sm">
            Back to your dashboard
          </ButtonLink>
        }
      />
    );
  }

  if (!approved) {
    return <LockedUntilApproved />;
  }

  if (isLoading) return <HubSkeleton />;

  if (isError) {
    return (
      <DataError
        title="This brand hub would not load"
        body="Something went wrong on our side, not yours. Nothing is lost."
        onRetry={() => refetchBrand()}
      />
    );
  }

  if (!brand) {
    return (
      <EmptyState
        title="That brand hub is not open"
        body="It may have been retired, or it may not be one of yours. Nothing else is affected."
        action={
          <ButtonLink to="/app/brands" variant="secondary" size="sm">
            Back to brand hubs
          </ButtonLink>
        }
      />
    );
  }

  return (
    <AccentScope brand={brand}>
      {section === 'offers' ? <WarmJobProgress /> : null}

      <HubHead
        brand={brand}
        brands={brands?.length ? brands : [brand]}
        section={section}
        /* Undefined while the offers read is in flight, so the tab shows no
           count rather than a zero that is really "we do not know yet". */
        offerCount={offersLoading ? undefined : offers?.length}
        onSection={go}
      />

      <div className="min-w-0 flex-1">
        {section === 'offers' ? (
          <Offers
            offers={offers ?? []}
            mine={mine ?? []}
            loading={offersLoading}
            brandName={brand.name}
          />
        ) : section === 'numbers' ? (
          /*
            NO `brandId` PROP ANY MORE, and that is not an omission. §6 moved
            this screen's period and brand into the URL so Home and My numbers
            share one state, so the prop is gone upstream; `?brand=` above is
            what narrows it to this hub.
          */
          <Suspense fallback={<SectionLoading />}>
            <HubNumbers />
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
            failed={productsError}
            onRetry={() => refetchProducts()}
            offers={offers ?? []}
            mine={mine ?? []}
            offersLoading={offersLoading}
            onSection={go}
          />
        )}
      </div>
    </AccentScope>
  );
}

/*
 * THREE NAMED EXPORTS FOR `/dev/brand-hub`, AND NOTHING ELSE USES THEM.
 *
 * `AccentScope`, `SectionControl` and `Overview` are exported so the dev-only
 * preview at `src/routes/dev/BrandHubPreview.tsx` can render THE REAL
 * COMPONENTS against made-up data. Nobody on this machine has a creator login
 * and Supabase is unreachable from it, so without that page every claim about
 * this screen's spacing, its dark face and its empty states would be a claim
 * about code that had never been rendered. A copy in the preview would be
 * worse than no preview: it would drift, and then agree with itself.
 *
 * They are not part of any public surface. The preview route is behind
 * `import.meta.env.DEV` and is absent from a production build, so these are
 * reachable only from a module that does not ship.
 */
/**
 * THE BRAND, AS AN ACCENT. This is the whole of what a hub repaints.
 *
 * It sets the accent-family tokens and the header's colours on THIS element, so
 * they reach only the hub's subtree and leaving the route is enough to undo
 * them. The page ground, the rail, the top bar and every surface, text and
 * border token are PRISM's and are never touched here.
 *
 * It must not carry a `backdrop-filter`: nothing above `.wurxbase-root` may,
 * and keeping this element plain means it can never become one of them.
 *
 * `data-brand-world` is kept because `scripts/shots-hub.mjs` finds the hub by it.
 *
 * Still follows the theme toggle: the brand has a dark face and a light face,
 * derived separately, so a creator working at night stays in the dark. Memoised
 * because the derivation is a few hundred contrast measurements and would
 * otherwise run on every render of the hub, including each keystroke inside it.
 */
export function AccentScope({
  brand,
  children,
}: {
  brand: CreatorBrand;
  children: React.ReactNode;
}) {
  const { resolved } = useTheme();
  const vars = useMemo(() => {
    const theme = deriveBrandTheme(
      brand.brand_color ?? DEFAULT_BRAND_COLOR,
      readBrandThemeConfig(brand.theme)
    );
    return paletteToAccentVars(resolved === 'dark' ? theme.dark : theme.light);
  }, [brand.brand_color, brand.theme, resolved]);

  return (
    <div
      data-brand-world={brand.slug}
      style={vars as React.CSSProperties}
      className="flex min-w-0 flex-col gap-4"
    >
      {children}
    </div>
  );
}

/**
 * The header, with her figures in it and the section control at its foot.
 *
 * A COMPONENT OF ITS OWN SO THE READS ONLY HAPPEN WHEN THERE IS A BRAND. The
 * three performance reads hang off `brand.id`, and calling them from `BrandHub`
 * would mean an applicant, or anybody on the loading path, firing an all-brands
 * window read for a screen they are never shown.
 */
function HubHead({
  brand,
  brands,
  section,
  offerCount,
  onSection,
}: {
  brand: CreatorBrand;
  brands: CreatorBrand[];
  section: string;
  offerCount: number | undefined;
  onSection: (key: string) => void;
}) {
  const stats = useBrandMiniStats(brand.id);

  return (
    <BrandHeader
      brand={brand}
      stats={stats}
      action={
        brands.length > 1 ? (
          <BrandSwitcher brand={brand} brands={brands} section={section} />
        ) : undefined
      }
    >
      <SectionControl
        brand={brand}
        section={section}
        offerCount={offerCount}
        onSection={onSection}
      />
    </BrandHeader>
  );
}

/**
 * The sections, as a segmented control that WRAPS rather than scrolls.
 *
 * `wx-tap-row` rather than hand-written heights: it is the house utility that
 * gives every control in a row a 44px floor below `sm` and lets it be dense
 * above, so the thumb rule is kept in one place instead of in forty.
 *
 * The hairline before "My numbers" is the only thing marking the two groups
 * described on `SECTIONS`. It is `aria-hidden` and the tablist is still one
 * tablist with five tabs, because the grouping is a reading aid and not a
 * second navigation: a screen reader should hear five choices, not two lists.
 *
 * THE OFFER COUNT IS ON THE TAB because it is the one number that changes
 * whether she taps it, and it is already in hand from the hub's own read. A
 * zero is not shown: "Offers 0" invites a tap that finds nothing.
 */
export function SectionControl({
  brand,
  section,
  offerCount,
  onSection,
}: {
  brand: CreatorBrand;
  section: string;
  offerCount: number | undefined;
  onSection: (key: string) => void;
}) {
  return (
    <div className="wx-tap-row">
      <FilterTabs label={`${brand.name} sections`}>
        {SECTIONS.map((s, i) => (
          <Fragment key={s.key}>
            {s.group === 'mine' && SECTIONS[i - 1]?.group !== 'mine' ? (
              <span aria-hidden className="bg-line mx-1 hidden h-5 w-px shrink-0 sm:block" />
            ) : null}
            <FilterTab
              active={s.key === section}
              count={s.key === 'offers' && offerCount ? offerCount : undefined}
              onClick={() => onSection(s.key)}
            >
              {s.label}
            </FilterTab>
          </Fragment>
        ))}
      </FilterTabs>

      <p className="text-muted mt-2 text-[0.6875rem] leading-snug">
        <span className="font-semibold tracking-[0.1em] uppercase">{NEXT_UP.when}</span>
        <span className="mx-1.5" aria-hidden>
          ·
        </span>
        {NEXT_UP.label} opens here when it is ready.
      </p>
    </div>
  );
}

/** The other hubs, pinned to the top right of the header. */
/**
 * ONE CONTROL, NOT A ROW OF EVERY BRAND SHE HAS.
 *
 * Rashid, of the old version: "the brands list is not practical". It was a
 * horizontally scrolling `<ul>` of every hub she can open, pinned to the top
 * right of the header. At four brands it already crowded the brand's own name
 * and collided with the sticky top bar when the page scrolled; at ten it is a
 * sideways scroll nobody discovers, in the corner furthest from a thumb.
 *
 * It is a dropdown now: the brand you are on, and a list when you want
 * another. The same shape as the brand filter on Home and My numbers, so the
 * control that changes which brand you are looking at is one control
 * everywhere in the product.
 *
 * It renders nothing at all for a creator with a single hub — a switcher
 * offering one choice is furniture.
 */
function BrandSwitcher({
  brand,
  brands,
  section,
}: {
  brand: CreatorBrand;
  brands: CreatorBrand[];
  section: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-brand-switcher]')) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  if (brands.length < 2) return null;

  /* The section travels with you, and so does the brand lock when the section
     is the one that needs it. */
  const hrefFor = (b: CreatorBrand) =>
    section === 'overview'
      ? `/app/brands/${b.slug}`
      : section === 'numbers'
        ? `/app/brands/${b.slug}?section=numbers&brand=${b.id}`
        : `/app/brands/${b.slug}?section=${section}`;

  return (
    <div data-brand-switcher className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Brand: ${brand.name}. Switch brand`}
        className="wx-neo-raised-sm text-text flex min-h-11 items-center gap-2 rounded-full px-3 text-[0.8125rem] font-medium sm:min-h-9"
      >
        <BrandChip brand={brand} size={20} />
        <span className="max-w-[9rem] truncate">{brand.name}</span>
        <ChevronDown aria-hidden className="text-muted size-3.5 shrink-0" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Your brands"
          className="wx-neo-raised absolute end-0 z-40 mt-1 max-h-80 w-60 overflow-auto rounded-xl p-1"
        >
          {brands.map((b) => {
            const active = b.slug === brand.slug;
            return (
              <li key={b.id}>
                <Link
                  to={hrefFor(b)}
                  role="option"
                  aria-selected={active}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'hover:bg-surface-2 flex min-h-11 items-center gap-2 rounded-md px-2 text-[0.8125rem]',
                    active ? 'text-text font-semibold' : 'text-muted'
                  )}
                >
                  <BrandChip brand={b} size={20} />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {active && <Check aria-hidden className="size-3.5 shrink-0" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** While we work out which brand to open. Skeletons, never a bare spinner. */
function HubSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="wx-skeleton h-56 rounded-2xl" />
      <div className="wx-skeleton h-64 rounded-2xl" />
    </div>
  );
}

/* --------------------------------------------------------- in-panel parts -- */

/**
 * A quiet note INSIDE a glass panel.
 *
 * `EmptyState` and `DataError` cannot be used in here: both wear
 * `wx-neo-raised`, which carries a `backdrop-filter`, and nesting one inside
 * the panel's own blur is the exact thing §2 forbids. Same words, same shape,
 * an inset well instead of a second sheet of glass.
 */
function HubNote({
  title,
  body,
  action,
  tone = 'quiet',
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  tone?: 'quiet' | 'wrong';
}) {
  return (
    <div
      role={tone === 'wrong' ? 'alert' : undefined}
      className={cn(
        'wx-neo-inset min-w-0 rounded-xl px-4 py-4',
        tone === 'wrong' && 'bg-danger-soft'
      )}
    >
      <p
        className={cn(
          'text-[0.9375rem] leading-snug font-semibold',
          tone === 'wrong' && 'text-danger'
        )}
      >
        {title}
      </p>
      <p className="text-muted mt-1.5 max-w-prose text-[0.8125rem] leading-relaxed">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * A labelled region of the overview.
 *
 * THE NUMBERS ARE GONE — 2026-10-17. Each heading used to carry a counted
 * accent chip: "1 MEET THE BRAND", "2 WHAT THEY SELL", "3 WHAT TO MAKE", "4
 * OFFERS AND CONTESTS", "5 WHERE YOU RANK". Rashid: "The numbering implies a
 * sequence that is not one — they are not steps she takes." Exactly so. Nobody
 * reads the brand's introduction and then does step two; a creator jumps to the
 * one she wants. Worse, numbering five regions of which three were usually
 * empty made the screen read as a five-step process she was failing at.
 *
 * `title` is also the anchor, so these regions keep their headings in the
 * accessibility tree and a screen reader can still jump between them.
 */
function HubSection({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  /** An optional quiet thing on the right of the heading, e.g. a count. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`hub-${id}`} className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id={`hub-${id}`}
          className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase"
        >
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------- overview -- */

/**
 * THE BRAND'S ROOM, REBUILT 2026-10-17 AROUND WHAT A CREATOR CAME FOR.
 *
 * Rashid, after using it: *"brands hub is really difficult for creators to
 * operate work on the UX"*. The diagnosis, in order of how much room each
 * problem wasted:
 *
 *  A. IT LED WITH THE LEAST ACTIONABLE THING AND BURIED THE MOST. The first
 *     screen was "1 MEET THE BRAND" - a paragraph the brand has usually not
 *     written - and the two things she can actually act on, their offers and
 *     their contests, were two link rows in a right-hand column, which on a
 *     phone is BELOW the brand introduction, the product grid and the briefs
 *     placeholder. On Swisse that is a screen and a half of scrolling to reach
 *     the only taps worth making.
 *
 *  B. AN ABSENT THING COST MORE ROOM THAN A PRESENT ONE. "Swisse has not
 *     written its introduction yet", "Products are on their way", "Briefs are
 *     on their way" - three full-height cards, each a heading plus a paragraph
 *     plus padding, which between them said nothing. `WhatToMake` had no data
 *     source anywhere in the database, so that one was empty on every brand,
 *     forever. A creator scrolled a screen and a half to learn there was
 *     nothing to learn.
 *
 *  C. THE NUMBERS PROMISED A PROCESS. See `HubSection`.
 *
 * SO: the first thing in the panel is now what she can do with this brand
 * right now, beside where she ranks on it. Products come next, because a photo
 * of a thing with "your cut" on it is worth more than prose. The brand's own
 * words come after that, and ONLY if it wrote any. Everything the brand has
 * not filled in is ONE LINE at the foot - not a card each, and not a card at
 * all. And when a brand has filled in nothing whatsoever, the panel says so
 * once, in one note, and points at what she can still do.
 *
 * ONE PANEL, MANY WIDGETS, unchanged and still load-bearing. Each card in here
 * used to be `wx-neo-raised` - a products grid alone put six backdrop-filters
 * on the page, against a budget of three. The panel is the only blurred
 * surface; everything inside it is the same material with the blur left off.
 */
export function Overview({
  brand,
  products,
  loading,
  failed,
  onRetry,
  offers,
  mine,
  offersLoading,
  onSection,
}: {
  brand: CreatorBrand;
  products: CreatorProduct[];
  loading: boolean;
  failed: boolean;
  onRetry: () => Promise<unknown>;
  offers: CreatorOffer[];
  mine: MyOfferApplication[];
  offersLoading: boolean;
  onSection: (key: string) => void;
}) {
  /*
   * THE SAME `bucketFor` THE OFFERS SECTION USES, deliberately. The count on
   * this summary and the count on the tab a creator lands on after tapping it
   * MUST agree, and working the answer out twice is how "3 open to you" comes
   * to show two cards.
   */
  const openCount = offers.filter(
    (offer) => bucketFor(mine.find((a) => a.offer_id === offer.id)) === 'open'
  ).length;
  const onItCount = offers.length - openCount;

  const hasProducts = products.length > 0;
  const showProducts = loading || failed || hasProducts;

  /*
   * WHAT THIS BRAND HAS NOT FILLED IN, as a list of nouns for one sentence.
   *
   * Products are only counted as missing once we KNOW they are missing: a read
   * in flight, or a read that failed, is not an absence, and `WhatTheySell`
   * says each of those in its own words instead.
   *
   * Briefs are always on the list. Nothing in the database holds creative
   * direction for a brand - no column, no table - so there is nothing to
   * render and nothing to invent. The constant stays so that the day a briefs
   * source exists, this line stops mentioning them in one edit.
   */
  const briefsMissing = true;
  const missing: string[] = [];
  if (!brand.description) missing.push('an introduction');
  if (!loading && !failed && !hasProducts) missing.push('products');
  if (briefsMissing) missing.push('briefs');

  /*
   * NOTHING AT ALL IS ONE STATE WITH ONE ANSWER, not four empty cards. When a
   * brand has no introduction, no products and no offers, every region above
   * would be an apology, so the panel says it once and points at the two
   * things that still work: its contests, and her own figures for it.
   */
  const bare =
    !brand.description &&
    !loading &&
    !failed &&
    !hasProducts &&
    !offersLoading &&
    offers.length === 0;

  return (
    <div className="wx-neo-raised min-w-0 rounded-2xl p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          {bare ? (
            <HubNote
              title={`${brand.name} has not filled in its hub yet`}
              body={`No introduction, no products and no offers so far. Nothing is broken and nothing is waiting on you — they appear here the moment ${brand.name} adds them.`}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onSection('contests')}>
                    Their contests
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onSection('numbers')}>
                    Your numbers
                  </Button>
                </div>
              }
            />
          ) : (
            <ActOnThis
              openCount={openCount}
              onItCount={onItCount}
              loading={offersLoading}
              onSection={onSection}
            />
          )}

          <HubStanding brand={brand} onSection={onSection} />
        </div>

        {showProducts ? (
          <WhatTheySell
            brand={brand}
            products={products}
            loading={loading}
            failed={failed}
            onRetry={onRetry}
          />
        ) : null}

        {brand.description ? <AboutBrand brand={brand} /> : null}

        {/*
          EVERYTHING ABSENT, IN ONE LINE. This replaces up to three
          full-height cards that each said a version of "on its way". It is
          last, because what a brand has NOT done is the least important thing
          on a screen about what she can do. It is `text-muted` rather than
          `text-faint` even so: it carries what three cards used to carry, and
          `text-faint` measures 4.31:1 on surface-2 in light mode, which is
          under AA — see the note in `FilterBar`.
        */}
        {!bare && missing.length > 0 ? (
          <p className="text-muted max-w-prose text-[0.8125rem] leading-relaxed">
            Not from {brand.name} yet: {listOut(missing)}. You will find them here when they
            land
            {briefsMissing
              ? ' — briefs are the angles that convert, the hooks to open with, and what to avoid.'
              : '.'}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** "a, b and c" - so the one-line summary of what is missing reads as English. */
function listOut(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * WHAT SHE CAN DO WITH THIS BRAND RIGHT NOW. The first thing in the panel.
 *
 * Two rows, each a real destination, each carrying the one number that decides
 * whether it is worth a tap. It replaces the old "4 OFFERS AND CONTESTS"
 * block, which held the same two links in the last column of a five-region
 * grid - so on a phone they arrived after everything the brand had not written.
 *
 * THE OFFER COUNT IS SPLIT INTO "OPEN TO YOU" AND "YOU ARE ON", because those
 * are two different questions and a single total answers neither. A brand with
 * four offers she is already on and nothing new is not a brand with four
 * offers waiting.
 *
 * THE CONTEST COUNT IS STILL NOT FETCHED, and that is the same decision as
 * before: it would be a second read for a number that is one tap away, and the
 * contest catalogue is the heaviest module in the creator app. The row is
 * honest about being a destination rather than a count.
 */
function ActOnThis({
  openCount,
  onItCount,
  loading,
  onSection,
}: {
  openCount: number;
  onItCount: number;
  loading: boolean;
  onSection: (key: string) => void;
}) {
  /* A READ IN FLIGHT IS NOT A ZERO. "Nothing open right now" while the offers
     are still arriving is a lie that lasts half a second and sends her away. */
  const offerNote = loading
    ? 'Checking what is open'
    : openCount > 0
      ? `${openCount} open to you${onItCount > 0 ? `, ${onItCount} you are on` : ''}`
      : onItCount > 0
        ? `${onItCount} you are on. Nothing new open just now`
        : 'Nothing open right now. New ones land here';

  return (
    <HubSection id="now" title="What you can do now">
      <div className="flex flex-col gap-3">
        <HubLink
          icon={<Ticket size={17} />}
          title="Their offers"
          note={offerNote}
          onClick={() => onSection('offers')}
        />
        <HubLink
          icon={<Flag size={17} />}
          title="Their contests"
          note="Live and past, for this brand only"
          onClick={() => onSection('contests')}
        />
      </div>
    </HubSection>
  );
}

/**
 * THE BRAND'S OWN WORDS, and only when there are some.
 *
 * `brands.description` is the whole of it. The founder line that used to sit
 * under it - "A word from the founder is on its way" - is gone: there is no
 * founder field anywhere in the database, so it was a promise this screen had
 * no way to keep, printed on every brand, under an introduction that was
 * itself usually absent. When a founder column exists it goes here.
 *
 * It is below the products on purpose. A photograph of a thing with "your cut"
 * on it tells a creator more about whether to work with a brand than a
 * paragraph does.
 */
function AboutBrand({ brand }: { brand: CreatorBrand }) {
  return (
    <HubSection id="about" title={`About ${brand.name}`}>
      <div className="wx-neo-raised-sm rounded-xl p-4">
        <p className="max-w-prose text-[0.9375rem] leading-relaxed break-words">
          {brand.description}
        </p>
      </div>
    </HubSection>
  );
}

/** What they sell, each product with the commission rate the creator earns. */
function WhatTheySell({
  brand,
  products,
  loading,
  failed,
  onRetry,
}: {
  brand: CreatorBrand;
  products: CreatorProduct[];
  loading: boolean;
  failed: boolean;
  onRetry: () => Promise<unknown>;
}) {
  return (
    <HubSection
      id="sell"
      title="What they sell"
      /* The count on the heading, so a long grid says how long it is before
         she starts scrolling it. Omitted at zero and while the read is in
         flight: a count of nothing is not a count. */
      aside={
        products.length > 0 ? (
          <span className="text-faint text-[0.75rem]">
            <span className="wx-numeric">{products.length}</span>{' '}
            {products.length === 1 ? 'product' : 'products'}
          </span>
        ) : null
      }
    >
      {loading ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-[17rem] rounded-xl" />
          ))}
        </ul>
      ) : failed ? (
        <HubNote
          tone="wrong"
          title="The products would not load"
          body={`We could not reach ${brand.name}'s products. This is not the same as them having none.`}
          action={
            <Button variant="secondary" size="sm" onClick={() => void onRetry()}>
              Try again
            </Button>
          }
        />
      ) : products.length === 0 ? (
        /*
          A LINE, NOT A CARD. `Overview` does not even render this region when
          a brand has no products — the foot of the panel names them in its
          one-line list of what is missing instead. This branch is the backstop
          for any other caller, and it costs a line rather than the
          full-height "Products are on their way" card it replaced.
        */
        <p className="text-muted text-[0.8125rem] leading-relaxed">
          No products listed yet. Each one arrives with the rate you earn on it.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product, i) => (
            <m.li
              key={product.id}
              /*
               * STAGGERED IN, and capped at six. Past that the last card in a
               * long list waits most of a second for its turn, which stops
               * reading as polish and starts reading as a slow page.
               */
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: 'easeOut', delay: Math.min(i, 6) * 0.04 }}
              className="group wx-neo-raised-sm relative flex flex-col overflow-hidden rounded-xl"
            >
              {/* The picture leads: a product a creator has never held is a photograph first. */}
              <div className="wx-neo-inset relative aspect-square overflow-hidden">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                ) : (
                  <span className="grid size-full place-items-center">
                    <Package size={24} aria-hidden className="text-faint" />
                  </span>
                )}

                {product.badge_title ? (
                  <span className="wx-neo-raised-sm text-accent absolute top-3 left-3 rounded-full px-2.5 py-1 text-[0.625rem] font-bold tracking-[0.12em] uppercase">
                    {product.badge_title}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3.5">
                <p className="text-[0.9375rem] leading-snug font-semibold break-words">
                  {product.name}
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  {product.price !== null ? (
                    <p className="font-display text-muted text-[0.875rem]">
                      {money(product.price, product.currency)}
                    </p>
                  ) : (
                    <span />
                  )}
                  {/*
                    THE RATE, NOT AN AMOUNT. `commission_rate` is the TERM on
                    this product — the percentage it pays — and it is the only
                    commission figure that exists anywhere in the creator data.
                    It is shown as a rate, never multiplied into an amount: no
                    table links a video to a product, so an amount would be a
                    guess wearing a figure's clothes. Omitted, never "0%", when
                    unset.
                  */}
                  {percent(product.commission_rate) ? (
                    <span className="wx-neo-raised-sm rounded-full [background-color:var(--wx-accent-fill)]! px-3 py-1 [color:var(--wx-on-accent-fill)]">
                      <span className="font-display text-[0.9375rem] leading-none font-bold">
                        {percent(product.commission_rate)}
                      </span>
                      <span className="ml-1.5 text-[0.625rem] font-semibold tracking-[0.1em] uppercase opacity-90">
                        your cut
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
            </m.li>
          ))}
        </ul>
      )}
    </HubSection>
  );
}

/*
 * `WhatToMake` IS GONE, 2026-10-17, and its absence is the point.
 *
 * It was "3 WHAT TO MAKE", a full-height card reading "Briefs are on their
 * way", and it had NO DATA SOURCE: nothing in the database holds creative
 * direction for a brand, so it rendered that same card on every brand, on
 * every visit, for every creator, and always would until a briefs table
 * exists. A region that can only ever be empty is not a region; it is a
 * sentence. It is one clause of the one-line list at the foot of `Overview`
 * now, and when a briefs source does exist this becomes a real section with
 * real content rather than a placeholder that was already occupying the room.
 */

/** A link row into one of the existing, brand-filtered sections. */
function HubLink({
  icon,
  title,
  note,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  note?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="wx-neo-raised-sm wx-neo-press group flex min-h-11 w-full items-center gap-3 rounded-xl p-3.5 text-left"
    >
      <span
        aria-hidden
        className="text-accent grid size-9 shrink-0 place-items-center rounded-md"
        style={{ background: 'var(--wx-accent-soft)' }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold">{title}</span>
        {note ? <span className="text-muted block text-[0.8125rem]">{note}</span> : null}
      </span>
      <ArrowRight
        size={16}
        aria-hidden
        className="text-faint shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </button>
  );
}

/** Stable across renders, so the standing read is cached rather than refired. */
const ALL_TIME_FROM = '2000-01-01';

/**
 * WHERE SHE RANKS ON THIS BRAND.
 *
 * Reads the same `my_leaderboard_standing` the Leaderboards section uses,
 * scoped to this brand. A creator with no figures here is not on the board,
 * which is a different fact from a failed read, and each is said in its own
 * words.
 *
 * BEING UNRANKED COSTS A LINE NOW, not a card. The unranked state is the
 * common one — most creators are not on most boards — and it used to be a
 * titled `HubNote` with a paragraph and a button, the same weight as a real
 * standing. An absent figure should take less room than a present one, so it
 * is one sentence with the link inside it. Only the FAILED read keeps a card,
 * because a failed read is a problem and a problem is worth a box.
 */
function HubStanding({
  brand,
  onSection,
}: {
  brand: CreatorBrand;
  onSection: (key: string) => void;
}) {
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const { data, isLoading, isError, refetch } = useMyStanding(ALL_TIME_FROM, to, brand.id);

  return (
    <HubSection id="rank" title="Where you rank">
      {isLoading ? (
        <div className="wx-skeleton h-24 rounded-xl" />
      ) : isError ? (
        <HubNote
          tone="wrong"
          title="Your ranking would not load"
          body="We could not reach this brand's leaderboard. It is not that you are unranked."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : data ? (
        <div className="wx-neo-raised-sm rounded-xl p-4">
          <p
            className="font-display text-[2rem] leading-none font-semibold"
            style={{ color: 'var(--wx-brand-accent-ink, var(--wx-accent))' }}
          >
            #{data.rank}
          </p>
          <p className="text-muted mt-2 text-[0.8125rem]">
            {data.total_creators > 0
              ? `of ${data.total_creators.toLocaleString()} creators at ${brand.name}`
              : `your place at ${brand.name}`}
          </p>
          <button
            type="button"
            onClick={() => onSection('leaderboards')}
            className="text-accent mt-2 inline-flex min-h-11 items-center gap-1.5 text-[0.8125rem] font-semibold"
          >
            See the full board
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      ) : (
        <p className="text-muted max-w-prose text-[0.8125rem] leading-relaxed">
          Not on this board yet — creators appear once their videos have sold something for{' '}
          {brand.name}.{' '}
          <button
            type="button"
            onClick={() => onSection('leaderboards')}
            className="text-accent inline-flex min-h-11 items-center gap-1.5 align-middle text-[0.8125rem] font-semibold"
          >
            <Trophy size={14} aria-hidden />
            See who is on it
          </button>
        </p>
      )}
    </HubSection>
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
 * questions anybody opens this section with, the tabs cut the list down when
 * there is genuinely more than one kind of thing here, and inside every view an
 * offer somebody is actually ON sorts above one they have not started.
 *
 * THE CARD GRID IS NOT WRAPPED IN A PANEL, deliberately. `OfferCard` brings its
 * own glass, and a panel around it would nest one blurred surface inside
 * another. The summary strip above is the small variant for the same reason.
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
      <div>
        <div className="wx-skeleton h-[5.5rem] rounded-2xl" />
        <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-64 rounded-2xl" />
          ))}
        </ul>
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="wx-neo-raised max-w-2xl rounded-2xl px-6 py-14 text-center">
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
    <div>
      <OfferSummary rows={rows} counts={counts} />

      {showTabs ? (
        /*
          TRANSPARENT TABS, the same ones the contest cards use. Rashid asked
          for those by name on 2026-08-24 and there is no reason for this screen
          to invent a second vocabulary for the identical gesture. No filled
          pills and no box: the underline carries which one is open, and the row
          scrolls sideways inside itself on a phone rather than wrapping.
        */
        <div className="mt-5 overflow-x-auto">
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
                    'relative flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-[0.8125rem] font-semibold transition-colors',
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
                      className="bg-accent absolute inset-x-2 -bottom-px h-[0.125rem] rounded-full"
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
 * WHY IT IS WORTH THE ROOM. A creator opening this section is answering one of
 * two questions: what could I take on, and what have I been promised. Both were
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
      className="wx-neo-raised-sm flex flex-wrap items-center gap-x-7 gap-y-4 rounded-2xl px-5 py-4"
      /*
        THE BRAND'S OWN COLOUR, at a whisper. Held at 9% over the card surface
        because a creator reads figures off this: a saturated panel behind
        numbers is a poster rather than a dashboard. It is a `color-mix` on the
        accent rather than the accent gradient, because a gradient behind a row
        of numbers changes the contrast under each one.

        `wx-neo-raised-sm`, not `wx-neo-raised`: this strip sits above a grid of
        glass cards and must not be a second blurred layer of its own.
      */
      style={{
        backgroundColor: 'color-mix(in srgb, var(--wx-accent) 9%, var(--wx-surface-1))',
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
