import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Handshake,
  Search,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { OfferReviewDialog } from '@/components/admin/OfferReviewDialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { isStage, OFFER_STAGES, STAGE_META, type OfferStage } from '@/lib/offer-stages';
import {
  DEFAULT_OFFER_FILTERS,
  OFFER_QUEUE_PAGE_SIZE,
  useBrandsWithRequests,
  useOfferApplicationCounts,
  useOfferApplications,
  useSetOfferStage,
  type OfferQueueFilters,
  type OfferQueueRow,
  type OfferStatusFilter,
} from '@/lib/admin/useOfferApplications';
import type { OfferApplicationStatus } from '@/lib/creator/useOfferApplications';

/**
 * Every creator asking for an offer, in one queue.
 *
 * Deliberately not a tab inside a brand. A request is a decision about one
 * person and one deal, and the person deciding wants them all in front of them
 * rather than hidden one brand at a time. Filter by brand when you do want that.
 *
 * The layout follows the rules in CLAUDE.md: the work starts high, there is no
 * block of tiles above it, and the numbers being agreed to are the largest
 * thing on each row.
 */
const TABS: { value: OfferStatusFilter; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'all', label: 'All' },
];

const isStatus = (v: string | null): v is OfferStatusFilter =>
  v === 'pending' || v === 'approved' || v === 'rejected' || v === 'withdrawn' || v === 'all';

