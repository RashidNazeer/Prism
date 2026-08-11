import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Search, Tag, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { money } from '@/lib/admin/useBrands';
import {
  ALL_OFFERS_PAGE_SIZE,
  DEFAULT_ALL_OFFERS_FILTERS,
  useAllOffers,
  useBrandsWithOffers,
  useOfferContent,
  useOfferPeople,
  useOfferStatusCounts,
  type AllOffersFilters,
  type AllOffersRow,
  type OfferContent,
  type OfferKindFilter,
  type OfferPeople,
  type OfferStatusFilter,
} from '@/lib/admin/useAllOffers';

/**
 * Every offer we run, across every brand.
 *
 * The Brand Hub answers "what is this brand offering". This answers what cuts
 * across brands: what is live, who is on it, and what is waiting on somebody.
 * Before this existed the only way to see an offer was to remember which brand
 * it belonged to and go in through the hub.
 *
 * Layout follows CLAUDE.md: the work starts high, there is no block of tiles
 * above it, and the numbers that decide anything are the largest thing on a row.
 */
const STATUS_TABS: { value: OfferStatusFilter; label: string }[] = [
  { value: 'active', label: 'Live' },
  { value: 'inactive', label: 'Switched off' },
  { value: 'all', label: 'All' },
];

const isStatus = (v: string | null): v is OfferStatusFilter =>
  v === 'active' || v === 'inactive' || v === 'all';
const isKind = (v: string | null): v is OfferKindFilter =>
  v === 'all' || v === 'application' || v === 'open';

