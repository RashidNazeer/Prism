import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { m, useReducedMotion } from 'motion/react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataError, EmptyState } from '@/components/ui/DataState';
import { Select } from '@/components/ui/Field';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { PostContentDialog } from '@/components/creator/PostContentDialog';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { VideoCard } from '@/components/creator/content/VideoCard';
import { CreatorSearch } from '@/components/creator/SearchField';
import { VideoSheet } from '@/components/creator/content/VideoSheet';
import {
  joinVideo,
  type JoinedVideo,
  type SourceState,
  type Sources,
} from '@/components/creator/content/joined';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { CONTENT_STATUS, type ContentRow, type ContentStatus } from '@/lib/content';
import { useMyContent } from '@/lib/creator/useMyContent';
import { useMyWork } from '@/lib/creator/useMyWork';
import {
  usePerformanceWindow,
  useVideoPerformance,
  type VideoPerformance,
} from '@/lib/creator/usePerformance';
import {
  useTikTokAccount,
  useTikTokVideos,
  type TikTokVideo,
} from '@/lib/creator/useTikTokAccount';
import { useMyJobProgress, type JobProgress } from '@/lib/work/job-progress';

/**
 * CONTENT: every video she filed, and how each one is doing.
 *
 * THREE SOURCES, JOINED IN THE BROWSER, because no single hook has all of it:
 * the filed video and its review status (`useMyContent`), the ad story and the
 * GMV behind it (`useVideoPerformance`, by submission id), and views, likes and
 * comments (`useTikTokVideos`, by the post id in the link). EACH IS OPTIONAL,
 * and `joined.ts` holds both the join and the four different reasons a figure
 * can be absent. NO NEW TIKTOK CALL: the join is exactly the one this page has
 * always done, and every figure comes from our own tables.
 *
 * NULL IS NOT ZERO, and on this page that rule does more work than anywhere
 * else in the product, because the usual state of a card is "two of the three
 * sources have nothing for me". A missing figure says `Not reported` in muted
 * italics with an info dot that gives the reason; a measured zero prints `0` in
 * the bold mono the rest of the figures use. See `figures.tsx`.
 *
 * GLASS: ONE BLURRED LAYER FOR THE WHOLE PAGE. The section below is a single
 * `wx-neo-raised` panel and every card inside it is `wx-neo-raised-sm` — the
 * same material with the blur dropped. Twenty blurred cards on a phone is the
 * most expensive thing this redesign could have asked for, and the look is
 * indistinguishable: the aurora behind them is a low-frequency gradient.
 *
 * At 375px the shell already spends two layers (the top bar and the bottom
 * nav), so the panel is the third and an overlay would be a fourth. That is why
 * the panel DROPS ITS BLUR while a sheet, a player or a dialog is open: behind
 * a 70% black scrim nobody can see the difference, and the budget holds at
 * three with the overlay counted.
 *
 * LONG LISTS: paged, 24 at a time, so 300 videos never put 300 cards in the
 * document. See `PAGE` below.
 */

/** How many cards are in the document at once. See the note on `shown`. */
const PAGE = 24;

type Tab = 'all' | ContentStatus;

/*
 * THE VOCABULARY IS `CONTENT_STATUS`, NOT THIS PAGE'S OWN.
 *
 * §9 names the three counters "Live, In review, Needs changes". The words used
 * here are the ones in `src/lib/content.ts`, which is the single definition
 * both sides of the product read: an admin marking a video and a creator
 * reading the result must be looking at the same word. Renaming them for one
 * screen is how two vocabularies start. If the new wording is wanted, it is a
 * one-line change in that file and it moves everywhere at once.
 */
const STATUSES: ContentStatus[] = ['approved', 'submitted', 'needs_another_take'];

const SORTS = [
  { key: 'new', label: 'Newest' },
  { key: 'gmv', label: 'Most GMV' },
  { key: 'views', label: 'Most views' },
] as const;
type Sort = (typeof SORTS)[number]['key'];

const VIEWS = [
  { key: 'submissions', label: 'Videos' },
  { key: 'dashboard', label: 'Jobs' },
] as const;
type View = (typeof VIEWS)[number]['key'];

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Sorting by a figure some videos do not have.
 *
 * A MISSING FIGURE SORTS LAST, NEVER AS A ZERO. Treating it as zero would bury
 * a video that may well be her best under the ones measured at nothing, and it
 * would state a figure we do not have. Last, in a group, with a line above the
 * grid saying so.
 */
