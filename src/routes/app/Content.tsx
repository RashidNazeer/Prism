import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Eye, Heart, MessageCircle, Play, Plus, Search, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataError, EmptyState, Freshness } from '@/components/ui/DataState';
import { Select } from '@/components/ui/Field';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { PostContentDialog } from '@/components/creator/PostContentDialog';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  CONTENT_STATUS,
  videoIdFrom,
  type ContentRow,
  type ContentStatus,
} from '@/lib/content';
import { useMyContent } from '@/lib/creator/useMyContent';
import { useMyWork } from '@/lib/creator/useMyWork';
import {
  adStateOf,
  usePerformanceWindow,
  useVideoPerformance,
  type AdState,
  type VideoPerformance,
} from '@/lib/creator/usePerformance';
import {
  useTikTokAccount,
  useTikTokVideos,
  type TikTokVideo,
} from '@/lib/creator/useTikTokAccount';
import { useMyJobProgress, type JobProgress } from '@/lib/work/job-progress';

/**
 * My Content: every video the creator filed, and how each one is doing.
 *
 * THREE SOURCES, JOINED IN THE BROWSER, because no single hook has all of it:
 * the filed video and its review status (`useMyContent`), the ad story and the
 * GMV behind it (`useVideoPerformance`, by submission id), and views, likes and
 * comments (`useTikTokVideos`, by the post id in the link). Each is optional.
 * A video with no match in a source simply shows nothing from it.
 *
 * NULL IS NOT ZERO. A figure TikTok withheld, or an account that is not
 * connected, leaves that figure OUT. It is never drawn as 0.
 *
 * NO BORDERS. The neomorphic shadows carry every edge.
 */

const TONE = {
  live: { text: 'text-stage-live', soft: 'bg-stage-live-soft' },
  due: { text: 'text-stage-due', soft: 'bg-stage-due-soft' },
  paid: { text: 'text-stage-paid', soft: 'bg-stage-paid-soft' },
} as const;

type Tab = 'all' | ContentStatus;

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'submitted', label: 'With the team' },
  { value: 'approved', label: 'Approved' },
  { value: 'needs_another_take', label: 'Another take' },
];

const VIEWS = [
  { key: 'submissions', label: 'Videos' },
  { key: 'dashboard', label: 'Jobs' },
] as const;
type View = (typeof VIEWS)[number]['key'];

const AD_LABEL: Record<AdState, { label: string; tone: keyof typeof TONE | 'none' }> = {
  running: { label: 'Ads running', tone: 'live' },
  ran: { label: 'Ads finished', tone: 'paid' },
  none: { label: 'No ads', tone: 'none' },
};

const compact = (n: number) =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const money = (n: number, currency: string | null) =>
  currency
    ? new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(n)
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);

const todayIso = () => new Date().toISOString().slice(0, 10);

