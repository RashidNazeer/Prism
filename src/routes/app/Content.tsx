import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Search, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { PostContentDialog } from '@/components/creator/PostContentDialog';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { ContentCard } from '@/components/content/ContentCard';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { type ContentRow, type ContentStatus } from '@/lib/content';
import { useMyContent } from '@/lib/creator/useMyContent';
import { useMyWork } from '@/lib/creator/useMyWork';
import { useMyJobProgress, type JobProgress } from '@/lib/work/job-progress';

/**
 * My Content: everything a creator has filmed, and what is still owed.
 *
 * Two sections rather than one column. The board and the job list are a page in
 * their own right and used to sit ON TOP of the work, so a creator coming to
 * look at a video scrolled past the same summary every single time. They now
 * have their own room, and Submissions is what you land on.
 *
 * The dashboard still answers the question somebody with four jobs running
 * actually has, "what do I still have to film", which is a number nobody could
 * get out of this product until now.
 *
 * Only APPROVED videos count towards a job. That is the rule everywhere,
 * including in the database, so a creator can never be told they are finished
 * by a screen and then told otherwise by the team.
 */

const TONE = {
  live: { text: 'text-stage-live', soft: 'bg-stage-live-soft', bar: 'bg-stage-live' },
  due: { text: 'text-stage-due', soft: 'bg-stage-due-soft', bar: 'bg-stage-due' },
  paid: { text: 'text-stage-paid', soft: 'bg-stage-paid-soft', bar: 'bg-stage-paid' },
} as const;

type Tab = 'all' | ContentStatus;

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'submitted', label: 'With the team' },
  { value: 'approved', label: 'Approved' },
  { value: 'needs_another_take', label: 'Another take' },
];