export function AllOffers() {
  const [params, setParams] = useSearchParams();

  const statusParam = params.get('status');
  const kindParam = params.get('kind');
  const sortParam = params.get('sort');

  const filters: AllOffersFilters = {
    status: isStatus(statusParam) ? statusParam : DEFAULT_ALL_OFFERS_FILTERS.status,
    kind: isKind(kindParam) ? kindParam : 'all',
    brandId: params.get('brand') ?? '',
    search: params.get('q') ?? '',
    sort: sortParam === 'oldest' ? 'oldest' : sortParam === 'reward' ? 'reward' : 'newest',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  const [searchDraft, setSearchDraft] = useState(filters.search);
  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  // Filters live in the URL, so a view can be sent to somebody else.
  const setFilters = (next: Partial<AllOffersFilters>) => {
    const merged = { ...filters, ...next };
    if (next.page === undefined) merged.page = 1;

    const p = new URLSearchParams();
    if (merged.status !== DEFAULT_ALL_OFFERS_FILTERS.status) p.set('status', merged.status);
    if (merged.kind !== 'all') p.set('kind', merged.kind);
    if (merged.brandId) p.set('brand', merged.brandId);
    if (merged.search) p.set('q', merged.search);
    if (merged.sort !== 'newest') p.set('sort', merged.sort);
    if (merged.page > 1) p.set('page', String(merged.page));
    setParams(p, { replace: true });
  };

  const { data, isLoading, isError, error, isPlaceholderData } = useAllOffers(filters);
  const { data: counts } = useOfferStatusCounts();
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

  return (
    <AppShell>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-[clamp(1.4rem,3.5vw,1.9rem)] font-extrabold">Offers</h1>
        <p className="text-muted text-[14px]">Every deal on the table, across every brand.</p>
      </div>

      {/* ------------------------------------------------------------ tabs -- */}
      <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Filter offers"
          className="border-line bg-surface-1 inline-flex min-w-max rounded-xl border p-1"
        >
          {STATUS_TABS.map((t) => {
            const n =
              t.value === 'active'
                ? counts?.active
                : t.value === 'inactive'
                  ? counts?.inactive
                  : undefined;
            return (
              <button
                key={t.value}
                role="tab"
                type="button"
                aria-selected={filters.status === t.value}
                onClick={() => setFilters({ status: t.value })}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 sm:px-3.5',
                  filters.status === t.value
                    ? 'bg-accent text-on-accent'
                    : 'text-muted hover:text-accent'
                )}
              >
                {t.label}
                {n !== undefined && n > 0 ? (
                  <span
                    className={cn(
                      'wx-numeric ml-1.5 text-[12px]',
                      filters.status === t.value ? 'text-on-accent/80' : 'text-faint'
                    )}
                  >
                    {n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* --------------------------------------------------------- filters -- */}
      <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:gap-3">
        <form
          className="relative min-w-0 flex-1 basis-52"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ search: searchDraft });
          }}
        >
          <Search
            size={15}
            aria-hidden
            className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
          />
          <input
            type="search"
            name="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search offers"
            aria-label="Search offers by title"
            className="border-line-interactive bg-surface-1 placeholder:text-faint hover:border-accent/60 focus:border-accent h-9 w-full rounded-xl border pr-3 pl-9 text-[13px] focus:outline-none"
          />
        </form>

        <label className="sr-only" htmlFor="brand-filter">
          Filter by brand
        </label>
        <Select
          id="brand-filter"
          name="brand"
          value={filters.brandId}
          onChange={(e) => setFilters({ brandId: e.target.value })}
          className="h-9 basis-44 text-[13px]"
        >
          <option value="">All brands</option>
          {(brands ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>

        <label className="sr-only" htmlFor="kind-filter">
          Filter by type
        </label>
        <Select
          id="kind-filter"
          name="kind"
          value={filters.kind}
          onChange={(e) => setFilters({ kind: e.target.value as OfferKindFilter })}
          className="h-9 basis-44 text-[13px]"
        >
          <option value="all">Any type</option>
          <option value="application">Needs applying for</option>
          <option value="open">Open to everyone</option>
        </Select>

        <label className="sr-only" htmlFor="sort-filter">
          Sort
        </label>
        <Select
          id="sort-filter"
          name="sort"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as AllOffersFilters['sort'] })}
          className="h-9 basis-40 text-[13px]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="reward">Highest paying</option>
        </Select>
      </div>

      {/* ------------------------------------------------------------ list -- */}
      <div
        className={cn(
          'mt-4 transition-opacity duration-200',
          isPlaceholderData && 'opacity-60'
        )}
      >
        {isLoading ? (
          <ul className="grid gap-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="wx-skeleton h-28 rounded-[20px]" />
            ))}
          </ul>
        ) : isError ? (
          <div className="border-line bg-surface-1 rounded-[20px] border px-6 py-14 text-center shadow-md">
            <p className="font-semibold">That list would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="border-line bg-surface-1 rounded-[20px] border px-6 py-16 text-center shadow-md">
            <Tag size={26} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">No offers match that</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
              Offers are created inside a brand hub. Try a different search, brand or status.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {rows.map((offer) => (
              <li key={offer.id}>
                <OfferRow
                  offer={offer}
                  people={people?.[offer.id]}
                  content={content?.[offer.id]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------ pagination -- */}
      {total > ALL_OFFERS_PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="wx-numeric text-muted text-[13px]">
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
            <span className="wx-numeric text-muted px-1 font-mono text-[12px]">
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
    </AppShell>
  );
}

/* ------------------------------------------------------------------ row -- */

function OfferRow({
  offer,
  people,
  content,
}: {
  offer: AllOffersRow;
  people: OfferPeople | undefined;
  content: OfferContent | undefined;
}) {
  const hasTerms = offer.video_count !== null && offer.reward_amount !== null;
  const on = people?.approved ?? 0;
  const waiting = people?.pending ?? 0;

  return (
    <div className="border-line bg-surface-1 rounded-[20px] border p-4 shadow-md sm:p-5">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold break-words">{offer.title}</p>
            {offer.badge_title ? (
              <span className="bg-accent-soft text-accent rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase">
                {offer.badge_title}
              </span>
            ) : null}
            {offer.status === 'inactive' ? (
              <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase">
                Switched off
              </span>
            ) : null}
            {offer.brand && !offer.brand.is_active ? (
              <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase">
                Brand retired
              </span>
            ) : null}
          </div>

          <p className="text-muted mt-1 text-[14px]">
            {offer.brand ? (
              <Link
                to={`/admin/brands/${offer.brand.id}`}
                className="decoration-line hover:text-accent underline underline-offset-2 transition-colors"
              >
                {offer.brand.name}
              </Link>
            ) : (
              'Unknown brand'
            )}
          </p>
        </div>

        {/* The deal. */}
        <div className="shrink-0">
          <span className="text-muted block text-[11px] font-semibold tracking-[0.14em] uppercase">
            The deal
          </span>
          {hasTerms ? (
            <span className="wx-numeric mt-1 block text-[16px] font-bold">
              {offer.video_count} {offer.video_count === 1 ? 'video' : 'videos'} for{' '}
              <span className="text-accent">{money(offer.reward_amount, offer.currency)}</span>
            </span>
          ) : (
            <span className="text-muted mt-1 block text-[14px]">No fixed terms</span>
          )}
        </div>

        {/*
          Who is on it, decided by what came back rather than by the flag.

          An offer with nobody on it and no application needed belongs to the
          whole roster: there is genuinely no row to count, so it says that
          instead of a zero that reads like nobody wanted it. But an offer with
          people on it reports them WHATEVER the flag says, because switching
          the flag off does not send six creators home.
        */}
        <div className="shrink-0">
          <span className="text-muted block text-[11px] font-semibold tracking-[0.14em] uppercase">
            Creators
          </span>
          {on > 0 || waiting > 0 ? (
            <span className="mt-1 flex items-center gap-3">
              <span className="font-display inline-flex items-center gap-1.5 text-[16px] font-semibold">
                <Users size={14} aria-hidden className="text-faint" />
                <span className="wx-numeric">{on}</span>
              </span>
              {waiting > 0 ? (
                <Link
                  to={`/admin/offers/requests?brand=${offer.brand_id}`}
                  className="bg-stage-due-soft text-stage-due inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-opacity hover:opacity-80"
                >
                  <span className="wx-numeric">{waiting}</span> waiting
                </Link>
              ) : null}
              {!offer.needs_application ? (
                <span className="text-faint text-[12px]">plus anyone else</span>
              ) : null}
            </span>
          ) : offer.needs_application ? (
            <span className="text-muted mt-1 block text-[14px]">Nobody yet</span>
          ) : (
            <span className="text-stage-paid mt-1 block text-[14px]">Open to everyone</span>
          )}
        </div>

        {/* What has actually been filmed against it. Same grouped read shape:
            one query for the whole page, never one per row. */}
        <div className="shrink-0">
          <span className="text-muted block text-[11px] font-semibold tracking-[0.14em] uppercase">
            Videos in
          </span>
          {content ? (
            <span className="mt-1 flex items-center gap-3">
              <span className="font-display text-[16px] font-semibold">
                <span className="text-stage-paid wx-numeric">{content.approved}</span>
                <span className="text-faint"> approved</span>
              </span>
              {content.submitted > 0 ? (
                <Link
                  to={`/admin/content?tab=submitted`}
                  className="bg-stage-live-soft text-stage-live inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-opacity hover:opacity-80"
                >
                  <span className="wx-numeric">{content.submitted}</span> to watch
                </Link>
              ) : null}
            </span>
          ) : (
            <span className="text-muted mt-1 block text-[14px]">Nothing yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
