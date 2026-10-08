import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check, Flag, RotateCcw, Search, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { CreatorFace } from '@/components/work/CreatorFace';
import { useCreatorAvatars } from '@/lib/admin/useCreatorAvatars';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { ContentCard } from '@/components/content/ContentCard';
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
import { useJobProgressFor, type JobProgress } from '@/lib/work/job-progress';

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

  // The faces on this page, in one query and one batch of signed URLs.
  const faces = useCreatorAvatars(rows.map((r) => r.creator_id));
  const pages = Math.max(1, Math.ceil(total / CONTENT_PAGE_SIZE));

  /*
   * The jobs behind the videos on this page, in ONE grouped read. Several
   * videos usually share a job, so the ids are deduplicated first: twenty cards
   * is often only five or six jobs.
   */
  const { data: progress } = useJobProgressFor([...new Set(rows.map((r) => r.application_id))]);

  return (
    <>
      <div className="flex flex-col gap-[14px]">
        {/*
          NO TITLE ROW AND NO DESCRIPTION ROW. The shell's top bar carries the
          section name as the page's h1 now, and Rashid asked on 2026-08-16 for
          the tagline under it to go with it: it described the screen to
          somebody already standing on it. The width cap went too, because the
          content area is full width now and a second cap here would leave this
          screen narrower than the ones beside it.
        */}
        {/* ------------------------------------------------------- filters -- */}
        <FilterBar>
          {/* The view switch leads the row: which of the two screens you are
              looking at decides whether the rest of the row means anything. */}
          <ViewSwitch view={view} onChange={setView} />

          {view === 'submissions' ? (
            <>
              {/* `flex-wrap` and no `shrink-0`: four labels this long are wider
                  than a 375px phone, and a row that scrolls sideways hides the
                  last tab behind an edge. */}
              <FilterTabs label="Filter content" className="max-w-full flex-wrap">
                {TABS.map((t) => {
                  // A zero is not worth the ink, the same as before.
                  const n = counts?.totals[t.value];
                  return (
                    <FilterTab
                      key={t.value}
                      active={filters.status === t.value}
                      count={n || undefined}
                      onClick={() => set({ status: t.value })}
                    >
                      {t.label}
                    </FilterTab>
                  );
                })}
              </FilterTabs>

              <div className="relative min-w-0 flex-1 basis-52">
                <Search
                  size={15}
                  aria-hidden
                  className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                />
                <input
                  type="search"
                  name="search"
                  defaultValue={filters.search}
                  onChange={(e) => set({ q: e.target.value })}
                  placeholder="Search by handle or ad code"
                  aria-label="Search content"
                  className="wx-neo-inset placeholder:text-faint focus-visible:ring-accent/50 h-10 w-full rounded-md pr-3 pl-9 text-[0.875rem] focus:outline-none focus-visible:ring-2"
                />
              </div>

              <label className="sr-only" htmlFor="admin-content-brand">
                Filter by brand
              </label>
              {/* The one control whose width is data rather than design. Left to
                  size itself a long brand name makes the select wider than a
                  phone, so it gets a basis it is allowed to shrink from. */}
              <div className="min-w-0 basis-40">
                <Select
                  id="admin-content-brand"
                  name="brand"
                  value={filters.brandId}
                  onChange={(e) => set({ brand: e.target.value })}
                  className="h-10 w-full rounded-md text-[0.875rem]"
                >
                  <option value="">All brands</option>
                  {(brands ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>

              <label className="sr-only" htmlFor="admin-content-sort">
                Sort
              </label>
              <Select
                id="admin-content-sort"
                name="sort"
                value={filters.sort}
                onChange={(e) => set({ sort: e.target.value === 'oldest' ? 'oldest' : '' })}
                className="h-10 w-auto min-w-[8.5rem] shrink-0 rounded-md text-[0.875rem]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </Select>
            </>
          ) : null}
        </FilterBar>

        {view === 'dashboard' ? (
          counts ? (
            <>
              <Board counts={counts.totals} />
              <ByBrand rows={counts.byBrand} onPick={(id) => set({ brand: id, view: '' })} />
            </>
          ) : (
            <div className="wx-skeleton h-[220px] rounded-xl" />
          )
        ) : (
          <>
            {/* ---------------------------------------------------------- list -- */}
            {isLoading ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="wx-skeleton h-[400px] rounded-xl" />
                ))}
              </ul>
            ) : isError ? (
              <div className="bg-surface-1 rounded-xl px-6 py-14 text-center shadow-md">
                <p className="font-semibold">That would not load</p>
                <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
                  {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="bg-surface-1 rounded-xl px-6 py-16 text-center shadow-md">
                <Video size={26} aria-hidden className="text-faint mx-auto" />
                <p className="mt-4 font-semibold">Nothing here</p>
                <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
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
                      <ContentCard
                        row={row}
                        onPlay={() => setPlaying(row)}
                        aboutTheJob={
                          <JobMeta
                            row={row}
                            progress={progress?.get(row.application_id)}
                            face={faces[row.creator_id]}
                          />
                        }
                      >
                        <Review row={row} progress={progress?.get(row.application_id)} />
                      </ContentCard>
                    </li>
                  ))}
                </ul>

                {pages > 1 ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-muted text-[0.8125rem]">
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
    </>
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
    <FilterTabs label="How to read the content">
      {VIEWS.map((v) => (
        <FilterTab key={v.key} active={view === v.key} onClick={() => onChange(v.key)}>
          {v.label}
        </FilterTab>
      ))}
    </FilterTabs>
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
    <section className="bg-surface-1 flex flex-col gap-[14px] rounded-xl p-5 shadow-md">
      <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        Where it is coming from
      </h2>

      <ul className="flex flex-col gap-2">
        {rows.map((brand) => (
          <li key={brand.id}>
            <button
              type="button"
              onClick={() => onPick(brand.id)}
              className="wx-neo-raised-sm wx-neo-press flex w-full flex-col gap-2.5 rounded-[16px] p-3.5 text-left transition-colors duration-200"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[0.90625rem] font-semibold">{brand.name}</span>
                <span className="font-display text-[0.9375rem] font-semibold">
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

              <div className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-[0.78125rem]">
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
    <section className="bg-surface-1 flex flex-col gap-5 rounded-xl p-[clamp(18px,2.4vw,26px)] shadow-md">
      <div className="flex flex-col gap-1">
        <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Videos posted
        </p>
        <p className="flex flex-wrap items-baseline gap-2.5">
          <span className="font-brand text-[clamp(2.375rem,7vw,3.625rem)] leading-none font-semibold tracking-[-0.03em]">
            {counts.all}
          </span>
          <span className="text-muted text-[0.8125rem]">across the roster</span>
        </p>
      </div>

      <dl className="grid [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className={cn('flex flex-col gap-1.5 rounded-lg p-3.5', cell.tone.soft)}
          >
            <dt className={cn('text-[0.75rem] font-semibold', cell.tone.text)}>{cell.label}</dt>
            <dd className="font-display text-[1.4375rem] font-semibold">{cell.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* -------------------------------------------------------------- review --- */

/**
 * Who filmed it, and how much of their job this video is part of.
 *
 * A reviewer used to see a brand, an offer title and an ad code, on a screen
 * whose search box searches by handle. Whose video it was, and whether it was
 * the fourth of five or the first of ten, were on other screens entirely.
 */
function JobMeta({
  row,
  progress,
  face,
}: {
  row: ContentRow;
  progress: JobProgress | undefined;
  face: string | undefined;
}) {
  const who = row.creator_handle ? `@${row.creator_handle}` : row.creator_name;
  if (!who && !progress) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {who ? (
        <span className="text-muted flex items-center gap-1.5 text-[0.78125rem] break-all">
          <CreatorFace
            src={face}
            name={row.creator_name}
            handle={row.creator_handle}
            size={20}
          />
          {who}
        </span>
      ) : null}
      {progress && progress.required !== null ? (
        <span
          className={cn(
            'font-display text-[0.75rem] font-semibold',
            progress.done ? 'text-stage-paid' : 'text-muted'
          )}
        >
          {progress.approved}/{progress.required} on this job
        </span>
      ) : null}
    </div>
  );
}

/**
 * The decision, on the card itself.
 *
 * No confirmation step: watching a video IS the deliberation, and both ways are
 * reversible, audited and land on the creator's screen immediately. Asking a
 * second time for every video in a queue of forty would only teach people to
 * click through the dialog without reading it.
 *
 * It DOES say out loud when a decision is about to finish somebody's job, or
 * un-finish one. That is not a confirmation step, it is a label, and it is the
 * highest-stakes moment on the screen: approving the last video is the only
 * thing in the whole product that can carry a job to "payment pending", which
 * since 2026-08-19 is where a finished job lands. That moves the creator's fee
 * out of "in progress" and into "awaiting payment", so this click is the one
 * that says we owe them.
 */
function Review({ row, progress }: { row: ContentRow; progress: JobProgress | undefined }) {
  const review = useReviewContent();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');

  /*
   * Would THIS approval be the last one? It copies the database's rule exactly:
   * a number has to have been agreed, and the approved count has to reach it.
   * Getting that wrong would promise something that does not happen.
   */
  const wouldFinish =
    progress != null &&
    progress.required !== null &&
    !progress.done &&
    progress.approved + 1 >= progress.required;

  // And the other direction: taking back an approval on a finished job sends it
  // back to content pending, and the creator is told.
  const wouldReopen = row.status === 'approved' && progress?.done === true;

  /*
   * THE NOTE BOX COMES FIRST, before the approved branch returns.
   *
   * It used to sit below it, so an approved row reached the early return and
   * the reviewer was told "Sending it back would reopen it" beside no control
   * that could send it back. The database has always allowed it, the Edge
   * Function has always allowed it, and the success message for the reopen path
   * was unreachable code. Only the button was missing.
   */
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
          className="wx-neo-inset placeholder:text-faint focus-visible:ring-accent/50 w-full rounded-xl px-3 py-2 text-[0.8125rem] focus:outline-none focus-visible:ring-2"
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

  if (row.status === 'approved') {
    return (
      <div className="border-line flex flex-col gap-1.5 border-t pt-2.5">
        <p className="text-stage-paid flex items-center gap-1.5 text-[0.78125rem] font-semibold">
          <Check size={14} aria-hidden />
          Counted towards the offer
        </p>
        {wouldReopen ? (
          <p className="text-faint text-[0.71875rem] leading-relaxed">
            This job is finished on the strength of this video. Sending it back reopens it and
            stops the payment.
          </p>
        ) : null}
        {/* Quiet, because taking an approval back is rare and should never be
            the easiest thing on the card. It is still one click away, which
            "no button at all" was not. */}
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
            <RotateCcw size={14} aria-hidden />
            Send it back
          </Button>
        </div>
        {review.error ? (
          <p role="alert" className="text-danger text-[0.75rem]">
            {(review.error as Error).message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-line flex flex-col gap-2 border-t pt-2.5">
      {/* Said before the click, never as a dialog after it. Reviewing at speed
          was a deliberate decision and a confirm step would undo it. */}
      {wouldFinish ? (
        <p className="text-stage-paid flex items-start gap-1.5 text-[0.75rem] leading-relaxed font-medium">
          <Flag size={13} aria-hidden className="mt-0.5 shrink-0" />
          Approving this finishes the job and moves them to Payment pending.
        </p>
      ) : null}

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
      {/* What the decision actually DID. The database has always returned this
          and the screen threw it away, so finishing somebody's work looked
          identical to approving one video of five. */}
      {review.data?.result.advanced ? (
        <p role="status" className="text-stage-paid text-[0.75rem] font-medium">
          That was the last one. The job is finished and they are awaiting payment.
        </p>
      ) : review.data?.result.reopened ? (
        <p role="status" className="text-stage-due text-[0.75rem] font-medium">
          The job went back to content pending, and they have been told.
        </p>
      ) : null}

      {review.error ? (
        <p role="alert" className="text-danger text-[0.75rem]">
          {(review.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}
