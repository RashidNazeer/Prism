import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Gift,
  Info,
  LayoutDashboard,
  Megaphone,
  Pencil,
  Percent,
  Plus,
  Search,
  Tag,
  Ticket,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { BrandAbout } from '@/components/admin/BrandAbout';
import { BrandContests } from '@/components/admin/BrandContests';
import { BrandCreators } from '@/components/admin/BrandCreators';
import { BrandDialog } from '@/components/admin/BrandDialog';
import { OfferDialog } from '@/components/admin/OfferDialog';
import { FilterBar } from '@/components/layout/FilterBar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import { BudgetBar } from '@/components/admin/BudgetBar';
import {
  BRAND_OFFERS_PAGE_SIZE,
  budgetOf,
  money,
  useBrand,
  useBrandOfferCounts,
  useOffers,
  type Brand,
  type BrandOfferFilters,
  type BrandOfferStatusFilter,
  type Offer,
} from '@/lib/admin/useBrands';
import {
  useBrandContent,
  useBrandMoney,
  type BrandContent,
  type BrandMoney,
} from '@/lib/admin/useBrandRollups';

/** The status filter comes from the address bar, so it has to be checked. */
const isOfferStatusFilter = (v: string | null): v is BrandOfferStatusFilter =>
  v === 'all' || v === 'active' || v === 'inactive';

/**
 * The Brand Hub.
 *
 * Everything that belongs to one brand lives behind these tabs.
 *
 * Two layout rules from CLAUDE.md are load bearing here. The brand's facts sit
 * under Overview rather than stacked above the work, and the hub OPENS on
 * Offers, because that is what somebody came to a brand to do. Landing on a
 * summary would push the offers below a screenful of things they already know.
 */
const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'offers', label: 'Offers', icon: Tag },
  { key: 'about', label: 'About', icon: Info },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone, soon: 'Next' },
  { key: 'contests', label: 'Contests', icon: Trophy },
  { key: 'promotions', label: 'Promotions', icon: Gift, soon: 'Later' },
  { key: 'discounts', label: 'Discounts', icon: Percent, soon: 'Later' },
  { key: 'creators', label: 'Creators', icon: Users },
] as const;

const BUILT = new Set(['overview', 'offers', 'about', 'creators', 'contests']);

