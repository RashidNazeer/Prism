import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { m, useReducedMotion } from 'motion/react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Handshake,
  Search,
  Video,
  X,
} from 'lucide-react';
import { OfferReviewDialog } from '@/components/admin/OfferReviewDialog';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { CreatorFace } from '@/components/work/CreatorFace';
import { useCreatorAvatars } from '@/lib/admin/useCreatorAvatars';
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
 * REBUILT AS A GRID OF CARDS ON 2026-08-21, right after the offers screen, on
 * Rashid's *"i like it do something with this as well do the same"*. Same
 * language throughout: `rounded-md`, three sections split by hairlines, the
 * money as the hero with the rate as its caption, and a panel that opens across
 * the whole row with the details beside the card above `lg`.
 *
 * IT IS A QUEUE, THOUGH, AND THAT CHANGES ONE THING. Every card carries a
 * control that writes — Approve and Reject on a waiting request, the stage
 * dropdown on an approved one — and those have to stay one click away rather
 * than behind an expand. So the card is split: the reading matter is a button
 * that opens the details, and the action bar sits outside it. See `RequestCard`.
 *
 * The layout follows the rules in CLAUDE.md: the work starts high, there is no
 * block of tiles above it, and the numbers being agreed to are the largest
 * thing on each card.
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

  /*
   * ONE CARD OPEN AT A TIME, held by request id rather than by index: a filter
   * or a page change reshuffles the queue, and an index would leave a different
   * creator's card standing open with somebody else's note under it.
   */
  const [openId, setOpenId] = useState<string | null>(null);

  // Filters live in the URL, so a view can be sent to somebody else.
  const setFilters = (next: Partial<OfferQueueFilters>) => {
    const merged = { ...filters, ...next };
    if (next.page === undefined) merged.page = 1;
    setOpenId(null);

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
  // One query and one batch of signed URLs for the page being drawn.
  const faces = useCreatorAvatars(rows.map((r) => r.creator_id));
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
          onChange={(e) =>
            setFilters({ sort: e.target.value === 'oldest' ? 'oldest' : 'newest' })
          }
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
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="wx-skeleton h-[16rem] rounded-md" />
            ))}
          </ul>
        ) : isError ? (
          <div className="border-line bg-surface-1 rounded-md border px-6 py-14 text-center shadow-md">
            <p className="font-semibold">That queue would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="border-line bg-surface-1 rounded-md border px-6 py-16 text-center shadow-md">
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
          /*
           * `items-start`, and the open card spans the row. Same reasoning as
           * the offers grid: a grid row is as tall as its tallest item, so a
           * card that grew in place left the cards beside it short with blank
           * space under them.
           */
          <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className={cn(openId === row.id && 'sm:col-span-2 xl:col-span-3')}
              >
                <RequestCard
                  row={row}
                  face={faces[row.creator_id]}
                  progress={progress?.get(row.id)}
                  lastMove={moves?.get(row.id)}
                  open={openId === row.id}
                  onToggle={() => setOpenId((id) => (id === row.id ? null : row.id))}
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

/* ----------------------------------------------------------------- card -- */

const STATUS_CHIP: Record<OfferApplicationStatus, { label: string; className: string }> = {
  pending: { label: 'Waiting', className: 'bg-warning-soft text-warning' },
  approved: { label: 'Approved', className: 'bg-success-soft text-success' },
  rejected: { label: 'Rejected', className: 'bg-danger-soft text-danger' },
  withdrawn: { label: 'Withdrawn', className: 'bg-surface-2 text-muted' },
};

/**
 * One request, as a card.
 *
 * REBUILT 2026-08-21 to match the offers grid, on Rashid's "i like it do
 * something with this as well do the same". Same language: three sections
 * divided by hairlines, `rounded-md`, the money as the hero, and a panel that
 * opens across the whole row.
 *
 * WHAT IS DIFFERENT FROM THE OFFERS CARD, and it is the whole design problem
 * here: this is a QUEUE, not a catalogue. Every card carries a control that
 * changes data — Approve and Reject on a waiting request, the stage dropdown on
 * an approved one — and those must stay one click away. So the card is split:
 *
 *   sections 1 and 2 are a BUTTON that opens the details;
 *   section 3 is a plain action bar, OUTSIDE that button.
 *
 * A `<select>` or a `<button>` nested inside another button is invalid HTML that
 * browsers resolve by guessing, and the guess is usually that the outer one
 * wins — which would mean clicking the stage dropdown expanded the card instead
 * of opening the list.
 *
 * WHAT STAYS ON THE CARD is what a decision turns on: who, which offer, the
 * money, how much has actually been filmed, and how long it has been sitting
 * there. What moves into the panel is what you read AFTER deciding to look:
 * when they asked, the last move in the creator's own words, their note, and
 * what you told them.
 *
 * NO "APPROVED" CHIP ON AN APPROVED CARD. The Approved tab was forty-one
 * identical green pills saying what the tab already said, and a card carrying a
 * stage dropdown is approved by definition. The chip is kept for rejected and
 * withdrawn, which are the two that would otherwise be indistinguishable.
 */
function RequestCard({
  row,
  progress,
  lastMove,
  face,
  open,
  onToggle,
  onDecide,
}: {
  row: OfferQueueRow;
  progress: JobProgress | undefined;
  lastMove: StageMove | undefined;
  face: string | undefined;
  open: boolean;
  onToggle: () => void;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  const reduced = useReducedMotion();

  const chip = STATUS_CHIP[row.status];
  const who = row.creator_handle ? `@${row.creator_handle}` : (row.creator_name ?? 'A creator');
  const panelId = `request-details-${row.id}`;

  const agreed = row.status === 'approved';

  /*
   * WHICH deal depends on whether one has been struck. A pending request is
   * somebody asking for the offer AS IT IS WRITTEN TODAY, so it shows the
   * offer's own terms. An approved one shows what was agreed and charged to the
   * brand, which is frozen on the request and stops matching the offer the
   * moment anybody re-prices or re-scopes it. This used to print the live offer
   * in both cases, so the queue, the budget and the creator's own screen could
   * give two answers about one promise.
   */
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

  const perVideo =
    terms.amount != null && terms.videos !== null && terms.videos > 0
      ? Number(terms.amount) / terms.videos
      : null;

  const standing = standingFor(row.stage_updated_at);
  const stale = isStale(row.stage_updated_at);

  return (
    <div
      className={cn(
        'wx-glass flex overflow-hidden rounded-md transition-[border-color,box-shadow,transform] duration-300',
        open ? 'flex-col lg:flex-row lg:items-stretch' : 'flex-col',
        !open &&
          'hover:border-line-strong hover:-translate-y-0.5 hover:shadow-[var(--wx-glass-glow)]',
        open && 'border-accent/60 shadow-[var(--wx-glass-glow)]'
      )}
    >
      <div className={cn('flex min-w-0 flex-col', open && 'lg:w-[23rem] lg:shrink-0')}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="group focus-visible:outline-accent flex flex-1 flex-col text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          {/* ------------------------------------------------- 1. who it is -- */}
          <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
            <CreatorFace
              src={face}
              name={row.creator_name}
              handle={row.creator_handle}
              size={34}
            />
            <span className="min-w-0 flex-1">
              <span className="text-text group-hover:text-accent block truncate font-semibold transition-colors">
                {who}
              </span>
              {row.creator_name && row.creator_handle ? (
                <span className="text-faint block truncate text-[0.75rem]">
                  {row.creator_name}
                </span>
              ) : null}
            </span>

            {row.status === 'rejected' || row.status === 'withdrawn' ? (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase',
                  chip.className
                )}
              >
                {chip.label}
              </span>
            ) : null}

            <ChevronDown
              size={16}
              aria-hidden
              className={cn(
                'text-faint group-hover:text-accent shrink-0 transition-transform duration-300',
                open && 'rotate-180'
              )}
            />
          </div>

          {/* --------------------------------- 2. the offer, and the money -- */}
          <div className="border-line flex flex-1 flex-col gap-3 border-t px-4 pt-3.5 pb-4">
            <div>
              {/* Plain text, not a link: this whole block is a button, and an
                  anchor inside one is invalid. The brand links from the panel. */}
              <span className="bg-surface-2 border-line text-text mb-2 inline-block max-w-full truncate rounded-full border px-2.5 py-1 font-mono text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
                {row.brand?.name ?? 'Unknown brand'}
              </span>
              {/* Two lines exactly, so no card in a row is taller or shorter
                  than its neighbours. */}
              <p className="text-text line-clamp-2 min-h-[2.6rem] text-[0.9375rem] leading-snug font-semibold">
                {row.offer?.title ?? 'An offer'}
              </p>
            </div>

            <div>
              <span className="text-faint block text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
                {agreed ? 'Agreed' : 'They are asking for'}
              </span>
              {terms.amount != null ? (
                <>
                  <p className="font-display text-accent wx-numeric mt-1 text-[1.625rem] leading-none font-bold tracking-tight">
                    {money(terms.amount, terms.currency)}
                  </p>
                  <p className="text-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
                    {terms.videos !== null ? (
                      <span>
                        <span className="wx-numeric text-text font-semibold">{terms.videos}</span>{' '}
                        {terms.videos === 1 ? 'video' : 'videos'}
                      </span>
                    ) : null}
                    {perVideo !== null ? (
                      <>
                        <span aria-hidden className="text-faint">
                          ·
                        </span>
                        <span>
                          <span className="wx-numeric text-text font-semibold">
                            {money(perVideo, terms.currency)}
                          </span>{' '}
                          each
                        </span>
                      </>
                    ) : null}
                  </p>
                </>
              ) : (
                // Nobody wrote the terms down. Say so, rather than printing a
                // zero somebody reads as a real number.
                <p className="text-muted mt-1 text-[0.875rem]">
                  {agreed ? 'No fixed fee on this one' : 'Terms not set on the offer'}
                </p>
              )}
            </div>

            {/*
              What the stage cannot say: whether they have actually filmed
              anything. A job at "content pending" for three weeks with four of
              five approved is a different conversation from one at the same
              stage with nothing posted, and the queue used to show both
              identically. `mt-auto` pins it to the bottom so the bars line up
              across a row whatever the title did above them.
            */}
            {agreed && progress ? (
              <div className="mt-auto">
                <JobProgressBar progress={progress} compact />
                {/* Only the standing. The bar already writes "0 of 5 approved,
                    5 still to film" underneath itself, and saying it twice is
                    what the old row did in two different places. */}
                {standing ? (
                  <p
                    className={cn(
                      'mt-1 text-[0.75rem]',
                      stale ? 'text-stage-due font-semibold' : 'text-faint'
                    )}
                  >
                    {standing} at this stage
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </button>

        {/*
          3. THE ACTION BAR, and it is outside the button on purpose. Everything
          in here changes data, and a control nested inside another control is
          invalid HTML that browsers resolve by guessing.
        */}
        {row.status === 'pending' ? (
          <div className="border-line bg-surface-2/40 flex gap-2 border-t px-4 py-2.5">
            <Button size="sm" className="flex-1" onClick={() => onDecide('approved')}>
              <Check size={15} aria-hidden />
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => onDecide('rejected')}
            >
              <X size={15} aria-hidden />
              Reject
            </Button>
          </div>
        ) : row.stage ? (
          <div className="border-line bg-surface-2/40 border-t px-4 py-2.5">
            <StageControl row={row} />
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------- 4. details -- */}
      {open ? (
        <m.div
          id={panelId}
          // Opacity and a short rise, not height: this is a column child on a
          // phone and a row child on a laptop, and a height animation is only
          // right in one of them.
          initial={reduced ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="border-line min-w-0 flex-1 border-t lg:border-t-0 lg:border-l"
        >
          <div className="flex flex-col gap-4 px-4 py-4 lg:px-5 lg:py-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4 lg:gap-x-6">
              <Fact
                label="Asked"
                value={new Date(row.created_at).toLocaleString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
              <Fact label="Status" value={chip.label} />
              {agreed ? (
                <Fact
                  label="Standing here"
                  value={
                    standing ? (
                      <span className={cn(stale ? 'text-stage-due font-semibold' : undefined)}>
                        {standing}
                      </span>
                    ) : (
                      'Just moved'
                    )
                  }
                />
              ) : null}
              {/* Not "still to film": the progress bar on the card already
                  writes that sentence under itself, and a panel that repeats
                  the card is what the old row did in two places at once. */}
              {row.decided_at ? (
                <Fact
                  label="Decided"
                  value={new Date(row.decided_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                />
              ) : null}
            </dl>

            {/*
              The last thing that happened, in the words the CREATOR was given.
              An admin picking this up should not have to guess what the last
              person told them.
            */}
            {agreed && lastMove ? (
              <div>
                <span className="text-faint block text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
                  Last move
                </span>
                <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
                  {lastMove.from_stage ? `${STAGE_META[lastMove.from_stage].label} to ` : ''}
                  {STAGE_META[lastMove.to_stage].label}
                  {lastMove.note ? <span className="text-text">, {lastMove.note}</span> : null}
                </p>
              </div>
            ) : null}

            {row.note ? (
              <div>
                <span className="text-faint block text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
                  They said
                </span>
                <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">{row.note}</p>
              </div>
            ) : null}

            {row.decision_note ? (
              <div>
                <span className="text-faint block text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
                  You said
                </span>
                <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
                  {row.decision_note}
                </p>
              </div>
            ) : null}

            <div className="border-line flex flex-wrap gap-2 border-t pt-3">
              {row.brand ? (
                <Link
                  to={`/admin/brands/${row.brand.id}`}
                  className="border-line-interactive bg-surface-1 text-text hover:border-accent hover:text-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors"
                >
                  <Handshake size={14} aria-hidden />
                  Open {row.brand.name}
                </Link>
              ) : null}
              {agreed ? (
                <Link
                  to={`/admin/content?search=${encodeURIComponent(row.creator_handle ?? '')}`}
                  className="border-line-interactive bg-surface-1 text-text hover:border-accent hover:text-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors"
                >
                  <Video size={14} aria-hidden />
                  Their videos
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
    /*
     * NO "STAGE" EYEBROW ANY MORE. It sat in a labelled column on the old row;
     * in a card action bar the dropdown is the only thing in the bar and a
     * heading over it is a word explaining a control that explains itself. The
     * accessible name is still there, on the label below.
     */
    <div className="min-w-0">
      <div className="flex items-center gap-2">
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
        {/* Fills the bar rather than a fixed 12rem, so it fits a phone and a
            four-column grid without a second breakpoint. */}
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
          className="h-9 w-full min-w-0 flex-1 rounded-md text-[0.8125rem]"
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
