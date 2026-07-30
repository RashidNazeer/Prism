import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Check, ChevronLeft, ChevronRight, Inbox, Search, Star, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { RowActions } from '@/components/admin/RowActions';
import { ReviewDialog, type ReviewTarget } from '@/components/admin/ReviewDialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
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

const COLUMNS =
  'md:grid-cols-[1.75rem_minmax(0,2fr)_minmax(0,1.3fr)_6rem_7rem_2.25rem]';

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
    <AppShell>
      <h1 className="text-[clamp(1.6rem,4vw,2.25rem)] font-extrabold">Applications</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        Approve one and their dashboard changes while they are looking at it.
      </p>

      {/* ----------------------------------------------------------- filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:gap-3">
        <div
          role="tablist"
          aria-label="Filter by status"
          className="inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-surface-1 p-1"
        >
          {STATUS_TABS.map((t) => {
            const count =
              t.value === 'all'
                ? counts
                  ? counts.pending + counts.approved + counts.rejected
                  : undefined
                : counts?.[t.value];
            const active = filters.status === t.value;
            return (
              <button
                key={t.value}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setFilters({ status: t.value })}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 sm:px-3.5',
                  active ? 'bg-accent text-on-accent' : 'text-muted hover:text-accent'
                )}
              >
                {t.label}
                {count !== undefined ? (
                  <span
                    className={cn(
                      'wx-numeric rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      // `text-muted`, not `text-faint`: faint on surface-2 is
                      // only 4.31:1 in light mode, under WCAG AA. Registered in
                      // scripts/check-contrast.mjs so it cannot come back.
                      active ? 'bg-black/15 text-on-accent' : 'bg-surface-2 text-muted'
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-pressed={filters.workedWithWurx}
          onClick={() => setFilters({ workedWithWurx: !filters.workedWithWurx })}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium transition-colors duration-200',
            filters.workedWithWurx
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line-interactive bg-surface-1 text-muted hover:border-accent hover:text-accent'
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
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            name="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by handle"
            aria-label="Search by TikTok handle"
            className="h-9 w-full rounded-xl border border-line-interactive bg-surface-1 pr-3 pl-9 text-[13px] placeholder:text-faint hover:border-accent/60 focus:border-accent focus:outline-none"
          />
        </form>

        <Select
          aria-label="Sort order"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as SortOrder })}
          className="h-9 shrink-0 basis-36 text-[13px]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>

      {/* --------------------------------------------------------- bulk bar */}
      {selected.size > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-accent bg-accent-soft px-4 py-3">
          <p className="text-[14px] font-medium">
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

      {/* ------------------------------------------------------------- table */}
      <div
        className={cn(
          'mt-4 overflow-hidden rounded-2xl border border-line bg-surface-1 transition-opacity duration-200',
          isPlaceholderData && 'opacity-60'
        )}
      >
        {isLoading ? (
          <ul className="divide-y divide-line">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                <div className="h-4 w-36 animate-pulse rounded bg-surface-2" />
                <div className="hidden h-4 w-24 animate-pulse rounded bg-surface-2 sm:block" />
                <div className="ml-auto h-7 w-7 animate-pulse rounded-lg bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : isError ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold">That list would not load</p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Inbox size={26} aria-hidden className="mx-auto text-faint" />
            <p className="mt-4 font-semibold">
              {filtered ? 'Nothing matches those filters' : 'No applications waiting'}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
              {filtered
                ? 'Try widening the search, or switch to All.'
                : 'When someone applies from the landing page they appear here straight away.'}
            </p>
          </div>
        ) : (
          <>
            {/* Select-all for phones and tablets. The column heading row below
                carries it from `md` up, but that row is hidden on narrow
                screens, which would have left bulk review as a desktop-only
                feature on a product whose reviewers are often on a phone. */}
            {selectable.length > 0 ? (
              <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 md:hidden">
                <label className="-m-2 flex cursor-pointer items-center gap-2.5 p-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select every pending application on this page"
                    className="size-4 cursor-pointer accent-[var(--wx-accent)]"
                  />
                  <span className="text-[13px] text-muted">
                    {allSelected ? 'Clear selection' : `Select all ${selectable.length}`}
                  </span>
                </label>
              </div>
            ) : null}

            {/* Column headings, desktop only. On a phone every row becomes a
                stacked card, where headings would just be noise. */}
            <div
              className={cn(
                'hidden border-b border-line px-5 py-2.5 font-mono text-[10px] tracking-[0.14em] text-faint uppercase md:grid md:items-center md:gap-4',
                COLUMNS
              )}
            >
              <span>
                {selectable.length > 0 ? (
                  <label className="-m-2.5 flex w-fit cursor-pointer p-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select every pending application on this page"
                      className="size-4 cursor-pointer accent-[var(--wx-accent)]"
                    />
                  </label>
                ) : null}
              </span>
              <span>Creator</span>
              <span>Niche</span>
              <span className="text-center">Known</span>
              <span>Applied</span>
              <span className="sr-only">Actions</span>
            </div>

            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
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
          <p className="wx-numeric text-[13px] text-muted">
            {(filters.page - 1) * PAGE_SIZE + 1} to{' '}
            {Math.min(filters.page * PAGE_SIZE, total)} of {total}
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
        <ReviewDialog
          targets={dialog.targets}
          decision={dialog.decision}
          onClose={() => setDialog(null)}
          onDone={() => setSelected(new Set())}
        />
      ) : null}
    </AppShell>
  );
}