export function BrandHub() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const requested = params.get('section') ?? 'offers';
  const section = BUILT.has(requested) ? requested : 'offers';

  // Read once, then narrow: a second `params.get` is a fresh `string | null`
  // as far as TypeScript is concerned.
  const rawStatus = params.get('status');
  const offerFilters: BrandOfferFilters = {
    status: isOfferStatusFilter(rawStatus) ? rawStatus : 'all',
    search: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  const { data: brand, isLoading, isError, error } = useBrand(id);
  const { data: offerPage, isLoading: offersLoading } = useOffers(id, offerFilters);

  const [editingBrand, setEditingBrand] = useState(false);
  const [offerDialog, setOfferDialog] = useState<{ offer?: Offer } | null>(null);

  /*
   * Switching TAB clears the other tab's filters, which is right: a page number
   * from the offers list means nothing on the roster. Changing a filter WITHIN
   * a tab keeps the section, which `set` below is for. Before this, every tab
   * click rebuilt the params from nothing, so any filter would have been lost
   * the moment either list grew one.
   */
  const go = (key: string) => {
    const p = new URLSearchParams();
    if (key !== 'offers') p.set('section', key);
    setParams(p, { replace: true });
  };

  const set = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    // Any change to what is being looked at starts again at page one, or you
    // can search your way onto an empty page three.
    if (!('page' in patch)) p.delete('page');
    setParams(p, { replace: true });
  };

  if (isLoading) {
    return (
      <>
        <div className="max-w-3xl space-y-4">
          <div className="wx-skeleton h-8 w-56 rounded" />
          <div className="wx-skeleton h-10 w-full rounded" />
          <div className="wx-skeleton h-36 rounded-xl" />
        </div>
      </>
    );
  }

  if (isError || !brand) {
    return (
      <>
        <div className="border-line bg-surface-1 max-w-lg rounded-xl border p-8 text-center shadow-md">
          <p className="font-semibold">
            {isError ? 'That brand would not load' : 'No such brand'}
          </p>
          <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">
            {(error as Error)?.message ?? 'It may have been removed. Nothing else is affected.'}
          </p>
          <ButtonLink to="/admin/brands" variant="secondary" size="sm" className="mt-5">
            Back to brands
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      {/* --------------------------------------------------------- header -- */}
      {/* One row: back, name, and the only action that belongs up here. The
          slug is gone; it is plumbing, and an admin has no use for a route.

          The NAME stays, as an `<h2>` since 2026-08-16. The shell's top bar owns
          the page's `<h1>` now and says "Brand hubs", which answers "where am
          I". It cannot answer "which brand is open", so this row still has to,
          and there must not be a second `<h1>` on the page saying so. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to="/admin/brands"
          aria-label="Back to all brands"
          className="border-line text-muted hover:border-accent hover:text-accent grid size-11 shrink-0 place-items-center rounded-lg border transition-colors duration-200 sm:size-8"
        >
          <ArrowLeft size={15} aria-hidden />
        </Link>

        {brand.logo_url ? (
          <img
            src={brand.logo_url}
            alt=""
            className="border-line size-8 shrink-0 rounded-full border object-cover"
          />
        ) : null}

        <h2 className="min-w-0 text-[clamp(1.35rem,3vw,1.75rem)] font-extrabold break-words">
          {brand.name}
        </h2>

        {!brand.is_active ? (
          <span className="bg-surface-2 text-muted rounded-full px-2.5 py-1 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
            Retired
          </span>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditingBrand(true)}
          // 44px, because sm is 36px and this is reachable on a phone.
          className="ml-auto min-h-[44px] shrink-0"
        >
          <Pencil size={14} aria-hidden />
          Edit brand
        </Button>
      </div>

      {/* ----------------------------------------------------------- tabs -- */}
      {/*
        NOT a `FilterTabs`, on purpose. These are the record's sections, not a
        filter on the list below, and three things here cannot survive the trip:
        the unbuilt sections are `disabled` so nobody lands on an empty page,
        they carry a "Next"/"Later" badge saying when they arrive, and each has
        an icon. `FilterTab` has no room for any of that. The precedent is
        `ContestsHeader`, which keeps its own section nav as a row of its own for
        the same reason. The filter row that DOES belong in a `FilterBar` is the
        one inside the Offers tab, below.
      */}
      <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Brand hub sections"
          className="border-line inline-flex min-w-full gap-1 border-b pb-px sm:min-w-0"
        >
          {SECTIONS.map((s) => {
            const active = s.key === section;
            const built = BUILT.has(s.key);
            return (
              <button
                key={s.key}
                role="tab"
                type="button"
                aria-selected={active}
                disabled={!built}
                onClick={() => go(s.key)}
                className={cn(
                  // min-h-[44px] is 44px, the smallest thing a thumb should have to
                  // hit. These were 41px, which the contests suite caught.
                  'flex min-h-[44px] shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[0.875rem] font-medium transition-colors duration-200',
                  active
                    ? 'border-accent text-accent'
                    : built
                      ? 'text-muted hover:text-text border-transparent'
                      : 'text-faint cursor-default border-transparent'
                )}
              >
                <s.icon size={15} aria-hidden />
                {s.label}
                {'soon' in s ? (
                  <span className="border-line text-faint rounded-full border px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-[0.1em] uppercase">
                    {s.soon}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* -------------------------------------------------------- content -- */}
      {section === 'overview' ? (
        <Overview brand={brand} />
      ) : section === 'about' ? (
        <BrandAbout brand={brand} />
      ) : section === 'creators' ? (
        <BrandCreators brandId={brand.id} brandName={brand.name} />
      ) : section === 'contests' ? (
        <BrandContests brandId={brand.id} brandName={brand.name} />
      ) : (
        <Offers
          offers={offerPage?.rows ?? []}
          total={offerPage?.total ?? 0}
          filters={offerFilters}
          loading={offersLoading}
          onSet={set}
          onNew={() => setOfferDialog({})}
          onEdit={(offer) => setOfferDialog({ offer })}
        />
      )}

      {editingBrand ? (
        <BrandDialog brand={brand} onClose={() => setEditingBrand(false)} />
      ) : null}

      {offerDialog ? (
        <OfferDialog
          brandId={brand.id}
          brandName={brand.name}
          {...(offerDialog.offer ? { offer: offerDialog.offer } : {})}
          onClose={() => setOfferDialog(null)}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------- overview -- */

/**
 * Everything true about the brand, in one place.
 *
 * This is where new facts go as the hub grows: creators working with it,
 * spend against budget, live campaigns. Keeping them here is what stops the
 * Offers tab turning back into a wall of things you already know.
 */
function Overview({ brand }: { brand: Brand }) {
  /*
   * Counts come from the DATABASE now, not from filtering the offers array.
   * That array is one page since the Offers tab started paging, so measuring it
   * would have quietly turned "12 live of 40" into a description of the first
   * twelve rows.
   */
  const { data: counts } = useBrandOfferCounts(brand.id);
  const { data: brandMoney } = useBrandMoney(brand.id);
  const { data: content } = useBrandContent(brand.id);

  const budget = budgetOf(brand);

  return (
    <div className="mt-6 grid max-w-4xl gap-6">
      {/* Budget first, because it is the only fact here that changes on its own
          and the only one with a consequence. Everything below is reference. */}
      <div className="border-line bg-surface-1 rounded-xl border px-5 py-4 shadow-md">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Budget committed to creators
          </dt>
          <dd className="wx-numeric text-[0.9375rem] font-semibold">
            {money(brand.budget_used, brand.currency)} of{' '}
            {money(brand.budget_allocated, brand.currency)}
          </dd>
        </div>
        <div className="mt-3">
          <BudgetBar brand={brand} size="lg" />
        </div>
        {budget.over ? (
          <p className="border-line text-danger mt-3 border-t pt-3 text-[0.8125rem] leading-relaxed">
            More has been promised than this brand was allocated. Nothing is blocked, but the
            next approval makes it worse.
          </p>
        ) : null}
      </div>

      {/*
        WHERE THAT COMMITTED MONEY HAS ACTUALLY GOT TO.
        The bar above says how much of the allocation is promised. It says
        nothing about whether any of it has left the building, so a brand at
        90% committed with most of it paid looked identical to one where
        nothing has moved.

        One block PER CURRENCY. `offer_applications.currency` is per row, so a
        brand can genuinely hold two, and adding them would be the one
        arithmetic error this product must not make.
      */}
      {(brandMoney ?? []).map((m) => (
        <MoneyByStage key={m.currency} m={m} showCurrency={(brandMoney ?? []).length > 1} />
      ))}

      {/* What has actually been filmed for this brand. */}
      <ContentLanded content={content} />

      {/* Separate bordered cards rather than the one-pixel-gap trick used
          elsewhere. That trick paints the gaps with the border colour, so a row
          that does not divide evenly leaves a visible empty block at the end.
          This grid grows as the hub gains facts, so it must not care. */}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Store id" value={brand.store_id} mono />
        <Fact label="Client" value={brand.client_name || 'Not set'} />
        <Fact
          label="Budget allocated"
          value={money(brand.budget_allocated, brand.currency)}
          accent
        />
        <Fact
          label="Still available"
          value={budget.left === null ? 'Not set' : money(budget.left, brand.currency)}
        />
        <Fact label="Currency" value={brand.currency} />
        <Fact
          label="Offers"
          value={counts ? `${counts.live} live of ${counts.total}` : '...'}
        />
        <Fact label="Open without applying" value={counts ? String(counts.openToAll) : '...'} />
        <Fact label="Products" value={counts ? String(counts.products) : '...'} />
        <Fact
          label="Added"
          value={new Date(brand.created_at).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        />
        <Fact label="Status" value={brand.is_active ? 'Active' : 'Retired'} />
      </dl>

      <p className="text-faint text-[0.8125rem] leading-relaxed">
        Campaigns, contests and promotions land here as those parts of the hub are built.
      </p>
    </div>
  );
}

/* ------------------------------------------------------- money by stage -- */

/**
 * The committed figure, split three ways.
 *
 * The three cells always add up to the total, because every one of the seven
 * stages belongs to exactly one bucket. That is what lets somebody read this
 * card and check it against the bar above without doing arithmetic.
 *
 * Only the three stage colours are used, which is the whole reason those tokens
 * exist: accent, warning and success collide in light mode.
 */
function MoneyByStage({ m, showCurrency }: { m: BrandMoney; showCurrency: boolean }) {
  const fmt = (n: number) => money(Math.round(n * 100) / 100, m.currency);
  const share = (n: number) => (m.total > 0 ? (n / m.total) * 100 : 0);

  const cells = [
    {
      key: 'paid',
      label: 'Paid out',
      value: m.paid,
      text: 'text-stage-paid',
      bar: 'bg-stage-paid',
    },
    {
      key: 'due',
      label: 'Awaiting payment',
      value: m.due,
      text: 'text-stage-due',
      bar: 'bg-stage-due',
    },
    {
      key: 'working',
      label: 'In progress',
      value: m.working,
      text: 'text-stage-live',
      bar: 'bg-stage-live',
    },
  ];

  return (
    <section className="border-line bg-surface-1 rounded-xl border p-5 shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Where the committed money has got to
          {showCurrency ? ` (${m.currency})` : ''}
        </h2>
        <p className="font-display text-[0.9375rem] font-semibold">
          {fmt(m.total)}
          <span className="text-faint font-sans text-[0.8125rem] font-normal">
            {' '}
            across {m.jobs} {m.jobs === 1 ? 'job' : 'jobs'}
          </span>
        </p>
      </div>

      <div
        className="bg-line mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={`${fmt(m.paid)} paid, ${fmt(m.due)} awaiting payment, ${fmt(m.working)} in progress`}
      >
        {cells
          .filter((c) => c.value > 0)
          .map((c) => (
            <span
              key={c.key}
              className={cn('h-full rounded-full', c.bar)}
              style={{ width: `${share(c.value)}%` }}
            />
          ))}
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.key} className="border-line bg-surface-2 rounded-lg border px-3.5 py-3">
            <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {c.label}
            </dt>
            <dd className={cn('font-display mt-1 text-[1.0625rem] font-semibold', c.text)}>
              {fmt(c.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------------------------------------------------------- content in -- */

function ContentLanded({ content }: { content: BrandContent | undefined }) {
  const cells = [
    {
      key: 'approved',
      label: 'Approved',
      value: content?.approved ?? 0,
      text: 'text-stage-paid',
    },
    {
      key: 'waiting',
      label: 'Waiting to be watched',
      value: content?.waiting ?? 0,
      text: 'text-stage-live',
    },
    {
      key: 'back',
      label: 'Sent back',
      value: content?.needsAnotherTake ?? 0,
      text: 'text-stage-due',
    },
  ];

  return (
    <section className="border-line bg-surface-1 rounded-xl border p-5 shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          What has been filmed for this brand
        </h2>
        {content && content.posted > 0 ? (
          <p className="text-muted text-[0.8125rem]">
            {content.posted} {content.posted === 1 ? 'video' : 'videos'} from {content.creators}{' '}
            {content.creators === 1 ? 'creator' : 'creators'}
          </p>
        ) : null}
      </div>

      {content && content.posted === 0 ? (
        <p className="text-muted mt-3 text-[0.875rem] leading-relaxed">
          Nothing posted yet. Videos land here as creators send them in.
        </p>
      ) : (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {cells.map((c) => (
            <div key={c.key} className="border-line bg-surface-2 rounded-lg border px-3.5 py-3">
              <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                {c.label}
              </dt>
              <dd className={cn('font-display mt-1 text-[1.0625rem] font-semibold', c.text)}>
                {content === undefined ? '...' : c.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function Fact({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="border-line bg-surface-1 rounded-xl border px-5 py-4">
      <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1.5 font-semibold break-all',
          mono && 'font-mono text-[0.8125rem]',
          accent && 'wx-numeric text-accent'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ---------------------------------------------------------------- offers -- */

function Offers({
  offers,
  total,
  filters,
  loading,
  onSet,
  onNew,
  onEdit,
}: {
  offers: Offer[];
  total: number;
  filters: BrandOfferFilters;
  loading: boolean;
  onSet: (patch: Record<string, string>) => void;
  onNew: () => void;
  onEdit: (offer: Offer) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / BRAND_OFFERS_PAGE_SIZE));
  // "Nothing here" and "nothing matches that" are different sentences, and a
  // brand with forty offers filtered down to none must not read as a brand
  // with no offers.
  const filtered = Boolean(filters.search) || filters.status !== 'all';

  return (
    <section className="mt-5">
      {/*
        THE EXPLANATION ROW WENT ON 2026-08-16. It read "What this brand pays
        creators for content", above a tab labelled Offers that somebody had just
        clicked, so it spent a line telling them what they had already chosen.
        Rashid, plainly: "i don't want to show description of that section".

        The controls are the first thing in the tab now, in the shared
        `FilterBar`, so this row cannot drift from the one he approved on
        contests. `rounded-md` and `h-10` on everything inside it: slightly
        rounded, "do not give it circle look".

        Deliberately NO money in it. `check-brands.mjs` asserts this tab carries
        none: the deal is on each card, and the brand's totals live one tab
        across under Overview.
      */}
      <FilterBar
        action={
          <Button onClick={onNew} className="h-10 shrink-0 rounded-md text-[0.875rem]">
            <Plus size={15} aria-hidden />
            New offer
          </Button>
        }
      >
        <div className="relative min-w-[10rem] flex-1">
          <Search
            size={15}
            aria-hidden
            className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <Input
            type="search"
            name="offer-search"
            defaultValue={filters.search}
            onChange={(e) => onSet({ q: e.target.value })}
            placeholder="Search this brand's offers"
            aria-label="Search this brand's offers"
            className="h-10 rounded-md pl-9 text-[0.875rem]"
          />
        </div>

        {/* The label stays sr-only rather than becoming an aria-label, so the
            control keeps the accessible name it already had. */}
        <label className="sr-only" htmlFor="offer-status">
          Filter by status
        </label>
        <Select
          id="offer-status"
          name="status"
          value={filters.status}
          onChange={(e) => onSet({ status: e.target.value === 'all' ? '' : e.target.value })}
          className="h-10 w-auto min-w-[10rem] shrink-0 rounded-md text-[0.875rem]"
        >
          <option value="all">Any status</option>
          <option value="active">Live</option>
          <option value="inactive">Switched off</option>
        </Select>
      </FilterBar>

      {loading ? (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-36 rounded-xl" />
          ))}
        </ul>
      ) : offers.length === 0 ? (
        <div className="border-line bg-surface-1 mt-4 rounded-xl border px-6 py-14 text-center shadow-md">
          <Ticket size={26} aria-hidden className="text-faint mx-auto" />
          <p className="mt-4 font-semibold">
            {filtered ? 'Nothing matches that' : 'No offers yet'}
          </p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
            {filtered
              ? 'Try a different search or status.'
              : 'An offer is a deal: so many videos, for so much. Creators will browse these and either take them or apply.'}
          </p>
          {filtered ? null : (
            <Button className="mt-6" onClick={onNew}>
              <Plus size={16} aria-hidden />
              Create the first offer
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {offers.map((offer) => (
              <li key={offer.id}>
                <OfferCard offer={offer} onEdit={() => onEdit(offer)} />
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-muted text-[0.8125rem]">
                Page {filters.page} of {pages}, {total} in total
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() => onSet({ page: String(filters.page - 1) })}
                >
                  <ChevronLeft size={15} aria-hidden />
                  Back
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page >= pages}
                  onClick={() => onSet({ page: String(filters.page + 1) })}
                >
                  Next
                  <ChevronRight size={15} aria-hidden />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function OfferCard({ offer, onEdit }: { offer: Offer; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const manage = useManageBrand();

  // An offer need not have either. A boosted commission rate has no fixed
  // deliverable and no fixed fee, so the terms row is left out rather than
  // printing "0 videos" and "$NaN".
  const hasVideos = offer.video_count !== null;
  const hasReward = offer.reward_amount !== null;
  const perVideo =
    hasVideos && hasReward && offer.video_count! > 0
      ? Number(offer.reward_amount) / offer.video_count!
      : null;

  return (
    <div
      className={cn(
        'bg-surface-1 flex h-full flex-col rounded-xl border p-5',
        offer.status === 'active' ? 'border-line' : 'border-line border-dashed'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {offer.badge_title ? (
          <span className="bg-accent-soft text-accent rounded-full px-2.5 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
            {offer.badge_title}
          </span>
        ) : null}
        {offer.status === 'inactive' ? (
          <span className="bg-surface-2 text-muted rounded-full px-2.5 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
            Inactive
          </span>
        ) : null}
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase',
            offer.needs_application
              ? 'bg-warning-soft text-warning'
              : 'bg-success-soft text-success'
          )}
        >
          {offer.needs_application ? 'Apply first' : 'Open to all'}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-bold">{offer.title}</h3>
      {offer.description ? (
        <p className="text-muted mt-2 line-clamp-3 text-[0.875rem] leading-relaxed">
          {offer.description}
        </p>
      ) : null}

      {hasVideos || hasReward ? (
        <div className="border-line mt-4 flex flex-wrap items-end gap-x-6 gap-y-2 border-t pt-4">
          {hasVideos ? (
            <span>
              <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                Videos
              </span>
              <span className="wx-numeric mt-1 block text-lg font-bold">
                {offer.video_count}
              </span>
            </span>
          ) : null}
          {hasReward ? (
            <span>
              <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                Reward
              </span>
              <span className="wx-numeric text-accent mt-1 block text-lg font-bold">
                {money(offer.reward_amount, offer.currency)}
              </span>
            </span>
          ) : null}
          {perVideo !== null ? (
            <span className="text-faint text-[0.75rem]">
              {money(perVideo, offer.currency)} per video
            </span>
          ) : null}
        </div>
      ) : (
        <p className="border-line text-faint mt-4 border-t pt-4 text-[0.75rem]">
          No fixed deliverable or fee on this one.
        </p>
      )}

      {confirming ? (
        <div className="border-danger/40 bg-danger-soft mt-4 rounded-xl border p-4">
          <p className="text-danger text-[0.8125rem] leading-relaxed font-medium">
            Delete this offer? It is removed for good, though the audit log keeps a record of
            what it was.
          </p>
          {manage.error ? (
            <p role="alert" className="text-danger mt-2 text-[0.75rem]">
              {(manage.error as Error).message}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={manage.isPending}
              onClick={() => manage.mutate({ action: 'offer.delete', offerId: offer.id })}
            >
              {manage.isPending ? 'Deleting...' : 'Yes, delete'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={manage.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil size={14} aria-hidden />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${offer.title}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={14} aria-hidden />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}