export function OfferRequests() {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{
    row: OfferQueueRow;
    decision: 'approved' | 'rejected';
  } | null>(null);

  const statusParam = params.get('status');
  const stageParam = params.get('stage');
  const filters: OfferQueueFilters = {
    status: isStatus(statusParam) ? statusParam : DEFAULT_OFFER_FILTERS.status,
    brandId: params.get('brand') ?? '',
    stage: isStage(stageParam) ? stageParam : '',
    search: params.get('q') ?? '',
    sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  const [searchDraft, setSearchDraft] = useState(filters.search);
  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  // Filters live in the URL, so a view can be sent to somebody else.
  const setFilters = (next: Partial<OfferQueueFilters>) => {
    const merged = { ...filters, ...next };
    if (next.page === undefined) merged.page = 1;

    const p = new URLSearchParams();
    if (merged.status !== DEFAULT_OFFER_FILTERS.status) p.set('status', merged.status);
    if (merged.brandId) p.set('brand', merged.brandId);
    if (merged.stage) p.set('stage', merged.stage);
    if (merged.search) p.set('q', merged.search);
    if (merged.sort !== 'newest') p.set('sort', merged.sort);
    if (merged.page > 1) p.set('page', String(merged.page));
    setParams(p, { replace: true });
  };

  const { data, isLoading, isError, error, isPlaceholderData } = useOfferApplications(filters);
  const { data: counts } = useOfferApplicationCounts();
  const { data: brands } = useBrandsWithRequests();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / OFFER_QUEUE_PAGE_SIZE));

  return (
    <AppShell>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-[clamp(1.4rem,3.5vw,1.9rem)] font-extrabold">Offer requests</h1>
        <p className="text-[14px] text-muted">
          Creators asking to take an offer, or offering their own terms.
        </p>
      </div>

      {/* ------------------------------------------------------------ tabs -- */}
      <div className="mt-5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Filter requests"
          className="inline-flex min-w-max rounded-xl border border-line bg-surface-1 p-1"
        >
          {TABS.map((t) => {
            const n =
              t.value === 'all'
                ? undefined
                : counts?.[t.value as OfferApplicationStatus];
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
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            name="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search creators"
            aria-label="Search by handle, name or email"
            className="h-9 w-full rounded-xl border border-line-interactive bg-surface-1 pr-3 pl-9 text-[13px] placeholder:text-faint hover:border-accent/60 focus:border-accent focus:outline-none"
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

        {/* Only meaningful on approved work: nothing else has a stage. Hidden
            elsewhere rather than shown doing nothing. */}
        {filters.status === 'approved' || filters.status === 'all' ? (
          <>
            <label className="sr-only" htmlFor="stage-filter">
              Filter by stage
            </label>
            <Select
              id="stage-filter"
              name="stage"
              value={filters.stage}
              onChange={(e) => setFilters({ stage: (e.target.value || '') as OfferStage | '' })}
              className="h-9 basis-48 text-[13px]"
            >
              <option value="">Any stage</option>
              {OFFER_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_META[s].label}
                </option>
              ))}
            </Select>
          </>
        ) : null}

        <label className="sr-only" htmlFor="sort-filter">
          Sort
        </label>
        <Select
          id="sort-filter"
          name="sort"
          value={filters.sort}
          onChange={(e) =>
            setFilters({ sort: e.target.value === 'oldest' ? 'oldest' : 'newest' })
          }
          className="h-9 basis-36 text-[13px]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>

      {/* ------------------------------------------------------------ list -- */}
      <div className={cn('mt-4 transition-opacity duration-200', isPlaceholderData && 'opacity-60')}>
        {isLoading ? (
          <ul className="grid gap-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="h-28 animate-pulse rounded-2xl bg-surface-1" />
            ))}
          </ul>
        ) : isError ? (
          <div className="rounded-2xl border border-line bg-surface-1 px-6 py-14 text-center">
            <p className="font-semibold">That queue would not load</p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface-1 px-6 py-16 text-center">
            <Handshake size={26} aria-hidden className="mx-auto text-faint" />
            <p className="mt-4 font-semibold">
              {filters.status === 'pending' && !filters.search && !filters.brandId
                ? 'Nothing waiting on you'
                : 'Nothing matches that'}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
              {filters.status === 'pending' && !filters.search && !filters.brandId
                ? 'Requests land here the moment a creator asks for an offer.'
                : 'Try a different search, brand or status.'}
            </p>
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {rows.map((row) => (
              <li key={row.id}>
                <RequestRow
                  row={row}
                  onDecide={(decision) => setDialog({ row, decision })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------ pagination -- */}
      {total > OFFER_QUEUE_PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="wx-numeric text-[13px] text-muted">
            {(filters.page - 1) * OFFER_QUEUE_PAGE_SIZE + 1} to{' '}
            {Math.min(filters.page * OFFER_QUEUE_PAGE_SIZE, total)} of {total}
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
            <span className="wx-numeric px-1 font-mono text-[12px] text-muted">
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

      {dialog ? (
        <OfferReviewDialog
          row={dialog.row}
          decision={dialog.decision}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ row -- */

const STATUS_CHIP: Record<OfferApplicationStatus, { label: string; className: string }> = {
  pending: { label: 'Waiting', className: 'bg-warning-soft text-warning' },
  approved: { label: 'Approved', className: 'bg-success-soft text-success' },
  rejected: { label: 'Rejected', className: 'bg-danger-soft text-danger' },
  withdrawn: { label: 'Withdrawn', className: 'bg-surface-2 text-muted' },
};

function RequestRow({
  row,
  onDecide,
}: {
  row: OfferQueueRow;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  const chip = STATUS_CHIP[row.status];
  const who = row.creator_handle ? `@${row.creator_handle}` : (row.creator_name ?? 'A creator');

  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        {/* Who, and what they want. */}
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold break-all">{who}</p>
            {row.status !== 'pending' ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase',
                  chip.className
                )}
              >
                {chip.label}
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-[14px] text-muted">
            <span className="font-medium text-text">{row.offer?.title ?? 'An offer'}</span>
            {row.brand ? (
              <>
                {' '}
                at{' '}
                <Link
                  to={`/admin/brands/${row.brand.id}`}
                  className="underline decoration-line underline-offset-2 transition-colors hover:text-accent"
                >
                  {row.brand.name}
                </Link>
              </>
            ) : null}
          </p>

          <p className="mt-1 font-mono text-[11px] text-faint">
            {new Date(row.created_at).toLocaleString(undefined, {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {/* The deal being agreed to. The largest thing on the row, because it
            is the only thing the decision actually turns on. It is always the
            offer's own terms: a creator takes an offer as it is written. */}
        <div className="shrink-0">
          <span className="block font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
            They are asking for
          </span>
          {row.offer?.video_count !== null && row.offer?.reward_amount != null ? (
            <span className="wx-numeric mt-1 block text-[17px] font-bold">
              {row.offer.video_count}{' '}
              {row.offer.video_count === 1 ? 'video' : 'videos'} for{' '}
              <span className="text-accent">
                {money(row.offer.reward_amount, row.offer.currency)}
              </span>
            </span>
          ) : (
            // The admin never wrote the terms down. Say so, rather than
            // printing a zero somebody reads as a real number.
            <span className="mt-1 block text-[14px] text-muted">
              Terms not set on the offer
            </span>
          )}
        </div>

        {row.status === 'pending' ? (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => onDecide('approved')}>
              <Check size={15} aria-hidden />
              Approve
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onDecide('rejected')}>
              <X size={15} aria-hidden />
              Reject
            </Button>
          </div>
        ) : row.stage ? (
          <StageControl row={row} />
        ) : null}
      </div>

      {row.note ? (
        <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-muted">
          {row.note}
        </p>
      ) : null}

      {row.decision_note ? (
        <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-faint">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase">
            You said
          </span>{' '}
          {row.decision_note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Where an approved request has got to, and how to move it.
 *
 * Applies on change with no confirmation step. Seven stages across every
 * creator on every brand is a great deal of clicking, none of it destructive,
 * all of it audited, and every one of them reversible by picking a different
 * stage. A dialog per move would get worked around within a week.
 *
 * The creator is told immediately. That is the point of the whole thing.
 */
function StageControl({ row }: { row: OfferQueueRow }) {
  const setStage = useSetOfferStage();
  const current = row.stage!;
  const meta = STAGE_META[current];
  const Icon = meta.icon;

  return (
    <div className="min-w-0 shrink-0">
      <span className="block font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
        Stage
      </span>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-full',
            current === 'paid' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent'
          )}
        >
          <Icon size={14} aria-hidden />
        </span>
        <label className="sr-only" htmlFor={`stage-${row.id}`}>
          Stage for {row.creator_handle ?? 'this creator'}
        </label>
        <Select
          id={`stage-${row.id}`}
          name="stage"
          value={current}
          disabled={setStage.isPending}
          onChange={(e) =>
            setStage.mutate({
              applicationId: row.id,
              stage: e.target.value as OfferStage,
            })
          }
          className="h-9 w-48 text-[13px]"
        >
          {OFFER_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_META[s].label}
            </option>
          ))}
        </Select>
      </div>
      {setStage.error ? (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {(setStage.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}
