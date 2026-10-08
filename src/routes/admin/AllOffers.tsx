import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { m, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Search,
  Tag,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { CreatorFace } from '@/components/work/CreatorFace';
import { CreatorStack } from '@/components/work/CreatorStack';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { useCreatorAvatars, type CreatorAvatars } from '@/lib/admin/useCreatorAvatars';
import {
  ALL_OFFERS_PAGE_SIZE,
  DEFAULT_ALL_OFFERS_FILTERS,
  useAllOffers,
  useBrandsWithOffers,
  useOfferContent,
  useOfferPeople,
  useOfferKindCounts,
  useOfferStatusCounts,
  type AllOffersFilters,
  type AllOffersRow,
  type OfferContent,
  type OfferAccessFilter,
  type OfferKindFilter,
  type OfferPeople,
  type OfferStatusFilter,
} from '@/lib/admin/useAllOffers';

/**
 * Every offer we run, across every brand.
 *
 * The Brand Hub answers "what is this brand offering". This answers what cuts
 * across brands: what is live, who is on it, and what is waiting on somebody.
 *
 * ---------------------------------------------------------------------------
 * REBUILT AS A GRID OF CARDS ON 2026-08-21, on Rashid's instruction and in his
 * words: *"Look at the offers ui how boring it is ... what i am planning is to
 * have horizontal cards rather than having one row it's wasting the time. ALso
 * card will be minimal no need to show everything in card just show mian thing
 * such as offer name, deal value ad brand name that's it but somethign extra
 * for creators we can show avatras ... a card can have 3 sections or something
 * with horizontal lines ending keep the corner radius very low and clicking on
 * it should show details."*
 *
 * WHAT THE CARD SAYS AND WHAT IT DOES NOT. Four things, and they are the four he
 * named: the brand, the offer, the money, the people. Everything the old row
 * carried in labelled columns — the per-video rate, whether it needs applying
 * for, what has been filmed, when it was added — moved into the panel that
 * opens. A card that shows everything is a row with corners.
 *
 * THE MONEY IS THE LARGEST THING ON IT, because it is what an admin scans for,
 * and the video count is its caption rather than its equal. The old row wrote
 * "5 videos for $250" as one sentence in one weight, which reads as prose and
 * scans as nothing.
 *
 * IT EXPANDS RATHER THAN OPENING A SCREEN. There is no offer detail route in the
 * admin — offers are created and edited inside a brand hub — so a card that
 * navigated would have to invent one.
 *
 * AND THE OPEN CARD TAKES THE WHOLE ROW. Expanding in place left a hole: a grid
 * row is as tall as its tallest item, so the two cards beside an open one kept
 * their height and the space under them went blank. Spanning every column
 * instead gives the details somewhere to go and leaves the grid with no gaps.
 * Above `lg` they sit BESIDE the card rather than under it, so what was clicked
 * stays the size and shape it was clicked at. One open at a time.
 *
 * RADIUS IS `rounded-md` HERE, not the `rounded-xl` the other card screens use.
 * That is his "keep the corner radius very low", asked for on this screen.
 */
const STATUS_TABS: { value: OfferStatusFilter; label: string }[] = [
  { value: 'active', label: 'Live' },
  { value: 'inactive', label: 'Switched off' },
  { value: 'all', label: 'All' },
];

const isStatus = (v: string | null): v is OfferStatusFilter =>
  v === 'active' || v === 'inactive' || v === 'all';
const isAccess = (v: string | null): v is OfferAccessFilter =>
  v === 'all' || v === 'application' || v === 'open';
const isKind = (v: string | null): v is OfferKindFilter =>
  v === 'all' || v === 'retainer' || v === 'volume' || v === 'high_commission';

/*
 * WHAT EACH KIND IS, in one place, used by the filter and by every card.
 * `short` is what fits on a card; `label` is what the dropdown says.
 */
const KIND_META: Record<
  'retainer' | 'volume' | 'high_commission',
  { label: string; short: string; className: string }
> = {
  retainer: {
    label: 'Retainer campaign',
    short: 'Retainer',
    className: 'bg-accent-soft text-accent',
  },
  volume: {
    label: 'Volume offer',
    short: 'Volume',
    className: 'bg-surface-3 text-muted',
  },
  high_commission: {
    label: 'High commission',
    short: 'High commission',
    className: 'bg-stage-paid-soft text-stage-paid',
  },
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export function AllOffers() {
  const [params, setParams] = useSearchParams();

  const statusParam = params.get('status');
  const accessParam = params.get('access');
  const kindParam = params.get('kind');
  const sortParam = params.get('sort');

  const filters: AllOffersFilters = {
    status: isStatus(statusParam) ? statusParam : DEFAULT_ALL_OFFERS_FILTERS.status,
    access: isAccess(accessParam) ? accessParam : 'all',
    kind: isKind(kindParam) ? kindParam : 'all',
    brandId: params.get('brand') ?? '',
    search: params.get('q') ?? '',
    sort: sortParam === 'oldest' ? 'oldest' : sortParam === 'reward' ? 'reward' : 'newest',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  const [searchDraft, setSearchDraft] = useState(filters.search);
  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  /*
   * ONE CARD OPEN AT A TIME, held by id rather than by index. A page change or
   * a filter change reshuffles the list, and an index would leave a different
   * offer standing open with somebody else's details under it.
   */
  const [openId, setOpenId] = useState<string | null>(null);

  // Filters live in the URL, so a view can be sent to somebody else.
  const setFilters = (next: Partial<AllOffersFilters>) => {
    const merged = { ...filters, ...next };
    if (next.page === undefined) merged.page = 1;

    const p = new URLSearchParams();
    if (merged.status !== DEFAULT_ALL_OFFERS_FILTERS.status) p.set('status', merged.status);
    if (merged.access !== 'all') p.set('access', merged.access);
    if (merged.kind !== 'all') p.set('kind', merged.kind);
    if (merged.brandId) p.set('brand', merged.brandId);
    if (merged.search) p.set('q', merged.search);
    if (merged.sort !== 'newest') p.set('sort', merged.sort);
    if (merged.page > 1) p.set('page', String(merged.page));
    setParams(p, { replace: true });
    setOpenId(null);
  };

  const { data, isLoading, isError, error, isPlaceholderData } = useAllOffers(filters);
  const { data: counts } = useOfferStatusCounts();
  const { data: kindCounts } = useOfferKindCounts();
  const { data: brands } = useBrandsWithOffers();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ALL_OFFERS_PAGE_SIZE));

  /*
   * ASK ABOUT EVERY OFFER ON THE PAGE, AND DECIDE ON WHAT COMES BACK.
   *
   * This used to skip any offer whose `needs_application` flag was off, which
   * meant flipping that flag on an offer six people were already mid-pipeline
   * on quietly erased all six from this screen. The flag describes whether a
   * NEW creator has to ask; it says nothing about work already under way.
   *
   * So: rows came back, report them, whatever the flag says. No rows and the
   * flag is off, it belongs to the whole roster and there is nothing to count.
   * That is the same rule the creator side follows in `stateFor`, and the same
   * one Rashid gave for progress: follow the job, never the flag.
   */
  const offerIds = rows.map((o) => o.id);
  const { data: people } = useOfferPeople(offerIds);
  const { data: content } = useOfferContent(offerIds);

  /*
   * Every face on the page signed in ONE call, not one per card and not one per
   * face. `useCreatorAvatars` sorts and deduplicates its ids, so the same
   * creator appearing on four offers is signed once.
   */
  const faceIds = Object.values(people ?? {}).flatMap((p) => p.faces.map((f) => f.id));
  const avatars = useCreatorAvatars(faceIds);

  return (
    <>
      {/*
        NO TITLE ROW AND NO DESCRIPTION ROW. The top bar carries the section name
        as the page's h1 now, and Rashid asked on 2026-08-16 for both of these to
        go: they spent the top of every screen repeating the lit menu item. The
        controls are row one, in the shared `FilterBar` so this screen cannot
        drift from the shape he approved.
      */}
      <FilterBar>
        <FilterTabs label="Filter offers">
          {STATUS_TABS.map((t) => (
            <FilterTab
              key={t.value}
              active={filters.status === t.value}
              // "All" has no count: nothing here totals every offer, and a
              // number invented for the sake of symmetry would be wrong.
              count={
                t.value === 'active'
                  ? counts?.active
                  : t.value === 'inactive'
                    ? counts?.inactive
                    : undefined
              }
              onClick={() => setFilters({ status: t.value })}
            >
              {t.label}
            </FilterTab>
          ))}
        </FilterTabs>

        <form
          className="relative min-w-0 flex-1 basis-48"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ search: searchDraft });
          }}
        >
          <Search
            size={15}
            aria-hidden
            className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            type="search"
            name="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search offers"
            aria-label="Search offers by title"
            className="wx-neo-inset placeholder:text-faint focus-visible:ring-accent/50 h-10 w-full rounded-md pr-3 pl-9 text-[0.875rem] focus:outline-none focus-visible:ring-2"
          />
        </form>

        <label className="sr-only" htmlFor="brand-filter">
          Filter by brand
        </label>
        {/* Width is capped as well as floored: brand names come from the
            database, and a select sized to its longest option would push this
            row wider than a phone the day somebody registers a long one. */}
        <Select
          id="brand-filter"
          name="brand"
          value={filters.brandId}
          onChange={(e) => setFilters({ brandId: e.target.value })}
          className="h-10 w-auto max-w-[14rem] min-w-[9rem] shrink-0 rounded-md text-[0.875rem]"
        >
          <option value="">All brands</option>
          {(brands ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>

        {/*
          TWO DROPDOWNS, BECAUSE THEY ARE TWO QUESTIONS. "Which kind of offer"
          and "does a creator have to ask" were one control called "type" until
          2026-08-21, and they are independent: a retainer may or may not need
          applying for, and so may a volume offer.
        */}
        <label className="sr-only" htmlFor="kind-filter">
          Filter by kind
        </label>
        <Select
          id="kind-filter"
          name="kind"
          value={filters.kind}
          onChange={(e) => setFilters({ kind: e.target.value as OfferKindFilter })}
          className="h-10 w-auto min-w-[11rem] shrink-0 rounded-md text-[0.875rem]"
        >
          <option value="all">
            {kindCounts
              ? `Any kind (${kindCounts.retainer + kindCounts.volume + kindCounts.high_commission} live)`
              : 'Any kind'}
          </option>
          <option value="retainer">
            Retainer{kindCounts ? ` (${kindCounts.retainer})` : ''}
          </option>
          <option value="volume">Volume{kindCounts ? ` (${kindCounts.volume})` : ''}</option>
          <option value="high_commission">
            High commission{kindCounts ? ` (${kindCounts.high_commission})` : ''}
          </option>
        </Select>

        <label className="sr-only" htmlFor="access-filter">
          Filter by whether creators apply
        </label>
        <Select
          id="access-filter"
          name="access"
          value={filters.access}
          onChange={(e) => setFilters({ access: e.target.value as OfferAccessFilter })}
          className="h-10 w-auto min-w-[10.5rem] shrink-0 rounded-md text-[0.875rem]"
        >
          <option value="all">Any access</option>
          <option value="application">Needs applying for</option>
          <option value="open">Open to take</option>
        </Select>

        <label className="sr-only" htmlFor="sort-filter">
          Sort
        </label>
        <Select
          id="sort-filter"
          name="sort"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as AllOffersFilters['sort'] })}
          className="h-10 w-auto min-w-[9.5rem] shrink-0 rounded-md text-[0.875rem]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="reward">Highest paying</option>
        </Select>
      </FilterBar>

      {/* ------------------------------------------------------------ grid -- */}
      <div
        className={cn(
          'mt-4 transition-opacity duration-200',
          isPlaceholderData && 'opacity-60'
        )}
      >
        {isLoading ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="wx-skeleton h-[13.5rem] rounded-md" />
            ))}
          </ul>
        ) : isError ? (
          <div className="bg-surface-1 rounded-md px-6 py-14 text-center shadow-md">
            <p className="font-semibold">That list would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-surface-1 rounded-md px-6 py-16 text-center shadow-md">
            <Tag size={26} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">No offers match that</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              Offers are created inside a brand hub. Try a different search, brand or status.
            </p>
          </div>
        ) : (
          /*
           * `items-start`, deliberately. With the default `stretch` every card
           * in a row would grow to match the one somebody opened, which turns
           * one click into four empty cards. Collapsed cards are all the same
           * height anyway, because the title is clamped, so the row still lines
           * up until something is actually open.
           */
          <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((offer) => (
              /*
               * THE OPEN CARD TAKES THE WHOLE ROW.
               *
               * Expanding in place left a hole: a grid row is as tall as its
               * tallest item, so the two cards beside an open one kept their
               * height and the space under them went blank. Spanning every
               * column instead means the details have somewhere to go and the
               * grid still has no gaps in it. Above `lg` they go BESIDE the
               * card rather than under it, so the thing that was clicked stays
               * exactly the card that was clicked.
               */
              <li
                key={offer.id}
                className={cn(
                  openId === offer.id && 'sm:col-span-2 xl:col-span-3 2xl:col-span-4'
                )}
              >
                <OfferCard
                  offer={offer}
                  people={people?.[offer.id]}
                  content={content?.[offer.id]}
                  avatars={avatars}
                  open={openId === offer.id}
                  onToggle={() => setOpenId((id) => (id === offer.id ? null : offer.id))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------ pagination -- */}
      {total > ALL_OFFERS_PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="wx-numeric text-muted text-[0.8125rem]">
            {(filters.page - 1) * ALL_OFFERS_PAGE_SIZE + 1} to{' '}
            {Math.min(filters.page * ALL_OFFERS_PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ page: filters.page - 1 })}
            >
              <ChevronLeft size={15} aria-hidden />
              Previous
            </Button>
            <span className="wx-numeric text-muted px-1 font-mono text-[0.75rem]">
              {filters.page} / {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={filters.page >= pages}
              onClick={() => setFilters({ page: filters.page + 1 })}
            >
              Next
              <ChevronRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------- card -- */

function OfferCard({
  offer,
  people,
  content,
  avatars,
  open,
  onToggle,
}: {
  offer: AllOffersRow;
  people: OfferPeople | undefined;
  content: OfferContent | undefined;
  avatars: CreatorAvatars;
  open: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();

  const hasTerms = offer.video_count !== null && offer.reward_amount !== null;
  const on = people?.approved ?? 0;
  const waiting = people?.pending ?? 0;
  const faces = people?.faces ?? [];
  const panelId = `offer-details-${offer.id}`;

  // The rate a creator actually earns per video, which is the number an admin
  // compares offers on and the only arithmetic on this screen.
  const perVideo =
    hasTerms && offer.video_count! > 0
      ? Number(offer.reward_amount) / offer.video_count!
      : null;

  return (
    <div
      className={cn(
        'wx-neo-raised flex overflow-hidden rounded-md transition-[border-color,box-shadow,transform] duration-300',
        // Stacked normally. Open and wide, the details sit BESIDE the card, so
        // the thing that was clicked stays the size and shape it was clicked at.
        open ? 'flex-col lg:flex-row lg:items-stretch' : 'flex-col',
        // Lifted only while it is closed. A panel that rises as it opens reads
        // as the page moving rather than as a drawer.
        !open && 'hover:-translate-y-0.5 hover:shadow-[var(--wx-glass-glow)]',
        open && 'shadow-[var(--wx-glass-glow)]',
        offer.status === 'inactive' && 'opacity-75'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'group focus-visible:outline-accent flex w-full flex-col text-left focus-visible:outline-2 focus-visible:-outline-offset-2',
          open && 'lg:w-[21rem] lg:shrink-0'
        )}
      >
        {/* ----------------------------------- 1. whose it is, and its state -- */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-3">
          {/*
            Plain text in a pill, not a link. The whole header is a button, and
            an anchor inside a button is invalid HTML that browsers resolve by
            guessing. The brand is a real link inside the panel instead.
          */}
          <span className="wx-neo-raised-sm text-text min-w-0 truncate rounded-full px-2.5 py-1 font-mono text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
            {offer.brand?.name ?? 'Unknown brand'}
          </span>

          <span className="flex shrink-0 items-center gap-1.5">
            {/* The kind is the first thing on the card after the brand, because
                it is the thing that decides who can see the money below it. */}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase',
                KIND_META[offer.kind].className
              )}
            >
              {KIND_META[offer.kind].short}
            </span>
            {offer.badge_title ? (
              <span className="bg-accent-soft text-accent rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
                {offer.badge_title}
              </span>
            ) : null}
            {offer.status === 'inactive' ? (
              <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
                Off
              </span>
            ) : null}
            {offer.brand && !offer.brand.is_active ? (
              <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
                Retired
              </span>
            ) : null}
          </span>
        </div>

        {/* -------------------------------------- 2. what it is, and the money -- */}
        {/* `flex-1` so that when the details open beside this column and stretch
            it, the extra height lands here rather than as a gap under the
            footer. */}
        <div className="border-line flex flex-1 flex-col gap-3 border-t px-4 pt-3.5 pb-4">
          {/*
            EXACTLY TWO LINES OF TITLE, always. Clamped so a long one cannot
            push a card taller than the one beside it, and floored so a short
            one cannot make it shorter: in a grid, cards of unequal height read
            as a mistake rather than as content. The full title is in the panel.
          */}
          <h3 className="font-display text-text group-hover:text-accent line-clamp-2 min-h-[2.9rem] text-[1.0625rem] leading-snug font-bold break-words transition-colors">
            {offer.title}
          </h3>

          {/*
            THE MONEY IS THE HERO AND ITS CAPTION CARRIES THE RATE.
            It said "for 5 videos", which every one of Rashid's titles already
            says a line above, so the biggest thing on the card was an echo. The
            per-video rate is the number an admin actually compares two offers
            on, and it is the one thing here that is arithmetic rather than a
            field.
          */}
          {hasTerms ? (
            <div>
              <p className="font-brand text-accent wx-numeric text-[1.75rem] leading-none font-bold tracking-tight">
                {money(offer.reward_amount, offer.currency)}
              </p>
              <p className="text-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
                <span>
                  <span className="wx-numeric text-text font-semibold">
                    {offer.video_count}
                  </span>{' '}
                  {offer.video_count === 1 ? 'video' : 'videos'}
                </span>
                {perVideo !== null ? (
                  <>
                    <span aria-hidden className="text-faint">
                      ·
                    </span>
                    <span>
                      <span className="wx-numeric text-text font-semibold">
                        {money(perVideo, offer.currency)}
                      </span>{' '}
                      each
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          ) : (
            <p className="text-muted text-[0.875rem]">No fixed terms</p>
          )}
        </div>

        {/* ------------------------------------------- 3. who is on it, and open -- */}
        <div className="border-line bg-surface-2/40 flex items-center gap-3 border-t px-4 py-2.5">
          {on > 0 ? (
            <>
              <CreatorStack faces={faces} total={on} avatars={avatars} size={26} />
              <span className="text-muted min-w-0 truncate text-[0.8125rem]">
                <span className="wx-numeric text-text font-semibold">{on}</span>{' '}
                {on === 1 ? 'creator' : 'creators'}
              </span>
            </>
          ) : (
            <span className="text-muted flex min-w-0 items-center gap-1.5 truncate text-[0.8125rem]">
              <Users size={14} aria-hidden className="text-faint shrink-0" />
              {offer.needs_application ? 'Nobody yet' : 'Open to everyone'}
            </span>
          )}

          {/*
            The one number here that is somebody's job rather than a fact. It
            stays on the closed card for that reason, and it is not a link:
            the panel below carries the link to the queue.
          */}
          {waiting > 0 ? (
            <span className="bg-stage-due-soft text-stage-due wx-numeric ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-semibold">
              {waiting} waiting
            </span>
          ) : null}

          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              'text-faint group-hover:text-accent shrink-0 transition-transform duration-300',
              waiting > 0 ? 'ml-1' : 'ml-auto',
              open && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* ------------------------------------------------------- 4. details -- */}
      {open ? (
        <m.div
          id={panelId}
          /*
           * Opacity and a short rise, NOT height. The panel is a column child on
           * a phone and a row child on a laptop, and a height animation that
           * reads as an accordion in one reads as an unfurling flag in the
           * other. This one is right in both.
           */
          initial={reduced ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="border-line min-w-0 flex-1 border-t lg:border-t-0 lg:border-l"
        >
          <div className="flex flex-col gap-4 px-4 py-4 lg:px-5 lg:py-5">
            {/* The title in full, because the card clamped it. */}
            <p className="text-text text-[0.875rem] leading-relaxed font-semibold">
              {offer.title}
            </p>

            {offer.description ? (
              <p className="text-muted text-[0.8125rem] leading-relaxed">{offer.description}</p>
            ) : null}

            {/* Four facts, none of which is on the card. The per-video rate is
                not repeated here: it moved onto the card, where it is doing
                more work. */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4 lg:gap-x-6">
              <Fact label="Kind" value={KIND_META[offer.kind].label} />
              <Fact
                label="Access"
                value={offer.needs_application ? 'Needs applying for' : 'Open to take'}
              />
              <Fact
                label="Waiting"
                value={
                  waiting > 0 ? (
                    <span className="text-stage-due wx-numeric font-semibold">
                      {waiting} {waiting === 1 ? 'request' : 'requests'}
                    </span>
                  ) : (
                    'Nobody waiting'
                  )
                }
              />
              <Fact
                label="Videos in"
                value={
                  content ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-stage-paid wx-numeric font-semibold">
                        {content.approved}
                      </span>
                      <span className="text-muted">approved</span>
                      {content.submitted > 0 ? (
                        <Link
                          to="/admin/content?tab=submitted"
                          className="bg-stage-live-soft text-stage-live wx-numeric rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-semibold transition-opacity hover:opacity-80"
                        >
                          {content.submitted} to watch
                        </Link>
                      ) : null}
                    </span>
                  ) : (
                    'Nothing yet'
                  )
                }
              />
              <Fact label="Added" value={shortDate(offer.created_at)} />
            </dl>

            {/* Who, by name. This is the tap equivalent of the face stack: the
                faces above carry no hover label, so the names live here where a
                phone can reach them. */}
            {faces.length > 0 ? (
              <div>
                <span className="text-faint block text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
                  On this offer
                </span>
                {/* Chips rather than a column, so a wide panel does not run one
                    name per line down a thousand pixels of empty space. */}
                <ul className="mt-2 flex flex-wrap items-center gap-2">
                  {faces.map((f) => (
                    <li
                      key={f.id}
                      className="wx-neo-raised-sm flex min-w-0 items-center gap-2 rounded-full py-1 pr-3 pl-1"
                    >
                      <CreatorFace
                        src={avatars[f.id]}
                        name={f.name}
                        handle={f.handle}
                        size={22}
                      />
                      <span className="text-text min-w-0 truncate text-[0.8125rem]">
                        {f.name ?? f.handle ?? 'Unknown creator'}
                      </span>
                    </li>
                  ))}
                  {on > faces.length ? (
                    <li className="text-muted wx-numeric text-[0.8125rem]">
                      and {on - faces.length} more
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {/* Where to go next. Both are real links, and they are outside the
                header button so nothing is nested inside anything. */}
            <div className="border-line flex flex-wrap gap-2 border-t pt-3">
              {offer.brand ? (
                <Link
                  to={`/admin/brands/${offer.brand.id}`}
                  className="wx-neo-raised-sm wx-neo-press text-text hover:text-accent inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors"
                >
                  <Tag size={14} aria-hidden />
                  Open {offer.brand.name}
                </Link>
              ) : null}
              {waiting > 0 ? (
                <Link
                  to={`/admin/offers/requests?brand=${offer.brand_id}`}
                  className="bg-stage-due-soft text-stage-due inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] font-semibold transition-opacity hover:opacity-80"
                >
                  <Clapperboard size={14} aria-hidden />
                  Review {waiting} {waiting === 1 ? 'request' : 'requests'}
                </Link>
              ) : null}
            </div>
          </div>
        </m.div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- one fact -- */

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
        {label}
      </dt>
      <dd className="text-text mt-1 text-[0.8125rem]">{value}</dd>
    </div>
  );
}
