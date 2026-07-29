import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Inbox, Search, Star } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import {
  PAGE_SIZE,
  useApplicationCounts,
  useApplications,
  type QueueFilters,
  type SortOrder,
  type StatusFilter,
} from '@/lib/admin/useApplications';
import { useAuditLog } from '@/lib/admin/useApplicationDetail';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const isStatus = (v: string | null): v is StatusFilter =>
  v === 'pending' || v === 'approved' || v === 'rejected' || v === 'all';

/**
 * The application review queue.
 *
 * Filters live in the URL rather than in component state, so a reviewer can
 * send "look at this one" as a link and their colleague lands on the same view.
 * It also makes the back button behave the way people expect after opening an
 * application and coming back.
 */
export function AdminHome() {
  const { claims } = useAuth();
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
  const { data: activity } = useAuditLog({ limit: 6 });

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.rows ?? [];
  const filtered =
    Boolean(filters.search) || filters.workedWithWurx || filters.status !== 'pending';

  return (
    <AppShell>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.875rem,4vw,2.75rem)] font-extrabold">Applications</h1>
          <p className="mt-2 text-[15px] text-muted">
            Every creator who has applied. Approve one and their dashboard changes while
            they are looking at it.
          </p>
        </div>
        {/* The header carries this badge from `sm` up, so showing it again on a
            wide screen is just noise. On a phone the header hides it and this
            is the only place a reviewer can see which hat they are wearing. */}
        <span className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-muted uppercase sm:hidden">
          {claims?.role === 'admin' ? 'Admin' : 'Ops'}
        </span>
      </div>

      {/* ------------------------------------------------------------ counts */}
      <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {(
          [
            { key: 'pending', label: 'Awaiting review', tone: 'text-warning' },
            { key: 'approved', label: 'Approved', tone: 'text-success' },
            { key: 'rejected', label: 'Rejected', tone: 'text-muted' },
          ] as const
        ).map((c) => (
          <li key={c.key} className="bg-surface-1 px-5 py-5">
            <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
              {c.label}
            </p>
            {counts ? (
              <p className={cn('wx-numeric mt-1.5 text-2xl font-bold', c.tone)}>
                {counts[c.key]}
              </p>
            ) : (
              <div className="mt-2 h-7 w-10 animate-pulse rounded bg-surface-2" />
            )}
          </li>
        ))}
      </ul>

      {/* ----------------------------------------------------------- filters */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Filter by status"
          className="inline-flex rounded-xl border border-line bg-surface-1 p-1"
        >
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={filters.status === t.value}
              onClick={() => setFilters({ status: t.value })}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200',
                filters.status === t.value
                  ? 'bg-accent text-on-accent'
                  : 'text-muted hover:text-accent'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={filters.workedWithWurx}
          onClick={() => setFilters({ workedWithWurx: !filters.workedWithWurx })}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium transition-colors duration-200',
            filters.workedWithWurx
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line-interactive bg-surface-1 text-muted hover:border-accent hover:text-accent'
          )}
        >
          <Star size={14} aria-hidden />
          Worked with Wurx
        </button>

        <form
          className="relative flex-1 basis-56"
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
            placeholder="Search by TikTok handle"
            aria-label="Search by TikTok handle"
            className="h-9 w-full rounded-xl border border-line-interactive bg-surface-1 pr-3 pl-9 text-[13px] placeholder:text-faint hover:border-accent/60 focus:border-accent focus:outline-none"
          />
        </form>

        <Select
          aria-label="Sort order"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as SortOrder })}
          className="h-9 basis-40 text-[13px]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>

      {/* ------------------------------------------------------------- table */}
      <div
        className={cn(
          'mt-5 overflow-hidden rounded-2xl border border-line bg-surface-1 transition-opacity duration-200',
          isPlaceholderData && 'opacity-60'
        )}
      >
        {isLoading ? (
          <ul className="divide-y divide-line">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
                <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
                <div className="ml-auto h-6 w-20 animate-pulse rounded-full bg-surface-2" />
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
            {/* Column headings, desktop only. On a phone every row becomes a
                stacked card, where headings would just be noise. */}
            <div className="hidden border-b border-line px-5 py-3 font-mono text-[10px] tracking-[0.14em] text-faint uppercase md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_7rem_7rem_7rem] md:gap-4">
              <span>Creator</span>
              <span>Niche</span>
              <span className="text-center">Known</span>
              <span>Applied</span>
              <span className="text-right">Status</span>
            </div>

            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    to={`/admin/applications/${row.id}`}
                    className="grid gap-2 px-5 py-4 transition-colors duration-200 hover:bg-surface-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_7rem_7rem_7rem] md:items-center md:gap-4"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        @{row.tiktok_handle}
                      </span>
                      <span className="block truncate text-[13px] text-faint">
                        {row.applicant?.email ?? 'account removed'}
                      </span>
                    </span>

                    <span className="truncate text-[14px] text-muted">
                      {row.niche === 'Other' ? (row.niche_other ?? 'Other') : row.niche}
                    </span>

                    <span className="md:text-center">
                      {row.worked_with_wurx ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-accent uppercase">
                          <Star size={11} aria-hidden />
                          Known
                        </span>
                      ) : (
                        <span className="hidden text-faint md:inline">&middot;</span>
                      )}
                    </span>

                    <span className="wx-numeric text-[13px] whitespace-nowrap text-muted">
                      {new Date(row.created_at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>

                    <span className="md:text-right">
                      <StatusBadge status={row.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* -------------------------------------------------------- pagination */}
      {total > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-4">
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

      {/* ---------------------------------------------------------- activity */}
      {activity && activity.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
            Recent activity
          </h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-1">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-5 py-3 text-[13px]"
              >
                <span className="font-medium">
                  {entry.actor_email ?? 'A removed account'}
                </span>
                <span className="text-muted">{describeAction(entry.action)}</span>
                {typeof entry.detail.tiktok_handle === 'string' ? (
                  <span className="font-medium">@{entry.detail.tiktok_handle}</span>
                ) : null}
                {typeof entry.detail.tier === 'string' ? (
                  <span className="text-accent capitalize">as {entry.detail.tier}</span>
                ) : null}
                <span className="wx-numeric ml-auto text-faint">
                  {new Date(entry.created_at).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}

function describeAction(action: string): string {
  if (action === 'application.approved') return 'approved';
  if (action === 'application.rejected') return 'rejected';
  if (action === 'application.review_denied') return 'was blocked trying to review';
  return action;
}