const byFigureDesc = (a: number | null, b: number | null) =>
  a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : b - a;

export function Content() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';
  const quiet = useReducedMotion();

  const {
    data: work,
    isLoading: workLoading,
    isError: workError,
    refetch: refetchWork,
  } = useMyWork();
  const content = useMyContent();
  const { data: progress } = useMyJobProgress();

  // Ad story and GMV per video, all time. A failure here must not hide the
  // videos themselves, so it is tracked separately and reported in place.
  const to = useMemo(todayIso, []);
  const perf = useVideoPerformance('2000-01-01', to);
  const window = usePerformanceWindow();
  const latest = window.data?.latest ?? null;

  const account = useTikTokAccount();
  const connected = Boolean(account.data);
  const ttVideos = useTikTokVideos(connected);

  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'dashboard' ? 'dashboard' : 'submissions';
  const setView = (next: View) => {
    const p = new URLSearchParams(params);
    if (next === 'dashboard') p.set('view', next);
    else p.delete('view');
    setParams(p, { replace: true });
  };

  const [tab, setTab] = useState<Tab>('all');
  const [brandId, setBrandId] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [posting, setPosting] = useState<{ applicationId?: string } | null>(null);
  const [editing, setEditing] = useState<ContentRow | null>(null);
  const [playing, setPlaying] = useState<ContentRow | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  /*
   * `?job=<id>` opens the dialog straight onto that job. The parameter is
   * consumed rather than kept: it describes an arrival, not a state of the
   * screen, so leaving it would reopen the dialog on every back button.
   */
  const job = params.get('job');
  useEffect(() => {
    if (!job) return;
    setPosting({ applicationId: job });
    const p = new URLSearchParams(params);
    p.delete('job');
    setParams(p, { replace: true });
    // `params` is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  /* A new filter is a new list, so the paging starts again. */
  useEffect(() => {
    setPage(1);
  }, [tab, brandId, sort, search, view]);

  const jobs = useMemo(() => (work ?? []).filter((r) => r.status === 'approved'), [work]);
  const rows = useMemo(() => content.data ?? [], [content.data]);

  /*
   * WHICH OF THE FOUR ABSENCES EACH SOURCE IS IN, worked out once, here, and
   * passed down. "Not connected", "not answered yet", "broke" and "answered,
   * and this video is not in it" are four different facts and a creator does
   * something different about each one.
   */
  const sources: Sources = useMemo(() => {
    const ads: SourceState = perf.isError ? 'failed' : perf.isPending ? 'loading' : 'ok';
    const tiktok: SourceState = account.isError
      ? 'failed'
      : account.isPending
        ? 'loading'
        : !connected
          ? 'off'
          : ttVideos.isError
            ? 'failed'
            : ttVideos.isPending
              ? 'loading'
              : 'ok';
    return { ads, tiktok };
  }, [
    perf.isError,
    perf.isPending,
    account.isError,
    account.isPending,
    connected,
    ttVideos.isError,
    ttVideos.isPending,
  ]);

  const perfBySubmission = useMemo(() => {
    const m = new Map<string, VideoPerformance>();
    for (const p of perf.data ?? []) m.set(p.submission_id, p);
    return m;
  }, [perf.data]);

  const tiktokById = useMemo(() => {
    const m = new Map<string, TikTokVideo>();
    for (const v of ttVideos.data ?? []) m.set(v.video_id, v);
    return m;
  }, [ttVideos.data]);

  const joined = useMemo(
    () => rows.map((row) => joinVideo(row, perfBySubmission, tiktokById, sources, latest)),
    [rows, perfBySubmission, tiktokById, sources, latest]
  );

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      all: rows.length,
      submitted: 0,
      approved: 0,
      needs_another_take: 0,
    };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  // Only approved videos count towards a job, and the count is frozen on the
  // job at approval, so it comes from the shared view, not from these rows.
  const outstanding = useMemo(
    () => jobs.reduce((total, j) => total + (progress?.get(j.id)?.remaining ?? 0), 0),
    [jobs, progress]
  );

  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.brand) seen.set(r.brand.id, r.brand.name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return joined.filter(({ row: r }) => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (brandId && r.brand_id !== brandId) return false;
      if (!needle) return true;
      return (
        r.ad_code.toLowerCase().includes(needle) ||
        (r.video_title ?? '').toLowerCase().includes(needle) ||
        (r.brand?.name ?? '').toLowerCase().includes(needle) ||
        (r.offer?.title ?? '').toLowerCase().includes(needle)
      );
    });
  }, [joined, tab, brandId, search]);

  const sorted = useMemo(() => {
    if (sort === 'new') return filtered; // the query already returns newest first
    const list = [...filtered];
    list.sort((a, b) =>
      sort === 'gmv' ? byFigureDesc(a.gmv, b.gmv) : byFigureDesc(a.views, b.views)
    );
    return list;
  }, [filtered, sort]);

  /*
   * ONLY ONE PAGE OF CARDS IS IN THE DOCUMENT.
   *
   * `useMyContent` fetches up to 500 rows, and a thumbnail plus seven figures
   * per card is far too much to put on a mid-range phone five hundred times:
   * the layout alone would janky the first paint, and every card holds an image
   * decode. Paging in twenty-fours keeps the document small without a
   * virtualiser — which would have meant a dependency, a fixed row height and a
   * scroll container that fights the page's own smooth scrolling. A "Load more"
   * button also keeps the back button and Ctrl-F working, which an infinite
   * windowed list does not.
   */
  const shown = useMemo(() => sorted.slice(0, page * PAGE), [sorted, page]);
  const more = sorted.length - shown.length;

  const openVideo: JoinedVideo | null = useMemo(
    () => (open === null ? null : (joined.find((v) => v.row.id === open) ?? null)),
    [open, joined]
  );

  /* Any overlay at all: the panel gives up its blur while one is up, so the
     three-layer budget holds. See the note at the top of this file. */
  const overlay = Boolean(openVideo || playing || posting || editing);

  const loading = content.isLoading || workLoading;
  const failed = content.isError || workError;

  const missingSortFigure =
    sort !== 'new' && shown.some((v) => (sort === 'gmv' ? v.gmv === null : v.views === null));

  return (
    <>
      <div className="flex flex-col gap-4">
        {!approved ? (
          <LockedUntilApproved />
        ) : loading ? (
          <Skeleton />
        ) : failed ? (
          <DataError
            title="We could not load your videos"
            body="Something went wrong on our side, not yours. Nothing you filed is lost."
            onRetry={() => Promise.all([content.refetch(), refetchWork()])}
            className="w-full"
          />
        ) : jobs.length === 0 && rows.length === 0 ? (
          <EmptyState
            title="Nothing to film yet"
            body="Take an offer and it appears here with the number of videos it asks for. Once you film and file them, this is where you see how each one is doing."
            className="w-full"
          />
        ) : (
          <>
            {/* ------------------------------------------------ header -- */}
            <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <p className="wx-numeric font-mono text-[2rem] leading-none font-extrabold">
                    {counts.all}
                  </p>
                  <p className="text-muted text-[0.8125rem]">
                    {counts.all === 1 ? 'video filed' : 'videos filed'}
                  </p>
                </div>

                {/*
                  THE COUNTERS ARE THE STATUS FILTER.

                  §9 asks for three counter pills in the header and a status
                  chip row in the filters, and built literally that is the same
                  three words twice, stacked, on a 375px screen where the
                  filters already take four rows. A counter that does nothing
                  next to a chip that does the obvious thing is a worse screen
                  than one pill that does both — so these count AND filter, and
                  the big figure beside them is the "all" they reset to.

                  "Still to film" is not a status a video can be in, so it is
                  a plain pill with nothing to press.
                */}
                <ul className="wx-tap-row flex flex-wrap items-center gap-1.5">
                  {STATUSES.map((key) => (
                    <li key={key} className="flex">
                      <StatusPill
                        label={CONTENT_STATUS[key].label}
                        count={counts[key]}
                        tone={CONTENT_STATUS[key].tone}
                        active={tab === key}
                        onClick={() => setTab(tab === key ? 'all' : key)}
                      />
                    </li>
                  ))}
                  {outstanding > 0 ? (
                    <li className="flex">
                      <StatusPill label="Still to film" count={outstanding} tone="due" />
                    </li>
                  ) : null}
                </ul>
              </div>

              {jobs.length > 0 ? (
                <Button onClick={() => setPosting({})}>
                  <Plus className="size-4" aria-hidden />
                  Add a video
                </Button>
              ) : null}
            </header>

            {/* ------------------------- the one blurred panel per page -- */}
            <section
              className={cn(
                'flex flex-col gap-4 rounded-xl p-3 sm:p-4',
                overlay ? 'wx-neo-raised-sm' : 'wx-neo-raised'
              )}
            >
              {/* ----------------------------------------- filter row -- */}
              <div className="wx-tap-row flex flex-wrap items-center gap-2">
                <ChipRow label="How to read your content">
                  {VIEWS.map((v) => (
                    <Chip key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
                      {v.label}
                    </Chip>
                  ))}
                </ChipRow>

                {view === 'submissions' ? (
                  <>
                    <ChipRow label="Sort videos">
                      {SORTS.map((s) => (
                        <Chip
                          key={s.key}
                          active={sort === s.key}
                          onClick={() => setSort(s.key)}
                        >
                          {s.label}
                        </Chip>
                      ))}
                    </ChipRow>

                    {/* Chips while a creator has a handful of brands, a select
                        once she has enough that chips would be a wall. Either
                        way the whole list is reachable without a sideways
                        scroller, which hides a filter behind an edge. */}
                    {brands.length === 0 ? null : brands.length <= 4 ? (
                      <ChipRow label="Filter by brand">
                        <Chip active={brandId === ''} onClick={() => setBrandId('')}>
                          All brands
                        </Chip>
                        {brands.map((b) => (
                          <Chip
                            key={b.id}
                            active={brandId === b.id}
                            onClick={() => setBrandId(b.id)}
                          >
                            {b.name}
                          </Chip>
                        ))}
                      </ChipRow>
                    ) : (
                      <>
                        <label className="sr-only" htmlFor="content-brand">
                          Filter by brand
                        </label>
                        <Select
                          id="content-brand"
                          name="brand"
                          value={brandId}
                          onChange={(e) => setBrandId(e.target.value)}
                          className="h-9 basis-40 text-[0.8125rem]"
                        >
                          <option value="">All brands</option>
                          {brands.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </Select>
                      </>
                    )}

                    {/*
                      THE HOUSE SEARCH FIELD, not a copy of it. This was a
                      hand-rolled `<input>` 2.25rem tall with `rounded-md` and
                      a focus RING — and a ring is a `box-shadow`, so focusing
                      it replaced the inset that makes `wx-neo-inset` read as a
                      well and the box went flat under the cursor. It was also
                      under the 2.75rem tap floor on a phone and only cleared
                      it by borrowing `wx-tap-row` from the row around it.
                      Offers, Contests and Leaderboards all draw the same
                      control, so there is one of it now; see
                      `components/creator/SearchField.tsx`.
                    */}
                    <CreatorSearch
                      value={search}
                      onChange={setSearch}
                      placeholder="Search ad code, brand or offer"
                      label="Search your content"
                    />
                  </>
                ) : null}
              </div>

              {/* ------------------------------------ what each source -- */}
              {view === 'submissions' ? (
                <SourceNotes
                  sources={sources}
                  onRetryAds={() => perf.refetch()}
                  onRetryTikTok={() => ttVideos.refetch()}
                />
              ) : null}

              {view === 'dashboard' ? (
                <Jobs
                  jobs={jobs}
                  progress={progress}
                  onAdd={(applicationId) => setPosting({ applicationId })}
                />
              ) : shown.length === 0 ? (
                <Note>
                  {rows.length === 0
                    ? 'No videos yet. Film your first one, paste the link and its ad code, and it lands here with its cover and, once ads run behind it, its GMV.'
                    : 'Nothing matches that. Try a different search, brand or status.'}
                </Note>
              ) : (
                <>
                  {missingSortFigure ? (
                    <p className="text-muted text-[0.75rem] leading-[1.4]">
                      Videos with no figure for this sort sit at the end. They are not zero —
                      nobody has reported them.
                    </p>
                  ) : null}

                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2.5 sm:gap-3">
                    {shown.map((video, i) => (
                      <m.li
                        key={video.row.id}
                        className="flex"
                        initial={quiet ? undefined : { opacity: 0, y: 12 }}
                        animate={quiet ? undefined : { opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.28,
                          /* ~40ms apart, capped: a stagger that keeps counting
                             past a dozen cards becomes a wait. */
                          delay: Math.min(i % PAGE, 11) * 0.04,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <VideoCard
                          video={video}
                          sources={sources}
                          onOpen={() => setOpen(video.row.id)}
                        />
                      </m.li>
                    ))}
                  </ul>

                  {more > 0 ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <Button variant="secondary" onClick={() => setPage((p) => p + 1)}>
                        Load {Math.min(more, PAGE)} more
                      </Button>
                      <p className="text-faint text-[0.6875rem]">
                        Showing {shown.length} of {sorted.length}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </>
        )}
      </div>

      {openVideo ? (
        <VideoSheet
          video={openVideo}
          sources={sources}
          onClose={() => setOpen(null)}
          /* The player REPLACES the sheet rather than stacking on it: two
             overlays at once is two more blurred layers. */
          onWatch={() => {
            setPlaying(openVideo.row);
            setOpen(null);
          }}
          onEdit={
            openVideo.row.status === 'approved'
              ? undefined
              : () => {
                  setEditing(openVideo.row);
                  setOpen(null);
                }
          }
        />
      ) : null}

      {posting ? (
        <PostContentDialog
          jobs={jobs}
          presetApplicationId={posting.applicationId ?? null}
          onClose={() => setPosting(null)}
        />
      ) : null}

      {editing ? (
        <PostContentDialog jobs={jobs} editing={editing} onClose={() => setEditing(null)} />
      ) : null}

      {playing ? <VideoPlayer row={playing} onClose={() => setPlaying(null)} /> : null}
    </>
  );
}

/* --------------------------------------------------------------- pieces --- */

/**
 * A count in a pill, which is also the status filter (see the note where these
 * are rendered). The tone rides a DOT as well as the text, so the three never
 * depend on colour to be told apart, and the selected one is a filled pill
 * rather than a tinted one — a shape change, not a hue change.
 */
function StatusPill({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: 'live' | 'due' | 'paid';
  active?: boolean;
  onClick?: () => void;
}) {
  const dot = (
    <span
      aria-hidden
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        tone === 'live' ? 'bg-stage-live' : tone === 'due' ? 'bg-stage-due' : 'bg-stage-paid'
      )}
    />
  );
  const body = (
    <>
      {dot}
      {label}
      <span
        className={cn(
          'wx-numeric font-mono font-bold',
          active ? '[color:var(--wx-on-accent-fill)]' : 'text-text'
        )}
      >
        {count}
      </span>
    </>
  );
  const shape =
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] whitespace-nowrap';

  if (!onClick) {
    return <span className={cn('wx-neo-raised-sm text-muted', shape)}>{body}</span>;
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={active ? 'Show every video again' : `Show only: ${label}`}
      className={cn(
        'ease-brand cursor-pointer transition-colors duration-200',
        shape,
        active
          ? '[background-color:var(--wx-accent-fill)] [color:var(--wx-on-accent-fill)]'
          : 'wx-neo-raised-sm wx-neo-press text-muted hover:text-accent'
      )}
    >
      {body}
    </button>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="wx-neo-inset flex max-w-full flex-wrap items-center gap-0.5 rounded-md p-1"
    >
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'ease-brand flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-[0.8125rem] font-medium transition-colors duration-200',
        /* The selected chip is a filled pill, so it takes his accent with ink on
           it. The rest are text and keep the accent ink on hover. */
        active
          ? '[background-color:var(--wx-accent-fill)] [color:var(--wx-on-accent-fill)]'
          : 'text-muted hover:text-accent'
      )}
    >
      {children}
    </button>
  );
}

