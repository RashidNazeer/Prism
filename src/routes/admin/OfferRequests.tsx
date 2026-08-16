import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Check, Handshake, Search, Video, X } from 'lucide-react';
import { OfferReviewDialog } from '@/components/admin/OfferReviewDialog';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
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
import type { OfferApplicationStatus } from '@/lib/offer-stages';
import { JobProgressBar } from '@/components/work/JobProgress';
import { useJobProgressFor, type JobProgress } from '@/lib/work/job-progress';
import {
  isStale,
  standingFor,
  useLatestStageMoves,
  type StageMove,
} from '@/lib/work/stage-moves';

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

  /*
   * Two grouped reads over the rows ON THIS PAGE, never one per row: twenty
   * rows must not become forty round trips. Only approved requests have a job
   * behind them, so only they are asked about.
   */
  const jobIds = rows.filter((r) => r.status === 'approved').map((r) => r.id);
  const { data: progress } = useJobProgressFor(jobIds);
  const { data: moves } = useLatestStageMoves(jobIds);
  const pages = Math.max(1, Math.ceil(total / OFFER_QUEUE_PAGE_SIZE));

  return (
    <>
      {/*
        THE ROW IS THE TOP OF THE PAGE. There was a heading here that said
        "Offer requests" and a line under it that said what the screen was for;
        the shell now prints the section name as the page's h1 in the top bar, so
        the heading was the same words twice and the tagline explained the screen
        to somebody already standing on it. Rashid, 2026-08-16: "i don't want to
        show description of that section".

        The five states, the search and the dropdowns were three stacked rows.
        They are one now, in the shared `FilterBar`, so this queue cannot drift
        from the contests row he signed off. The accessible names the sr-only
        labels used to carry moved onto the controls as `aria-label`, unchanged.
      */}
      <FilterBar>
        <FilterTabs label="Filter requests">
          {TABS.map((t) => {
            const n =
              t.value === 'all' ? undefined : counts?.[t.value as OfferApplicationStatus];
            return (
              <FilterTab
                key={t.value}
                active={filters.status === t.value}
                // A zero is not worth printing on a queue tab: "Rejected 0"
                // reads as a number somebody has to go and check.
                count={n !== undefined && n > 0 ? n : undefined}
                onClick={() => setFilters({ status: t.value })}
              >
                {t.label}
              </FilterTab>
            );
          })}
        </FilterTabs>

        <form
          className="min-w-[10rem] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ search: searchDraft });
          }}
        >
          <div className="relative">
            <Search
              size={15}
              aria-hidden
              className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            />
            <Input
              type="search"
              name="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search creators"
              aria-label="Search by handle, name or email"
              className="h-10 rounded-md pl-9 text-[0.875rem]"
            />
          </div>
        </form>

        <Select
          name="brand"
          aria-label="Filter by brand"
          value={filters.brandId}
          onChange={(e) => setFilters({ brandId: e.target.value })}
          className="h-10 w-auto min-w-[8.5rem] shrink-0 rounded-md text-[0.875rem]"
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
          <Select
            name="stage"
            aria-label="Filter by stage"
            value={filters.stage}
            onChange={(e) => setFilters({ stage: (e.target.value || '') as OfferStage | '' })}
            className="h-10 w-auto min-w-[9rem] shrink-0 rounded-md text-[0.875rem]"
          >
            <option value="">Any stage</option>
            {OFFER_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_META[s].label}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          name="sort"
          aria-label="Sort"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value === 'oldest' ? 'oldest' : 'newest' })}
          className="h-10 w-auto min-w-[8.5rem] shrink-0 rounded-md text-[0.875rem]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </FilterBar>

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
              <li key={i} className="wx-skeleton h-28 rounded-xl" />
            ))}
          </ul>
        ) : isError ? (
          <div className="border-line bg-surface-1 rounded-xl border px-6 py-14 text-center shadow-md">
            <p className="font-semibold">That queue would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="border-line bg-surface-1 rounded-xl border px-6 py-16 text-center shadow-md">
            <Handshake size={26} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">
              {filters.status === 'pending' && !filters.search && !filters.brandId
                ? 'Nothing waiting on you'
                : 'Nothing matches that'}
            </p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
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
                  progress={progress?.get(row.id)}
                  lastMove={moves?.get(row.id)}
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
          <p className="wx-numeric text-muted text-[0.8125rem]">
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

      {dialog ? (
        <OfferReviewDialog
          row={dialog.row}
          decision={dialog.decision}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
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
  progress,
  lastMove,
  onDecide,
}: {
  row: OfferQueueRow;
  progress: JobProgress | undefined;
  lastMove: StageMove | undefined;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  const chip = STATUS_CHIP[row.status];
  const who = row.creator_handle ? `@${row.creator_handle}` : (row.creator_name ?? 'A creator');

  const agreed = row.status === 'approved';
  const terms = agreed
    ? {
        videos: row.committed_video_count,
        amount: row.committed_amount,
        currency: row.currency,
      }
    : {
        videos: row.offer?.video_count ?? null,
        amount: row.offer?.reward_amount ?? null,
        currency: row.offer?.currency ?? row.currency,
      };

  const standing = standingFor(row.stage_updated_at);
  const stale = isStale(row.stage_updated_at);

  return (
    <div className="border-line bg-surface-1 rounded-xl border p-4 shadow-md sm:p-5">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        {/* Who, and what they want. */}
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold break-all">{who}</p>
            {row.status !== 'pending' ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase',
                  chip.className
                )}
              >
                {chip.label}
              </span>
            ) : null}
          </div>

          <p className="text-muted mt-1 text-[0.875rem]">
            <span className="text-text font-medium">{row.offer?.title ?? 'An offer'}</span>
            {row.brand ? (
              <>
                {' '}
                at{' '}
                <Link
                  to={`/admin/brands/${row.brand.id}`}
                  className="decoration-line hover:text-accent underline underline-offset-2 transition-colors"
                >
                  {row.brand.name}
                </Link>
              </>
            ) : null}
          </p>

          <p className="text-faint mt-1 font-mono text-[0.6875rem]">
            {new Date(row.created_at).toLocaleString(undefined, {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {/*
          The deal. The largest thing on the row, because it is the only thing
          the decision actually turns on.

          WHICH deal depends on whether one has been struck. A pending request
          is somebody asking for the offer AS IT IS WRITTEN TODAY, so it shows
          the offer's own terms. An approved one shows what was agreed and
          charged to the brand, which is frozen on the request and stops
          matching the offer the moment anybody re-prices or re-scopes it. This
          row used to print the live offer in both cases, so the queue, the
          budget and the creator's own screen could give two answers about one
          promise.
        */}
        <div className="shrink-0">
          <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            {agreed ? 'Agreed' : 'They are asking for'}
          </span>
          {terms.amount != null ? (
            <span className="font-display mt-1 block text-[1.0625rem] font-semibold">
              {terms.videos !== null ? (
                <>
                  {terms.videos} {terms.videos === 1 ? 'video' : 'videos'} for{' '}
                </>
              ) : null}
              <span className="text-accent">{money(terms.amount, terms.currency)}</span>
            </span>
          ) : (
            // Nobody wrote the terms down. Say so, rather than printing a zero
            // somebody reads as a real number.
            <span className="text-muted mt-1 block text-[0.875rem]">
              {agreed ? 'No fixed fee on this one' : 'Terms not set on the offer'}
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

      {/*
        What the stage cannot say: whether they have actually filmed anything.
        A job at "content pending" for three weeks with four of five approved is
        a different conversation from one at the same stage with nothing posted,
        and until now the queue showed both identically.
      */}
      {agreed && progress ? (
        <div className="border-line mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t pt-3">
          <JobProgressBar progress={progress} className="min-w-[210px] flex-1" compact />

          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
            {standing ? (
              <span className="text-[0.78125rem]">
                <span className="text-muted">Standing here </span>
                <span className={cn('font-medium', stale ? 'text-stage-due' : 'text-text')}>
                  {standing}
                </span>
              </span>
            ) : null}
            <Link
              to={`/admin/content?search=${encodeURIComponent(row.creator_handle ?? '')}`}
              className="text-muted hover:text-accent inline-flex items-center gap-1.5 text-[0.78125rem] transition-colors"
            >
              <Video size={13} aria-hidden />
              Their videos
            </Link>
          </div>
        </div>
      ) : null}

      {/*
        The last thing that happened, in the words the CREATOR was given. An
        admin picking this row up should not have to guess what the last person
        told them.
      */}
      {agreed && lastMove ? (
        <p className="text-muted mt-2 text-[0.78125rem] leading-relaxed">
          <span className="text-faint">Last move: </span>
          {lastMove.from_stage ? `${STAGE_META[lastMove.from_stage].label} to ` : ''}
          {STAGE_META[lastMove.to_stage].label}
          {lastMove.note ? <span className="text-text">, {lastMove.note}</span> : null}
        </p>
      ) : null}

      {row.note ? (
        <p className="border-line text-muted mt-3 border-t pt-3 text-[0.8125rem] leading-relaxed">
          {row.note}
        </p>
      ) : null}

      {row.decision_note ? (
        <p className="border-line text-faint mt-3 border-t pt-3 text-[0.8125rem] leading-relaxed">
          <span className="text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
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
      <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
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
          className="h-9 w-48 text-[0.8125rem]"
        >
          {OFFER_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_META[s].label}
            </option>
          ))}
        </Select>
      </div>
      {setStage.error ? (
        <p role="alert" className="text-danger mt-1 text-[0.75rem]">
          {(setStage.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}
