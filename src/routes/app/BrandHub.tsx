import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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
 * hero is gone and a BRAND HEADER takes its place: logo, name, and three mini
 * stats for HER on this brand, each with its own sparkline. The sections are a
 * SEGMENTED CONTROL at the foot of that header rather than a filter row of
 * their own, which is one fewer blurred surface and one fewer row of chrome
 * between a creator and the thing she came to read.
 *
 * It still opens on Overview rather than Offers, which is the opposite of the
 * admin hub. An admin arrives at a brand to do a job. A creator arrives to
 * decide whether they want to work with it at all, and that decision is made
 * on the brand and its products.
 *
 * EVERY SECTION THAT EXISTED STILL EXISTS. The brief's §10 describes three
 * sections; the code has five real ones, and the code is right about what is
 * here today — Overview and Offers carry the products and the offers, which
 * live nowhere else in the creator app. Nothing a creator could reach before
 * this redesign is unreachable after it.
 *
 * WHAT IT NEVER READS: the client behind a brand, or the budget allocated to
 * it. Both live in `brand_commercials` behind a staff-only policy, and no hook
 * this file touches selects either column.
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
            offerCount={offers?.length ?? 0}
            onSection={go}
          />
        )}
      </div>
    </AccentScope>
  );
}

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
function AccentScope({ brand, children }: { brand: CreatorBrand; children: React.ReactNode }) {
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
  onSection,
}: {
  brand: CreatorBrand;
  brands: CreatorBrand[];
  section: string;
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
      <SectionControl brand={brand} section={section} onSection={onSection} />
    </BrandHeader>
  );
}

/**
 * The sections, as a segmented control.
 *
 * `wx-tap-row` rather than hand-written heights: it is the house utility that
 * gives every control in a row a 44px floor below `sm` and lets it be dense
 * above, so the thumb rule is kept in one place instead of in forty.
 */