export function Content() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  const {
    data: work,
    isLoading: workLoading,
    isError: workError,
    refetch: refetchWork,
  } = useMyWork();
  const content = useMyContent();
  const { data: progress } = useMyJobProgress();

  // Ad story and GMV per video, all time. A failure here must not hide the
  // videos themselves, so it is tracked separately.
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
  const [search, setSearch] = useState('');
  const [posting, setPosting] = useState<{ applicationId?: string } | null>(null);
  const [editing, setEditing] = useState<ContentRow | null>(null);
  const [playing, setPlaying] = useState<ContentRow | null>(null);

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

  const jobs = useMemo(() => (work ?? []).filter((r) => r.status === 'approved'), [work]);
  const rows = useMemo(() => content.data ?? [], [content.data]);

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

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
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
  }, [rows, tab, brandId, search]);

  // The ad story across every filed video, for the strip at the top.
  const ads = useMemo(() => {
    let running = 0;
    let finished = 0;
    let revenue = 0;
    const currencies = new Set<string | null>();
    for (const p of perf.data ?? []) {
      if (!rows.some((r) => r.id === p.submission_id)) continue;
      const s = adStateOf(p, latest);
      if (s === 'running') running += 1;
      if (s === 'ran') finished += 1;
      if (s !== 'none') {
        revenue += p.lifetime_revenue;
        currencies.add(p.currency);
      }
    }
    return {
      running,
      finished,
      any: running + finished > 0,
      revenue,
      // Several currencies, or one that is itself null: no symbol, never a guess.
      currency: currencies.size === 1 ? ([...currencies][0] ?? null) : null,
    };
  }, [perf.data, rows, latest]);

  const loading = content.isLoading || workLoading;
  const failed = content.isError || workError;

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
            <FilterBar
              action={
                jobs.length > 0 ? (
                  <Button onClick={() => setPosting({})}>
                    <Plus size={16} aria-hidden />
                    Add a video
                  </Button>
                ) : null
              }
            >
              <FilterTabs label="How to read your content">
                {VIEWS.map((v) => (
                  <FilterTab key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
                    {v.label}
                  </FilterTab>
                ))}
              </FilterTabs>

              {view === 'submissions' ? (
                <>
                  <FilterTabs label="Filter content">
                    {TABS.map((t) => (
                      <FilterTab
                        key={t.value}
                        active={tab === t.value}
                        count={counts[t.value] > 0 ? counts[t.value] : undefined}
                        onClick={() => setTab(t.value)}
                      >
                        {t.label}
                      </FilterTab>
                    ))}
                  </FilterTabs>

                  <div className="relative min-w-0 flex-1 basis-48">
                    <Search
                      size={15}
                      aria-hidden
                      className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                    />
                    <input
                      type="search"
                      name="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by ad code, brand or offer"
                      aria-label="Search your content"
                      className="wx-neo-inset placeholder:text-faint focus-visible:ring-accent/50 h-10 w-full rounded-md pr-3 pl-9 text-[0.8125rem] focus:outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
                    />
                  </div>
                  <label className="sr-only" htmlFor="content-brand">
                    Filter by brand
                  </label>
                  <Select
                    id="content-brand"
                    name="brand"
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    className="h-10 basis-40 text-[0.8125rem] pointer-coarse:min-h-11"
                  >
                    <option value="">All brands</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </>
              ) : null}
            </FilterBar>

            {view === 'dashboard' ? (
              <Jobs
                jobs={jobs}
                progress={progress}
                onAdd={(applicationId) => setPosting({ applicationId })}
              />
            ) : (
              <section className="flex flex-col gap-4">
                <Strip
                  counts={counts}
                  outstanding={outstanding}
                  ads={ads}
                  perfLoading={perf.isPending}
                  perfFailed={perf.isError}
                  onRetry={() => perf.refetch()}
                  latest={latest}
                  hasApproved={counts.approved > 0}
                />

                {account.isSuccess && !connected ? (
                  <EmptyState
                    title="Connect your TikTok to see views, likes and comments"
                    body="Each video shows its views, likes and comments once your account is connected. Until then you still see your ads and GMV."
                    action={
                      <Link
                        to="/app/profile"
                        className="wx-neo-raised-sm wx-neo-press text-accent inline-flex h-9 items-center rounded-full px-4 text-[0.8125rem] font-semibold pointer-coarse:min-h-11"
                      >
                        Connect TikTok
                      </Link>
                    }
                    className="w-full"
                  />
                ) : null}

                {shown.length === 0 ? (
                  rows.length === 0 ? (
                    <EmptyState
                      title="No videos yet"
                      body="Film your first video, paste the link and its ad code, and it lands here with its cover and, once ads run behind it, its GMV."
                      action={
                        jobs.length > 0 ? (
                          <Button onClick={() => setPosting({})}>
                            <Plus size={16} aria-hidden />
                            Add a video
                          </Button>
                        ) : null
                      }
                      className="w-full"
                    />
                  ) : (
                    <EmptyState
                      title="Nothing matches that"
                      body="Try a different search, brand or tab."
                      className="w-full"
                    />
                  )
                ) : (
                  <ul className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
                    {shown.map((row) => (
                      <li key={row.id} className="flex">
                        <VideoCard
                          row={row}
                          perf={perfBySubmission.get(row.id) ?? null}
                          perfPending={perf.isPending}
                          perfFailed={perf.isError}
                          latest={latest}
                          tiktok={
                            connected ? (tiktokById.get(videoIdFrom(row) ?? '') ?? null) : null
                          }
                          onPlay={() => setPlaying(row)}
                          onEdit={row.status === 'approved' ? undefined : () => setEditing(row)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>

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

/* --------------------------------------------------------------- strip --- */

/**
 * The state of the whole library in one raised panel.
 *
 * Zero tiles are left out rather than printed, and the GMV tile only exists
 * once ads have actually run. When videos are filed but no ads have, the strip
 * says so in words and says when numbers will appear, instead of showing empty
 * figures.
 */
function Strip({
  counts,
  outstanding,
  ads,
  perfLoading,
  perfFailed,
  onRetry,
  latest,
  hasApproved,
}: {
  counts: Record<Tab, number>;
  outstanding: number;
  ads: {
    running: number;
    finished: number;
    any: boolean;
    revenue: number;
    currency: string | null;
  };
  perfLoading: boolean;
  perfFailed: boolean;
  onRetry: () => Promise<unknown>;
  latest: string | null;
  hasApproved: boolean;
}) {
  const tiles: { label: string; value: string; tone?: keyof typeof TONE; wide?: boolean }[] = [
    { label: 'Videos filed', value: String(counts.all) },
  ];
  if (counts.approved > 0)
    tiles.push({ label: 'Approved', value: String(counts.approved), tone: 'paid' });
  if (counts.submitted > 0)
    tiles.push({ label: 'With the team', value: String(counts.submitted), tone: 'live' });
  if (counts.needs_another_take > 0) {
    tiles.push({
      label: 'Another take',
      value: String(counts.needs_another_take),
      tone: 'due',
    });
  }
  if (outstanding > 0)
    tiles.push({ label: 'Still to film', value: String(outstanding), tone: 'due' });
  if (ads.running > 0)
    tiles.push({ label: 'Ads running', value: String(ads.running), tone: 'live' });
  if (ads.finished > 0)
    tiles.push({ label: 'Ads finished', value: String(ads.finished), tone: 'paid' });
  if (ads.any && ads.revenue > 0) {
    tiles.push({ label: 'GMV from your videos', value: money(ads.revenue, ads.currency) });
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={cn(
              'wx-neo-raised flex flex-col gap-1.5 rounded-xl p-4',
              t.tone && TONE[t.tone].soft
            )}
          >
            <dt
              className={cn(
                'text-[0.75rem] font-semibold',
                t.tone ? TONE[t.tone].text : 'text-muted'
              )}
            >
              {t.label}
            </dt>
            <dd className="wx-numeric font-mono text-[1.5rem] font-extrabold">{t.value}</dd>
          </div>
        ))}
      </dl>

      {perfFailed ? (
        <DataError
          title="We could not load your ad figures"
          body="Your videos are all here. Only the ads and GMV on them are missing for now."
          onRetry={onRetry}
          className="w-full"
        />
      ) : perfLoading ? (
        <div className="wx-skeleton h-14 rounded-xl" />
      ) : (
        <div className="wx-neo-inset flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl px-4 py-3">
          <p className="text-muted max-w-prose text-[0.8125rem] leading-[1.45]">
            {ads.any
              ? "We don't run ads behind every video. The ones without ads still count toward your offer."
              : hasApproved
                ? "No ads are running behind your videos yet. Numbers appear here once they are, and they run up to the end of yesterday. We don't run ads behind every video, and the ones without ads still count toward your offer."
                : "Your videos are filed and waiting for the team. Ads can only run behind an approved video, so numbers appear once one is approved and ads start. We don't run ads behind every video, and the ones without ads still count toward your offer."}
          </p>
          {ads.any ? <Freshness to={latest} /> : null}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- card --- */

/** The cover, with a quiet fallback chain: our copy, then TikTok's, then a plate. */
function Cover({
  row,
  fallback,
  onPlay,
}: {
  row: ContentRow;
  fallback: string | null;
  onPlay: () => void;
}) {
  const [step, setStep] = useState(0);
  const sources = [row.thumbnail_url, fallback].filter((s): s is string => Boolean(s));
  const src = sources[step];

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${row.video_title ?? 'this video'}`}
      className="group bg-surface-2 wx-neo-inset relative block aspect-[4/5] w-full cursor-pointer overflow-hidden rounded-lg"
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setStep((s) => s + 1)}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <span className="text-muted grid size-full place-items-center">
          <Video size={26} aria-hidden />
        </span>
      )}
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center bg-black/0 opacity-80 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
      >
        <span className="bg-accent text-on-accent grid size-11 place-items-center rounded-full shadow-lg">
          <Play size={18} fill="currentColor" aria-hidden />
        </span>
      </span>
    </button>
  );
}

function VideoCard({
  row,
  perf,
  perfPending,
  perfFailed,
  latest,
  tiktok,
  onPlay,
  onEdit,
}: {
  row: ContentRow;
  perf: VideoPerformance | null;
  perfPending: boolean;
  perfFailed: boolean;
  latest: string | null;
  tiktok: TikTokVideo | null;
  onPlay: () => void;
  onEdit?: (() => void) | undefined;
}) {
  const meta = CONTENT_STATUS[row.status];
  const tone = TONE[meta.tone];

  // Ads are only meaningful once a video is approved. A video that is still
  // with the team says nothing about ads rather than "No ads".
  const adState: AdState | null = perf
    ? adStateOf(perf, latest)
    : row.status === 'approved' && !perfPending && !perfFailed
      ? 'none'
      : null;

  // Engagement: every figure is nullable and a null is left out, never a 0.
  const stats = tiktok
    ? [
        { key: 'views', Icon: Eye, label: 'views', value: tiktok.view_count },
        { key: 'likes', Icon: Heart, label: 'likes', value: tiktok.like_count },
        {
          key: 'comments',
          Icon: MessageCircle,
          label: 'comments',
          value: tiktok.comment_count,
        },
      ].filter((s): s is typeof s & { value: number } => s.value !== null)
    : [];

  return (
    <article className="wx-neo-raised ease-brand flex w-full flex-col gap-3 rounded-xl p-3 transition-transform duration-300 hover:-translate-y-0.5">
      <Cover row={row} fallback={tiktok?.cover_image_url ?? null} onPlay={onPlay} />

      <div className="flex min-w-0 flex-1 flex-col gap-2 px-1 pb-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-muted min-w-0 truncate text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
            {row.brand?.name ?? 'A brand'}
          </p>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
              tone.soft,
              tone.text
            )}
          >
            {meta.creatorLabel}
          </span>
        </div>

        <p className="text-[0.875rem] leading-[1.3] font-semibold break-words">
          {row.offer?.title ?? 'An offer'}
        </p>

        {stats.length > 0 ? (
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1">
            {stats.map(({ key, Icon, label, value }) => (
              <li key={key} className="text-muted flex items-center gap-1 text-[0.75rem]">
                <Icon size={13} aria-hidden />
                <span className="wx-numeric text-text font-mono font-bold">
                  {compact(value)}
                </span>
                <span className="sr-only">{label}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {perfPending && row.status === 'approved' ? (
          <div className="wx-skeleton h-14 rounded-md" />
        ) : adState ? (
          <AdBlock state={adState} perf={perf} />
        ) : null}

        <p className="text-muted font-mono text-[0.71875rem] break-all">{row.ad_code}</p>

        {row.ad_authorized ? null : (
          <p className="text-stage-due text-[0.75rem] font-medium">Not marked authorised</p>
        )}

        {row.decision_note ? (
          <p className="wx-neo-inset text-muted rounded-md px-3 py-2 text-[0.78125rem] leading-relaxed">
            {row.decision_note}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <time dateTime={row.created_at} className="text-muted text-[0.71875rem]">
            {new Date(row.created_at).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            })}
          </time>
          {onEdit ? (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Which of the three ad stories this video is in, in words, with its GMV. */
function AdBlock({ state, perf }: { state: AdState; perf: VideoPerformance | null }) {
  const meta = AD_LABEL[state];
  const hasSales = perf && state !== 'none' && perf.lifetime_revenue > 0;

  return (
    <div className="wx-neo-inset flex flex-col gap-1 rounded-md px-3 py-2.5">
      <span
        className={cn(
          'w-fit rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
          meta.tone === 'none'
            ? 'bg-surface-2 text-muted'
            : [TONE[meta.tone].soft, TONE[meta.tone].text]
        )}
      >
        {meta.label}
      </span>
      {state === 'none' ? (
        <p className="text-muted text-[0.75rem] leading-[1.4]">
          No ads on this one. It still counts toward your offer.
        </p>
      ) : hasSales ? (
        <p className="text-muted text-[0.75rem]">
          <span className="wx-numeric text-text font-mono text-[1.0625rem] font-extrabold">
            {money(perf.lifetime_revenue, perf.currency)}
          </span>{' '}
          GMV
        </p>
      ) : (
        <p className="text-muted text-[0.75rem] leading-[1.4]">No sales on it yet.</p>
      )}
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
      <EmptyState
        title="No active jobs"
        body="Take an offer and its job appears here with the number of videos it asks for."
        className="w-full"
      />
    );
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-3">
      {jobs.map((job) => {
        const p = progress?.get(job.id);
        if (!p) return null;
        return (
          <li
            key={job.id}
            className={cn(
              'wx-neo-raised flex flex-col gap-3 rounded-xl p-4',
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
                <Plus size={14} aria-hidden />
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

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="wx-skeleton h-14 rounded-lg" />
      <div className="wx-skeleton h-24 rounded-xl" />
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="wx-skeleton h-[22rem] rounded-xl" />
        ))}
      </ul>
    </div>
  );
}