/**
 * One application.
 *
 * The whole row opens the application, but it holds real controls too, so the
 * link is an overlay underneath and the grid above it does not take pointer
 * events. Only the checkbox and the menu opt back in. Nesting a button inside
 * an anchor would be invalid markup and behaves differently in every browser.
 */
function Row({
  row,
  checked,
  onToggle,
  onApprove,
  onReject,
}: {
  row: QueueRow;
  checked: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = row.status === 'pending';
  const niche = row.niche === 'Other' ? (row.niche_other ?? 'Other') : row.niche;

  const known = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-accent uppercase">
      <Star size={10} aria-hidden />
      Known
    </span>
  );

  // The drawn box stays 16px, but the touchable area is padded out to roughly
  // 40px. A 16px target sitting on top of a full-row navigation link is a
  // coin flip on a phone, and losing that flip opens the application instead
  // of ticking it.
  const box = pending ? (
    <label className="pointer-events-auto -m-2.5 flex cursor-pointer p-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select @${row.tiktok_handle}`}
        className="size-4 cursor-pointer accent-[var(--wx-accent)]"
      />
    </label>
  ) : null;

  const actions = pending ? (
    <RowActions handle={row.tiktok_handle} onApprove={onApprove} onReject={onReject} />
  ) : (
    <StatusBadge status={row.status} />
  );

  return (
    <li className={cn('relative transition-colors duration-200 hover:bg-surface-2')}>
      <Link
        to={`/admin/applications/${row.id}`}
        aria-label={`Open the application from @${row.tiktok_handle}`}
        className="absolute inset-0"
      />

      {/* ------------------------------------------------------ phone card */}
      <div className="pointer-events-none relative flex items-start gap-3 px-4 py-3 md:hidden">
        {box}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">@{row.tiktok_handle}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span className="truncate">{niche}</span>
            <span aria-hidden className="text-faint">
              &middot;
            </span>
            <span className="wx-numeric whitespace-nowrap">{niceDate(row.created_at)}</span>
            {row.worked_with_wurx ? known : null}
          </p>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>

      {/* -------------------------------------------------------- wide row */}
      <div
        className={cn(
          'pointer-events-none relative hidden px-5 py-3 md:grid md:items-center md:gap-4',
          COLUMNS
        )}
      >
        <span>{box}</span>
        <span className="min-w-0 truncate font-semibold">@{row.tiktok_handle}</span>
        <span className="truncate text-[14px] text-muted">{niche}</span>
        <span className="text-center">
          {row.worked_with_wurx ? (
            known
          ) : (
            <span aria-hidden className="text-faint">
              &middot;
            </span>
          )}
        </span>
        <span className="wx-numeric text-[13px] whitespace-nowrap text-muted">
          {niceDate(row.created_at)}
        </span>
        <span className="flex justify-end">{actions}</span>
      </div>
    </li>
  );
}