function SectionControl({
  brand,
  section,
  onSection,
}: {
  brand: CreatorBrand;
  section: string;
  onSection: (key: string) => void;
}) {
  return (
    <div className="wx-tap-row -mx-0.5 overflow-x-auto px-0.5">
      <FilterTabs label={`${brand.name} sections`} className="min-w-max flex-nowrap">
        {SECTIONS.map((s) =>
          'soon' in s ? (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={false}
              disabled
              title={`${s.label} arrives with ${s.soon}`}
              className="text-muted flex min-h-8 shrink-0 cursor-default items-center gap-1.5 rounded-sm px-2.5 text-[0.8125rem] font-medium opacity-60"
            >
              {s.label}
              <span className="text-[0.5625rem] tracking-wider uppercase">{s.soon}</span>
            </button>
          ) : (
            <FilterTab key={s.key} active={s.key === section} onClick={() => onSection(s.key)}>
              {s.label}
            </FilterTab>
          )
        )}
      </FilterTabs>
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

/** A numbered, labelled section. The number is the skeleton a creator learns. */
function HubSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`hub-s${n}`} className="min-w-0">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="text-accent font-display grid size-6 shrink-0 place-items-center rounded-md text-[0.75rem] font-semibold"
          style={{ background: 'var(--wx-accent-soft)' }}
        >
          {n}
        </span>
        <h2
          id={`hub-s${n}`}
          className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase"
        >
          {title}
        </h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------- overview -- */

/**
 * The brand's room, in ONE glass panel.
 *
 * Every hub has the same five sections in the same order, so a creator always
 * knows where to look, whatever the brand has filled in:
 *
 *   1 Meet the brand   2 What they sell   3 What to make
 *   4 Offers and contests   5 Where you rank
 *
 * Wide screens split it in two (the brand's story on the left, the things to act
 * on on the right); on a phone it is one column in that same order.
 *
 * ONE PANEL, MANY WIDGETS. Each card in here used to be `wx-neo-raised` — a
 * products grid alone put six backdrop-filters on the page, against a budget of
 * three. The panel is the only blurred surface now; everything inside it is the
 * same material with the blur left off.
 *
 * A SECTION WITH NOTHING BEHIND IT SAYS SO. It never collapses and never
 * leaves a gap, because a hub that looks different brand to brand teaches a
 * creator nothing about where things are.
 */
function Overview({
  brand,
  products,
  loading,
  failed,
  onRetry,
  offerCount,
  onSection,
}: {
  brand: CreatorBrand;
  products: CreatorProduct[];
  loading: boolean;
  failed: boolean;
  onRetry: () => Promise<unknown>;
  offerCount: number;
  onSection: (key: string) => void;
}) {
  return (
    <div className="wx-neo-raised min-w-0 rounded-2xl p-4 sm:p-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <MeetTheBrand brand={brand} />
          <WhatTheySell
            brand={brand}
            products={products}
            loading={loading}
            failed={failed}
            onRetry={onRetry}
          />
          <WhatToMake brand={brand} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <OffersAndContests offerCount={offerCount} onSection={onSection} />
          <HubStanding brand={brand} onSection={onSection} />
        </div>
      </div>
    </div>
  );
}

/**
 * 1. Meet the brand.
 *
 * The brand's own words (`brands.description`) are the intro. There is NO founder
 * field anywhere in the database, so the founder line is an honest placeholder
 * rather than an invented name. When the brand-facing editor adds one, it slots
 * in where the placeholder is.
 */
function MeetTheBrand({ brand }: { brand: CreatorBrand }) {
  return (
    <HubSection n={1} title="Meet the brand">
      <div className="wx-neo-raised-sm rounded-xl p-4">
        {brand.description ? (
          <p className="max-w-prose text-[0.9375rem] leading-relaxed break-words">
            {brand.description}
          </p>
        ) : (
          <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
            {brand.name} has not written its introduction yet. It appears here when they do.
          </p>
        )}
        <p className="text-subtle mt-4 text-[0.8125rem] leading-relaxed">
          A word from the founder is on its way.
        </p>
      </div>
    </HubSection>
  );
}

/** 2. What they sell, each product with the commission rate the creator earns. */
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
    <HubSection n={2} title="What they sell">
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
        <HubNote
          title="Products are on their way"
          body="They appear here with the commission rate you earn on each one."
        />
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

/**
 * 3. What to make: briefs, hooks, do's and don'ts.
 *
 * NO DATA SOURCE YET. Nothing in the database holds creative direction for a
 * brand, so this is the honest empty state until the brand-facing editor adds
 * fields for it. Nothing here is invented.
 */
function WhatToMake({ brand }: { brand: CreatorBrand }) {
  return (
    <HubSection n={3} title="What to make">
      <HubNote
        title="Briefs are on their way"
        body={`${brand.name} has not shared its briefs yet. When it does, you will find the angles that convert, the hooks to open with, and what to do and what to avoid.`}
      />
    </HubSection>
  );
}

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

/**
 * 4. Their offers and contests. Links into this hub's own Offers and Contests
 * sections, which are the app's Offers and Contests screens already filtered to
 * this brand. The cards themselves are not rebuilt here.
 *
 * The contest count is not fetched on purpose: it would be a second read for a
 * number that is one tap away. The offer count is already in hand.
 */
function OffersAndContests({
  offerCount,
  onSection,
}: {
  offerCount: number;
  onSection: (key: string) => void;
}) {
  return (
    <HubSection n={4} title="Offers and contests">
      <div className="flex flex-col gap-3">
        <HubLink
          icon={<Ticket size={17} />}
          title="Their offers"
          note={
            offerCount > 0
              ? `${offerCount} ${offerCount === 1 ? 'offer' : 'offers'} you can look at`
              : 'Nothing open right now. New ones land here.'
          }
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

/** Stable across renders, so the standing read is cached rather than refired. */
const ALL_TIME_FROM = '2000-01-01';

/**
 * 5. This brand's leaderboard: where the creator ranks among its creators.
 *
 * Reads the same `my_leaderboard_standing` the Leaderboards section uses, scoped
 * to this brand. A creator with no figures here is not on the board, which is a
 * different fact from a failed read, and they are told each in its own words.
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
    <HubSection n={5} title="Where you rank">
      {isLoading ? (
        <div className="wx-skeleton h-32 rounded-xl" />
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
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Your place at {brand.name}
          </p>
          <p
            className="font-display mt-2 text-[2rem] leading-none font-semibold"
            style={{ color: 'var(--wx-brand-accent-ink, var(--wx-accent))' }}
          >
            #{data.rank}
          </p>
          {data.total_creators > 0 ? (
            <p className="text-muted mt-2 text-[0.8125rem]">
              of {data.total_creators.toLocaleString()} creators on this board
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => onSection('leaderboards')}
            className="text-accent mt-3 inline-flex min-h-11 items-center gap-1.5 text-[0.8125rem] font-semibold"
          >
            See the full board
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      ) : (
        <HubNote
          title="You are not on this board yet"
          body={`Creators appear once their videos have sold something for ${brand.name}. Yours will show up here when they do.`}
          action={
            <button
              type="button"
              onClick={() => onSection('leaderboards')}
              className="text-accent inline-flex min-h-11 items-center gap-1.5 text-[0.8125rem] font-semibold"
            >
              <Trophy size={14} aria-hidden />
              See who is on it
            </button>
          }
        />
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