export function Content() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  const { data: work, isLoading: workLoading } = useMyWork();
  const { data: content, isLoading, isError, error } = useMyContent();
  // The one source for "how much of this job is done", shared with the home
  // screen, the offers list and the brand hub.
  const { data: progress } = useMyJobProgress();

  /*
   * Submissions first, deliberately.
   *
   * The board and the job list together are taller than a laptop viewport, so
   * landing on them meant scrolling past a summary every single time to reach
   * the work. Same rule the admin screens follow: the default section is the
   * job, not the summary. The dashboard is one click away and keeps its own
   * room rather than sitting on top of everything else.
   */
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
   * `?job=<id>` opens the dialog straight onto that job.
   *
   * Every screen that now says "one still to film" links here. Without this the
   * link would land somebody on a list with the dialog shut, which turns an
   * action back into a signpost, and the whole point of putting the number on
   * those screens was that there was nowhere to act on it.
   *
   * The parameter is consumed rather than kept: it describes an arrival, not a
   * state of the screen, so leaving it in the address bar would reopen the
   * dialog on every back button.
   */
  const job = params.get('job');
  useEffect(() => {
    if (!job) return;
    setPosting({ applicationId: job });
    const p = new URLSearchParams(params);
    p.delete('job');
    setParams(p, { replace: true });
    // `params` is a fresh object every render, so it cannot be a dependency
    // without re-running this immediately after it clears itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const jobs = useMemo(() => (work ?? []).filter((r) => r.status === 'approved'), [work]);
  // A fresh [] every render would defeat every memo below it.
  const rows = useMemo(() => content ?? [], [content]);

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

  /**
   * How much filming is left, across everything they are on.
   *
   * From the view, and therefore measured against the count FROZEN on each job
   * rather than whatever the offer says today. Working it out from the content
   * rows meant re-scoping an offer silently changed how much somebody already
   * filming still owed.
   */
  const outstanding = useMemo(
    () => jobs.reduce((total, job) => total + (progress?.get(job.id)?.remaining ?? 0), 0),
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

  return (
    <>
      <div className="flex max-w-[1140px] flex-col gap-[14px]">
        {/*
          NO TITLE ROW. The top bar names the section and carries its one line,
          so all that is left here is the action, pinned right, which is the
          rule the admin screens already follow: row one is the work.
          `justify-end` rather than `justify-between`, because with the title
          gone a single child would otherwise sit on the left.
        */}
        <div className="flex flex-wrap items-end justify-end gap-4 px-0.5">
          {approved && jobs.length > 0 ? (
            <Button onClick={() => setPosting({})}>
              <Plus size={16} aria-hidden />
              Add a video
            </Button>
          ) : null}
        </div>

        {!approved ? (
          <LockedUntilApproved />
        ) : isLoading || workLoading ? (
          <Skeleton />
        ) : isError ? (
          <div className="wx-neo-raised rounded-xl px-6 py-14 text-center">
            <p className="font-semibold">That would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="wx-neo-raised rounded-xl px-6 py-16 text-center">
            <Video size={26} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">Nothing to film yet</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              Take an offer and it appears here with the number of videos it asks for.
            </p>
          </div>
        ) : (
          <>
            <ViewSwitch view={view} onChange={setView} />

            {view === 'dashboard' ? (
              <>
                <Summary counts={counts} outstanding={outstanding} jobs={jobs.length} />
                <Jobs
                  jobs={jobs}
                  progress={progress}
                  onAdd={(applicationId) => setPosting({ applicationId })}
                />
              </>
            ) : (
              /* ---------------------------------------------------- list -- */
              <section className="flex flex-col gap-[14px]">
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
                        aria-selected={tab === t.value}
                        onClick={() => setTab(t.value)}
                        className={cn(
                          'shrink-0 rounded-[9px] px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors duration-200',
                          tab === t.value
                            ? 'bg-text text-inverse'
                            : 'text-muted hover:text-text'
                        )}
                      >
                        {t.label}
                        {counts[t.value] > 0 ? (
                          <span
                            className={cn(
                              'ml-1.5 text-[0.75rem]',
                              tab === t.value ? 'text-inverse/70' : 'text-muted'
                            )}
                          >
                            {counts[t.value]}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>

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
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by ad code, brand or offer"
                      aria-label="Search your content"
                      className="wx-neo-inset border-line-interactive placeholder:text-faint hover:border-accent/60 focus:border-accent h-9 w-full rounded-xl border pr-3 pl-9 text-[0.8125rem] focus:outline-none"
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
                    className="h-9 basis-44 text-[0.8125rem]"
                  >
                    <option value="">All brands</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>

                {shown.length === 0 ? (
                  <div className="wx-neo-raised rounded-xl px-6 py-16 text-center">
                    <Video size={26} aria-hidden className="text-faint mx-auto" />
                    <p className="mt-4 font-semibold">
                      {rows.length === 0 ? 'No videos yet' : 'Nothing matches that'}
                    </p>
                    <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
                      {rows.length === 0
                        ? 'Film your first video, paste the link and its ad code, and it lands here.'
                        : 'Try a different search, brand or tab.'}
                    </p>
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {shown.map((row) => (
                      <li key={row.id}>
                        <ContentCard
                          row={row}
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

/* --------------------------------------------------------------- view --- */

/**
 * Two sections, not one long scroll.
 *
 * The board and the job list are a page in their own right, and stacking them
 * above the work meant a creator scrolled past the same summary every time they
 * came to look at a video. The choice lives in the URL so a refresh keeps it.
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
      aria-label="How to read your content"
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
            'rounded-[9px] px-[11px] py-1.5 text-[0.8125rem] font-medium transition-colors duration-200',
            view === v.key ? 'bg-text text-inverse' : 'text-muted hover:text-text'
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- summary --- */

function Summary({
  counts,
  outstanding,
  jobs,
}: {
  counts: Record<Tab, number>;
  outstanding: number;
  jobs: number;
}) {
  const cells = [
    { label: 'Still to film', value: outstanding, tone: TONE.due, lead: true },
    { label: 'Approved', value: counts.approved, tone: TONE.paid },
    { label: 'With the team', value: counts.submitted, tone: TONE.live },
    { label: 'Another take', value: counts.needs_another_take, tone: TONE.due },
  ];

  return (
    <section className="wx-neo-raised flex flex-col gap-5 rounded-xl p-[clamp(18px,2.4vw,26px)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Videos posted
          </p>
          <p className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-[clamp(2.375rem,7vw,3.625rem)] leading-none font-semibold tracking-[-0.03em]">
              {counts.all}
            </span>
            <span className="text-muted text-[0.8125rem]">
              across {jobs} {jobs === 1 ? 'job' : 'jobs'}
            </span>
          </p>
        </div>
      </div>

      <dl className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
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
  return (
    <section className="wx-neo-raised flex flex-col gap-[14px] rounded-xl p-5">
      <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        What each job still needs
      </h2>

      <ul className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-2.5">
        {jobs.map((job) => {
          const p = progress?.get(job.id);
          if (!p) return null;
          return (
            <li
              key={job.id}
              className={cn(
                'wx-neo-inset flex flex-col gap-2.5 rounded-[16px] p-3.5',
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
                <p className="font-display shrink-0 text-[0.9375rem] font-semibold whitespace-nowrap">
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
                            : 'bg-line'
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
    </section>
  );
}

/* ------------------------------------------------------------ skeleton --- */

function Skeleton() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="wx-skeleton h-[190px] rounded-xl" />
      <div className="wx-skeleton h-[150px] rounded-xl" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="wx-skeleton h-[360px] rounded-xl" />
        ))}
      </ul>
    </div>
  );
}
