import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check, RotateCcw, Search, Video } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { ContentCard } from '@/routes/app/Content';
import { cn } from '@/lib/utils';
import type { ContentRow, ContentStatus } from '@/lib/content';
import { useBrandsWithRequests } from '@/lib/admin/useOfferApplications';
import {
  CONTENT_PAGE_SIZE,
  useAdminContent,
  useContentCounts,
  useReviewContent,
  type BrandContentRow,
  type ContentFilters,
  type ContentTotals,
} from '@/lib/admin/useAdminContent';

/**
 * Content: every video the roster has posted, and the team's decision on it.
 *
 * Approving is not bookkeeping. It is the only thing in the product that can
 * carry a job to "content completed", so this screen is where a piece of work
 * actually finishes. That happens in the same transaction as the approval, so
 * a job can never be short a video and marked done.
 *
 * Filters live in the URL, like every other queue here, so a view is shareable.
 */

const TABS: { value: ContentStatus | 'all'; label: string }[] = [
  { value: 'submitted', label: 'With us' },
  { value: 'all', label: 'Everything' },
  { value: 'approved', label: 'Approved' },
  { value: 'needs_another_take', label: 'Another take' },
];

const TONE = {
  live: { text: 'text-stage-live', soft: 'bg-stage-live-soft' },
  due: { text: 'text-stage-due', soft: 'bg-stage-due-soft' },
  paid: { text: 'text-stage-paid', soft: 'bg-stage-paid-soft' },
} as const;