/** A quiet line inside the panel. Never `EmptyState`: that is a blurred card. */
function Note({ children }: { children: ReactNode }) {
  return (
    <p className="wx-neo-inset text-muted max-w-prose rounded-md px-3 py-3 text-[0.8125rem] leading-[1.45]">
      {children}
    </p>
  );
}

/**
 * WHAT THE PAGE CANNOT TELL HER, SAID ONCE AT THE TOP.
 *
 * Without this, a TikTok that is not connected is explained twenty times over
 * in twenty info dots. The dots stay — they answer the question where it is
 * asked — but the thing she can actually DO about it belongs here, once, with
 * the button.
 */
function SourceNotes({
  sources,
  onRetryAds,
  onRetryTikTok,
}: {
  sources: Sources;
  onRetryAds: () => Promise<unknown> | void;
  onRetryTikTok: () => Promise<unknown> | void;
}) {
  if (sources.ads !== 'failed' && sources.tiktok !== 'failed' && sources.tiktok !== 'off') {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {sources.ads === 'failed' ? (
        <div className="wx-neo-inset flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2.5">
          <p className="text-muted max-w-prose text-[0.8125rem] leading-[1.45]">
            Your ad figures did not load, so GMV says &ldquo;Not reported&rdquo; rather than
            zero. Every video you filed is still here.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void onRetryAds()}>
            Try again
          </Button>
        </div>
      ) : null}

      {sources.tiktok === 'failed' ? (
        <div className="wx-neo-inset flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2.5">
          <p className="text-muted max-w-prose text-[0.8125rem] leading-[1.45]">
            Your views, likes and comments did not load. Your ads and GMV are unaffected.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void onRetryTikTok()}>
            Try again
          </Button>
        </div>
      ) : null}

      {sources.tiktok === 'off' ? (
        <div className="wx-neo-inset flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2.5">
          <p className="text-muted max-w-prose text-[0.8125rem] leading-[1.45]">
            Connect your TikTok to see views, likes and comments on each video. Until then you
            still see your ads and GMV.
          </p>
          <Link
            to="/app/profile"
            className="wx-neo-raised-sm wx-neo-press text-accent inline-flex h-9 items-center rounded-full px-4 text-[0.8125rem] font-semibold pointer-coarse:min-h-11"
          >
            Connect TikTok
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- jobs --- */

function Jobs({
  jobs,
  progress,
  onAdd,
}: {
  jobs: {
    id: string;
    brand: { name: string } | null;
    offer: { title: string } | null;
  }[];
  progress: Map<string, JobProgress> | undefined;
  onAdd: (applicationId: string) => void;
}) {
  if (jobs.length === 0) {
    return (
      <Note>
        No active jobs. Take an offer and its job appears here with the number of videos it asks
        for.
      </Note>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {jobs.map((job) => {
        const p = progress?.get(job.id);
        if (!p) return null;
        return (
          <li
            key={job.id}
            className={cn(
              'wx-neo-raised-sm flex flex-col gap-3 rounded-lg p-3',
              p.done && 'bg-stage-paid-soft!'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted truncate text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
                  {job.brand?.name ?? 'A brand'}
                </p>
                <p className="text-[0.90625rem] leading-[1.25] font-semibold break-words">
                  {job.offer?.title ?? 'An offer'}
                </p>
              </div>
              <p className="wx-numeric shrink-0 font-mono text-[0.9375rem] font-extrabold whitespace-nowrap">
                {p.required === null ? 'Open' : `${p.approved}/${p.required}`}
              </p>
            </div>

            {p.required !== null ? (
              <div className="wx-neo-inset flex h-2 gap-0.5 overflow-hidden rounded-full">
                {Array.from({ length: p.required }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-full flex-1 rounded-full',
                      i < p.approved
                        ? 'bg-stage-paid'
                        : i < p.approved + p.waiting
                          ? 'bg-stage-live'
                          : 'bg-surface-2'
                    )}
                  />
                ))}
              </div>
            ) : null}

            <div className="mt-auto flex items-center justify-between gap-2">
              <span className="text-muted text-[0.78125rem]">
                {p.done
                  ? 'All in and approved'
                  : p.required === null
                    ? `${p.posted} posted`
                    : `${p.remaining} still to film`}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onAdd(job.id)}>
                <Plus className="size-3.5" aria-hidden />
                Add
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------ skeleton --- */

/** The page's own shape, held while it loads. Never a spinner. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="wx-skeleton h-8 w-32 rounded-md" />
        <div className="wx-skeleton h-6 w-64 rounded-full" />
      </div>
      <div className="wx-neo-raised flex flex-col gap-4 rounded-xl p-3 sm:p-4">
        <div className="wx-skeleton h-10 rounded-md" />
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2.5 sm:gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-[17rem] rounded-lg" />
          ))}
        </ul>
      </div>
    </div>
  );
}
