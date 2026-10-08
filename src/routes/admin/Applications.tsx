import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Check, ChevronLeft, ChevronRight, Inbox, Search, Star, X } from 'lucide-react';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ReviewDialog, type ReviewTarget } from '@/components/admin/ReviewDialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { CreatorFace } from '@/components/work/CreatorFace';
import { useCreatorAvatars } from '@/lib/admin/useCreatorAvatars';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { cn } from '@/lib/utils';
import {
  PAGE_SIZE,
  useApplicationCounts,
  useApplications,
  type QueueRow,
  type QueueFilters,
  type SortOrder,
  type StatusFilter,
} from '@/lib/admin/useApplications';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const isStatus = (v: string | null): v is StatusFilter =>
  v === 'pending' || v === 'approved' || v === 'rejected' || v === 'all';

const niceDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/**
 * The application review queue.
 *
 * Counts live on the dashboard, not here, so this screen opens straight onto
 * the list instead of pushing it below a row of tiles. Filters live in the URL
 * so a reviewer can send "look at this one" as a link, and the back button
 * behaves after opening an application and returning.
 */
export function Applications() {
  const [params, setParams] = useSearchParams();

  const statusParam = params.get('status');
  const filters: QueueFilters = {
    status: isStatus(statusParam) ? statusParam : 'pending',
    workedWithWurx: params.get('known') === '1',
    search: params.get('q') ?? '',
    sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  // The search box is typed into locally and only pushed to the URL on submit,
  // so a database query does not fire on every keystroke.
  const [searchDraft, setSearchDraft] = useState(filters.search);
  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  const setFilters = (next: Partial<QueueFilters>) => {
    const merged = { ...filters, ...next };
    // Any change other than the page itself returns you to page one. Otherwise
    // you can be sitting on page 4 of a one page result, looking at nothing.
    if (next.page === undefined) merged.page = 1;

    const p = new URLSearchParams();
    if (merged.status !== 'pending') p.set('status', merged.status);
    if (merged.workedWithWurx) p.set('known', '1');
    if (merged.search) p.set('q', merged.search);
    if (merged.sort !== 'newest') p.set('sort', merged.sort);
    if (merged.page > 1) p.set('page', String(merged.page));
    setParams(p, { replace: true });
  };

  const { data, isLoading, isError, error, isPlaceholderData } = useApplications(filters);
  const { data: counts } = useApplicationCounts();

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.rows ?? [];
  // One query and one batch of signed URLs for the page. `applicant` is
  // nullable, so a deleted account simply contributes no id.
  const faces = useCreatorAvatars(rows.map((r) => r.applicant?.id));
  const filtered =
    Boolean(filters.search) || filters.workedWithWurx || filters.status !== 'pending';

  /* ------------------------------------------------------------ selection */
  // Only pending applications can be acted on, so only they are selectable.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{
    targets: ReviewTarget[];
    decision: 'approved' | 'rejected';
  } | null>(null);

  // Not memoised: this is at most one page of rows, and `rows` is a fresh array
  // on every render anyway, so a memo here would recompute regardless while
  // pretending otherwise.
  const selectable = rows.filter((r) => r.status === 'pending');

  // A selection is only meaningful for the rows on screen. Changing page or
  // filter must not leave invisible people quietly ticked.
  const filterKey = JSON.stringify(filters);
  useEffect(() => setSelected(new Set()), [filterKey]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = selectable.length > 0 && selected.size === selectable.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)));

  const targetsFor = (ids: Set<string> | string[]): ReviewTarget[] => {
    const wanted = new Set(ids);
    return rows
      .filter((r) => wanted.has(r.id))
      .map((r) => ({ id: r.id, handle: r.tiktok_handle }));
  };

  return (
    <>
      {/*
        NO TITLE ROW AND NO DESCRIPTION ROW. The top bar names the section, and
        Rashid asked for both of these to go on 2026-08-16: they cost about
        120px above the work on every screen to repeat what the lit menu row
        already said. The work is row one now.
      */}
      {/* ----------------------------------------------------------- filters */}
      <FilterBar>
        <FilterTabs label="Filter by status">
          {STATUS_TABS.map((t) => {
            const count =
              t.value === 'all'
                ? counts
                  ? counts.pending + counts.approved + counts.rejected
                  : undefined
                : counts?.[t.value];
            return (
              <FilterTab
                key={t.value}
                active={filters.status === t.value}
                count={count}
                onClick={() => setFilters({ status: t.value })}
              >
                {t.label}
              </FilterTab>
            );
          })}
        </FilterTabs>

        <button
          type="button"
          aria-pressed={filters.workedWithWurx}
          onClick={() => setFilters({ workedWithWurx: !filters.workedWithWurx })}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-[0.8125rem] font-medium transition-colors duration-200',
            filters.workedWithWurx
              ? 'wx-neo-pressed text-accent'
              : 'wx-neo-raised-sm wx-neo-press text-muted hover:text-accent'
          )}
        >
          <Star size={14} aria-hidden />
          Worked with Wurx
        </button>

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
            placeholder="Search by handle"
            aria-label="Search by TikTok handle"
            className="wx-neo-inset placeholder:text-faint focus-visible:ring-accent/50 h-10 w-full rounded-md pr-3 pl-9 text-[0.875rem] focus:outline-none focus-visible:ring-2"
          />
        </form>

        <Select
          aria-label="Sort order"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as SortOrder })}
          className="h-10 w-auto min-w-[8.5rem] shrink-0 rounded-md text-[0.875rem]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </FilterBar>

      {/* --------------------------------------------------------- bulk bar */}
      {selected.size > 0 ? (
        <div className="bg-accent-soft mt-4 flex flex-wrap items-center gap-2.5 rounded-md px-4 py-3">
          <p className="text-[0.875rem] font-medium">
            <span className="wx-numeric">{selected.size}</span> selected
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setDialog({ targets: targetsFor(selected), decision: 'approved' })}
            >
              <Check size={15} aria-hidden />
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDialog({ targets: targetsFor(selected), decision: 'rejected' })}
            >
              <X size={15} aria-hidden />
              Reject
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------------------- grid */}
      <div
        className={cn(
          'mt-4 transition-opacity duration-200',
          isPlaceholderData && 'opacity-60'
        )}
      >
        {isLoading ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="wx-skeleton h-[12.5rem] rounded-md" />
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
            <Inbox size={26} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">
              {filtered ? 'Nothing matches those filters' : 'No applications waiting'}
            </p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              {filtered
                ? 'Try widening the search, or switch to All.'
                : 'When someone applies from the landing page they appear here straight away.'}
            </p>
          </div>
        ) : (
          <>
            {/*
              SELECT ALL, AT EVERY WIDTH NOW. It used to live in the table's
              column heading row above `md`, with a separate copy below it for
              phones. There is no heading row on a grid of cards, so there is one
              control, and bulk review stops being two implementations of the
              same thing.
            */}
            {selectable.length > 0 ? (
              <label className="mb-3 -ml-2 flex w-fit cursor-pointer items-center gap-2.5 rounded-md p-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select every pending application on this page"
                  className="size-4 cursor-pointer accent-[var(--wx-accent)]"
                />
                <span className="text-muted text-[0.8125rem]">
                  {allSelected ? 'Clear selection' : `Select all ${selectable.length}`}
                </span>
              </label>
            ) : null}

            <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.map((row) => (
                <ApplicationCard
                  key={row.id}
                  row={row}
                  face={row.applicant ? faces[row.applicant.id] : undefined}
                  checked={selected.has(row.id)}
                  onToggle={() => toggle(row.id)}
                  onApprove={() =>
                    setDialog({ targets: targetsFor([row.id]), decision: 'approved' })
                  }
                  onReject={() =>
                    setDialog({ targets: targetsFor([row.id]), decision: 'rejected' })
                  }
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {/* -------------------------------------------------------- pagination */}
      {total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="wx-numeric text-muted text-[0.8125rem]">
            {(filters.page - 1) * PAGE_SIZE + 1} to {Math.min(filters.page * PAGE_SIZE, total)}{' '}
            of {total}
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
        <ReviewDialog
          targets={dialog.targets}
          decision={dialog.decision}
          onClose={() => setDialog(null)}
          onDone={() => setSelected(new Set())}
        />
      ) : null}
    </>
  );
}