export function AdminContent() {
  const [params, setParams] = useSearchParams();
  const { data: brands } = useBrandsWithRequests();

  const statusParam = params.get('status');
  const filters: ContentFilters = {
    status: (['submitted', 'approved', 'needs_another_take'].includes(statusParam ?? '')
      ? statusParam
      : statusParam === 'all'
        ? 'all'
        : 'submitted') as ContentFilters['status'],
    brandId: params.get('brand') ?? '',
    search: params.get('q') ?? '',
    sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  const set = (patch: Partial<Record<string, string>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // Any change to a filter starts again at the first page, or you land on
    // page 4 of a list that now has one.
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, isLoading, isError, error } = useAdminContent(filters);
  const { data: counts } = useContentCounts();
  const [playing, setPlaying] = useState<ContentRow | null>(null);

  /*
   * Submissions first, the same as the creator side.
   *
   * The summary is not the job. Somebody opening this screen is here to watch
   * videos and decide on them, so that is what loads; the board and the split
   * by brand get their own room one click across.
   */
  const view: View = params.get('view') === 'dashboard' ? 'dashboard' : 'submissions';
  const setView = (next: View) => {
    const p = new URLSearchParams(params);
    if (next === 'dashboard') p.set('view', next);
    else p.delete('view');
    setParams(p, { replace: true });
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / CONTENT_PAGE_SIZE));

  return (
    <AppShell>
      <div className="flex max-w-[1140px] flex-col gap-[14px]">
        <div className="flex flex-wrap items-end justify-between gap-4 px-0.5 py-1">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[clamp(26px,4.4vw,40px)] leading-[1.05] font-semibold tracking-[-0.02em]">
              Content
            </h1>
            <p className="text-muted text-[15px]">
              Every video the roster has posted, with its ad code.
            </p>
          </div>
        </div>

        <ViewSwitch view={view} onChange={setView} />

        {view === 'dashboard' ? (
          counts ? (
            <>
              <Board counts={counts.totals} />
              <ByBrand rows={counts.byBrand} onPick={(id) => set({ brand: id, view: '' })} />
            </>
          ) : (
            <div className="wx-skeleton h-[220px] rounded-[22px]" />
          )
        ) : (
          <>
            {/* ---------------------------------------------------------- tabs -- */}
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div
                role="tablist"
                aria-label="Filter content"
                className="bg-surface-2 flex min-w-max gap-1 rounded-xl p-[3px]"
              >
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    role="tab"
                    type="button"
                    aria-selected={filters.status === t.value}
                    onClick={() => set({ status: t.value })}
                    className={cn(
                      'shrink-0 rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200',
                      filters.status === t.value
                        ? 'bg-text text-inverse'
                        : 'text-muted hover:text-text'
                    )}
                  >
                    {t.label}
                    {counts && counts.totals[t.value] > 0 ? (
                      <span
                        className={cn(
                          'ml-1.5 text-[12px]',
                          filters.status === t.value ? 'text-inverse/70' : 'text-muted'
                        )}
                      >
                        {counts.totals[t.value]}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {/* ------------------------------------------------------- filters -- */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-0 flex-1 basis-52">
                <Search
                  size={15}
                  aria-hidden
                  className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
                />
                <input
                  type="search"
                  name="search"
                  defaultValue={filters.search}
                  onChange={(e) => set({ q: e.target.value })}
                  placeholder="Search by handle or ad code"
                  aria-label="Search content"
                  className="border-line-interactive bg-surface-1 placeholder:text-faint hover:border-accent/60 focus:border-accent h-9 w-full rounded-xl border pr-3 pl-9 text-[13px] focus:outline-none"
                />
              </div>

              <label className="sr-only" htmlFor="admin-content-brand">
                Filter by brand
              </label>
              <Select
                id="admin-content-brand"
                name="brand"
                value={filters.brandId}
                onChange={(e) => set({ brand: e.target.value })}
                className="h-9 basis-44 text-[13px]"
              >
                <option value="">All brands</option>
                {(brands ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>

              <label className="sr-only" htmlFor="admin-content-sort">
                Sort
              </label>
              <Select
                id="admin-content-sort"
                name="sort"
                value={filters.sort}
                onChange={(e) => set({ sort: e.target.value === 'oldest' ? 'oldest' : '' })}
                className="h-9 basis-36 text-[13px]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </Select>
            </div>

            {/* ---------------------------------------------------------- list -- */}
            {isLoading ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="wx-skeleton h-[400px] rounded-[20px]" />
                ))}
              </ul>
            ) : isError ? (
              <div className="border-line bg-surface-1 rounded-[20px] border px-6 py-14 text-center shadow-md">
                <p className="font-semibold">That would not load</p>
                <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
                  {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="border-line bg-surface-1 rounded-[20px] border px-6 py-16 text-center shadow-md">
                <Video size={26} aria-hidden className="text-faint mx-auto" />
                <p className="mt-4 font-semibold">Nothing here</p>
                <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
                  {filters.status === 'submitted'
                    ? 'Nothing is waiting on you. New videos land here as creators post them.'
                    : 'Try a different search, brand or tab.'}
                </p>
              </div>
            ) : (
              <>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <ContentCard row={row} onPlay={() => setPlaying(row)}>
                        <Review row={row} />
                      </ContentCard>
                    </li>
                  ))}
                </ul>

                {pages > 1 ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-muted text-[13px]">
                      Page {filters.page} of {pages}, {total} in total
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={filters.page <= 1}
                        onClick={() => set({ page: String(filters.page - 1) })}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={filters.page >= pages}
                        onClick={() => set({ page: String(filters.page + 1) })}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </div>

      {playing ? <VideoPlayer row={playing} onClose={() => setPlaying(null)} /> : null}
    </AppShell>
  );
}

/* --------------------------------------------------------------- view --- */

/**
 * Two sections, the same split the creator side has.
 *
 * The summary is not the job. Anybody opening this screen came to watch videos
 * and decide on them, so that is what loads.
 */
const VIEWS = [
  { key: 'submissions', label: 'Submissions' },
  { key: 'dashboard', label: 'Dashboard' },
] as const;

type View = (typeof VIEWS)[number]['key'];

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div
      role="tablist"
      aria-label="How to read the content"
      className="bg-surface-2 flex gap-1 self-start rounded-xl p-[3px]"
    >
      {VIEWS.map((v) => (
        <button
          key={v.key}
          role="tab"
          type="button"
          aria-selected={view === v.key}
          onClick={() => onChange(v.key)}
          className={cn(
            'rounded-[9px] px-[11px] py-1.5 text-[13px] font-medium transition-colors duration-200',
            view === v.key ? 'bg-text text-inverse' : 'text-muted hover:text-text'
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ by brand --- */

/**
 * Where the work actually is, brand by brand.
 *
 * The counts above say how much is waiting; this says whose. A row is a link
 * into the queue already filtered to that brand, because "BruMate has nine
 * waiting" is only useful if the next click is those nine.
 */
function ByBrand({
  rows,
  onPick,
}: {
  rows: BrandContentRow[];
  onPick: (brandId: string) => void;
}) {
  if (rows.length === 0) return null;
  const most = Math.max(...rows.map((r) => r.all), 1);

  return (
    <section className="border-line bg-surface-1 flex flex-col gap-[14px] rounded-[20px] border p-5 shadow-md">
      <h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
        Where it is coming from
      </h2>

      <ul className="flex flex-col gap-2">
        {rows.map((brand) => (
          <li key={brand.id}>
            <button
              type="button"
              onClick={() => onPick(brand.id)}
              className="border-line bg-surface-2 hover:border-text flex w-full flex-col gap-2.5 rounded-[16px] border p-3.5 text-left transition-colors duration-200"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[14.5px] font-semibold">{brand.name}</span>
                <span className="font-display text-[15px] font-semibold">
                  {brand.all} {brand.all === 1 ? 'video' : 'videos'}
                </span>
              </div>

              {/* One bar, three parts, in the same colours as everywhere else. */}
              <div className="bg-surface-1 flex h-2 gap-0.5 overflow-hidden rounded-full">
                {(
                  [
                    ['approved', 'bg-stage-paid'],
                    ['submitted', 'bg-stage-live'],
                    ['needs_another_take', 'bg-stage-due'],
                  ] as const
                )
                  .filter(([key]) => brand[key] > 0)
                  .map(([key, className]) => (
                    <span
                      key={key}
                      className={className}
                      style={{ width: `${(brand[key] / most) * 100}%` }}
                    />
                  ))}
              </div>

              <div className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                <span>
                  <span className="text-stage-paid font-semibold">{brand.approved}</span>{' '}
                  approved
                </span>
                <span>
                  <span className="text-stage-live font-semibold">{brand.submitted}</span> with
                  us
                </span>
                <span>
                  <span className="text-stage-due font-semibold">
                    {brand.needs_another_take}
                  </span>{' '}
                  sent back
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------- board --- */

function Board({ counts }: { counts: ContentTotals }) {
  const cells = [
    { label: 'With us', value: counts.submitted, tone: TONE.live },
    { label: 'Approved', value: counts.approved, tone: TONE.paid },
    { label: 'Another take', value: counts.needs_another_take, tone: TONE.due },
  ];

  return (
    <section className="border-line bg-surface-1 flex flex-col gap-5 rounded-[22px] border p-[clamp(18px,2.4vw,26px)] shadow-md">
      <div className="flex flex-col gap-1">
        <p className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
          Videos posted
        </p>
        <p className="flex flex-wrap items-baseline gap-2.5">
          <span className="font-display text-[clamp(38px,7vw,58px)] leading-none font-semibold tracking-[-0.03em]">
            {counts.all}
          </span>
          <span className="text-muted text-[13px]">across the roster</span>
        </p>
      </div>

      <dl className="grid [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className={cn('flex flex-col gap-1.5 rounded-[14px] p-3.5', cell.tone.soft)}
          >
            <dt className={cn('text-[12px] font-semibold', cell.tone.text)}>{cell.label}</dt>
            <dd className="font-display text-[23px] font-semibold">{cell.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* -------------------------------------------------------------- review --- */

/**
 * The decision, on the card itself.
 *
 * No confirmation step: watching a video IS the deliberation, and both ways are
 * reversible, audited and land on the creator's screen immediately. Asking a
 * second time for every video in a queue of forty would only teach people to
 * click through the dialog without reading it.
 */
function Review({ row }: { row: ContentRow }) {
  const review = useReviewContent();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');

  if (row.status === 'approved') {
    return (
      <p className="border-line text-stage-paid flex items-center gap-1.5 border-t pt-2.5 text-[12.5px] font-semibold">
        <Check size={14} aria-hidden />
        Counted towards the offer
      </p>
    );
  }

  if (asking) {
    return (
      <div className="border-line flex flex-col gap-2 border-t pt-2.5">
        <label className="sr-only" htmlFor={`note-${row.id}`}>
          What needs changing
        </label>
        <textarea
          id={`note-${row.id}`}
          rows={2}
          maxLength={500}
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What needs changing? The creator reads this."
          className="border-line-interactive bg-surface-1 placeholder:text-faint focus:border-accent w-full rounded-xl border px-3 py-2 text-[13px] focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={review.isPending}
            onClick={() =>
              review.mutate(
                { contentId: row.id, status: 'needs_another_take', note: note.trim() || null },
                { onSuccess: () => setAsking(false) }
              )
            }
          >
            {review.isPending ? 'Sending...' : 'Send back'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-line flex flex-col gap-2 border-t pt-2.5">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={review.isPending}
          onClick={() => review.mutate({ contentId: row.id, status: 'approved', note: null })}
        >
          <Check size={14} aria-hidden />
          {review.isPending ? 'Saving...' : 'Approve'}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
          <RotateCcw size={14} aria-hidden />
          Another take
        </Button>
      </div>
      {review.error ? (
        <p role="alert" className="text-danger text-[12px]">
          {(review.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}