/**
 * One application, as a card.
 *
 * REBUILT 2026-08-21, third of the three, on Rashid: *"this is not waht i
 * expcected make it more beautiful ... like horiontal cards you are always
 * ptting content in a row"*. He was right to push: Offers and Requests had
 * become cards and this was still a six-column table with a heading row.
 *
 * IT NAVIGATES, IT DOES NOT EXPAND, and that is the one real difference from
 * the other two. Applications HAVE a detail screen, `/admin/applications/:id`,
 * which is where a decision actually gets made after reading somebody's answers.
 * An accordion here would be a second, worse copy of a page that already exists.
 *
 * SO THE LINK IS AN OVERLAY, not a wrapper. The card carries a checkbox and two
 * decision buttons, and a button inside an anchor is invalid markup that behaves
 * differently in every browser. The anchor is absolutely positioned across the
 * whole card, the content above it does not take pointer events, and only the
 * controls opt back in. That is the same trick the old row used; it is the
 * reason it survived the rewrite.
 *
 * WHAT FIXED THE OVERLAP Rashid photographed. The table gave "Applied" 7rem and
 * the actions column 2.25rem, sized for the icon button a PENDING row shows. A
 * decided row puts a status pill there instead, which is far wider than 2.25rem,
 * so it grew leftwards across the date: "Jul 20, 2026✓ APPROVED". A card has no
 * fixed columns to overflow.
 */
function ApplicationCard({
  row,
  face,
  checked,
  onToggle,
  onApprove,
  onReject,
}: {
  row: QueueRow;
  face: string | undefined;
  checked: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = row.status === 'pending';
  const niche = row.niche === 'Other' ? (row.niche_other ?? 'Other') : row.niche;

  return (
    <li
      className={cn(
        'wx-neo-raised relative flex flex-col overflow-hidden rounded-md transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--wx-glass-glow)]',
        checked && 'shadow-[var(--wx-glass-glow)]'
      )}
    >
      <Link
        to={`/admin/applications/${row.id}`}
        aria-label={`Open the application from @${row.tiktok_handle}`}
        className="absolute inset-0"
      />

      {/* ------------------------------------------------------ 1. who it is -- */}
      <div className="pointer-events-none relative flex items-center gap-2.5 px-4 pt-3.5 pb-3">
        {pending ? (
          /* The drawn box stays 16px and the touchable area is padded out to
             roughly 40px. A 16px target sitting on a card-sized navigation link
             is a coin flip on a phone, and losing that flip opens the
             application instead of ticking it. */
          <label className="pointer-events-auto -m-2.5 flex shrink-0 cursor-pointer p-2.5">
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select @${row.tiktok_handle}`}
              className="size-4 cursor-pointer accent-[var(--wx-accent)]"
            />
          </label>
        ) : null}

        <CreatorFace
          src={face}
          handle={row.tiktok_handle}
          name={row.applicant?.display_name}
          size={34}
        />

        <span className="min-w-0 flex-1">
          <span className="text-text block truncate font-semibold">@{row.tiktok_handle}</span>
          {row.applicant?.display_name ? (
            <span className="text-faint block truncate text-[0.75rem]">
              {row.applicant.display_name}
            </span>
          ) : null}
        </span>

        {row.worked_with_wurx ? (
          <span className="bg-accent-soft text-accent inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
            <Star size={10} aria-hidden />
            Known
          </span>
        ) : null}
      </div>

      {/* ------------------------------------- 2. what they make, and when -- */}
      <div className="border-line pointer-events-none relative flex flex-1 flex-col gap-2 border-t px-4 pt-3.5 pb-4">
        <span className="text-faint block text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
          Niche
        </span>
        {/* One line, floored at one, so every closed card in a row is the same
            height and the grid reads as a set rather than as a pile. */}
        <p className="font-display text-text line-clamp-2 min-h-[1.5rem] text-[1.0625rem] leading-snug font-bold break-words">
          {niche}
        </p>
        <p className="text-muted mt-auto text-[0.8125rem]">
          Applied <span className="wx-numeric text-text">{niceDate(row.created_at)}</span>
        </p>
      </div>

      {/* ----------------------------------------------- 3. the decision -- */}
      <div className="border-line bg-surface-2/40 pointer-events-none relative flex items-center gap-2 border-t px-4 py-2.5">
        {pending ? (
          <>
            <Button size="sm" className="pointer-events-auto flex-1" onClick={onApprove}>
              <Check size={15} aria-hidden />
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="pointer-events-auto flex-1"
              onClick={onReject}
            >
              <X size={15} aria-hidden />
              Reject
            </Button>
          </>
        ) : (
          <>
            <StatusBadge status={row.status} />
            {row.reviewed_at ? (
              <span className="wx-numeric text-faint ml-auto text-[0.75rem]">
                {niceDate(row.reviewed_at)}
              </span>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
