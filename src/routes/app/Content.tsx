import { useMemo, useState } from 'react';
import { Plus, Search, Video } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { PostContentDialog } from '@/components/creator/PostContentDialog';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { VideoThumb } from '@/components/content/VideoThumb';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  CONTENT_STATUS,
  progressFor,
  type ContentRow,
  type ContentStatus,
} from '@/lib/content';
import { useMyContent } from '@/lib/creator/useMyContent';
import { useMyWork } from '@/lib/creator/useMyWork';

/**
 * My Content: everything a creator has filmed, and what is still owed.
 *
 * The board at the top is the point. A creator with four jobs running wants one
 * answer before anything else, "what do I still have to film", and that is a
 * number nobody could get out of this product until now.
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

  const [tab, setTab] = useState<Tab>('all');
  const [brandId, setBrandId] = useState('');
  const [search, setSearch] = useState('');
  const [posting, setPosting] = useState<{ applicationId?: string } | null>(null);
  const [editing, setEditing] = useState<ContentRow | null>(null);
  const [playing, setPlaying] = useState<ContentRow | null>(null);

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

  /** How much filming is left, across everything they are on. */
  const outstanding = useMemo(
    () =>
      jobs.reduce((total, job) => {
        const p = progressFor(rows, job.id, job.offer?.video_count ?? null);
        return total + (p.remaining ?? 0);
      }, 0),
    [jobs, rows]
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
    <AppShell>
      <div className="flex max-w-[1140px] flex-col gap-[14px]">
        <div className="flex flex-wrap items-end justify-between gap-4 px-0.5 py-1">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[clamp(26px,4.4vw,40px)] leading-[1.05] font-semibold tracking-[-0.02em]">
              My content
            </h1>
            <p className="text-muted text-[15px]">
              Every video you have filmed for us, and what is still to come.
            </p>
          </div>
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
          <div className="border-line bg-surface-1 rounded-[20px] border px-6 py-14 text-center shadow-md">
            <p className="font-semibold">That would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="border-line bg-surface-1 rounded-[20px] border px-6 py-16 text-center shadow-md">
            <Video size={26} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">Nothing to film yet</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
              Take an offer and it appears here with the number of videos it asks for.
            </p>
          </div>
        ) : (
          <>
            <Summary counts={counts} outstanding={outstanding} jobs={jobs.length} />

            <Jobs
              jobs={jobs}
              rows={rows}
              onAdd={(applicationId) => setPosting({ applicationId })}
            />

            {/* ------------------------------------------------------ list -- */}
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
                        'shrink-0 rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200',
                        tab === t.value ? 'bg-text text-inverse' : 'text-muted hover:text-text'
                      )}
                    >
                      {t.label}
                      {counts[t.value] > 0 ? (
                        <span
                          className={cn(
                            'ml-1.5 text-[12px]',
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
                    className="border-line-interactive bg-surface-1 placeholder:text-faint hover:border-accent/60 focus:border-accent h-9 w-full rounded-xl border pr-3 pl-9 text-[13px] focus:outline-none"
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
                  className="h-9 basis-44 text-[13px]"
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
                <div className="border-line bg-surface-1 rounded-[20px] border px-6 py-16 text-center shadow-md">
                  <Video size={26} aria-hidden className="text-faint mx-auto" />
                  <p className="mt-4 font-semibold">
                    {rows.length === 0 ? 'No videos yet' : 'Nothing matches that'}
                  </p>
                  <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
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
          </>
        )}
      </div>

      {posting ? (
        <PostContentDialog
          jobs={jobs}
          content={rows}
          presetApplicationId={posting.applicationId ?? null}
          onClose={() => setPosting(null)}
        />
      ) : null}

      {editing ? (
        <PostContentDialog
          jobs={jobs}
          content={rows}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {playing ? <VideoPlayer row={playing} onClose={() => setPlaying(null)} /> : null}
    </AppShell>
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
    <section className="border-line bg-surface-1 flex flex-col gap-5 rounded-[22px] border p-[clamp(18px,2.4vw,26px)] shadow-md">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
            Videos posted
          </p>
          <p className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-[clamp(38px,7vw,58px)] leading-none font-semibold tracking-[-0.03em]">
              {counts.all}
            </span>
            <span className="text-muted text-[13px]">
              across {jobs} {jobs === 1 ? 'job' : 'jobs'}
            </span>
          </p>
        </div>
      </div>

      <dl className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
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

/* ---------------------------------------------------------------- jobs --- */

function Jobs({
  jobs,
  rows,
  onAdd,
}: {
  jobs: {
    id: string;
    brand: { name: string } | null;
    offer: { title: string; video_count: number | null } | null;
  }[];
  rows: ContentRow[];
  onAdd: (applicationId: string) => void;
}) {
  return (
    <section className="border-line bg-surface-1 flex flex-col gap-[14px] rounded-[20px] border p-5 shadow-md">
      <h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
        What each job still needs
      </h2>

      <ul className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-2.5">
        {jobs.map((job) => {
          const p = progressFor(rows, job.id, job.offer?.video_count ?? null);
          return (
            <li
              key={job.id}
              className={cn(
                'border-line flex flex-col gap-2.5 rounded-[16px] border p-3.5',
                p.done ? 'bg-stage-paid-soft' : 'bg-surface-2'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-muted truncate text-[11px] font-semibold tracking-[0.08em] uppercase">
                    {job.brand?.name ?? 'A brand'}
                  </p>
                  <p className="text-[14.5px] leading-[1.25] font-semibold break-words">
                    {job.offer?.title ?? 'An offer'}
                  </p>
                </div>
                <p className="font-display shrink-0 text-[15px] font-semibold whitespace-nowrap">
                  {p.required === null ? 'Open' : `${p.approved}/${p.required}`}
                </p>
              </div>

              {p.required !== null ? (
                <div className="bg-surface-1 flex h-2 gap-0.5 overflow-hidden rounded-full">
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
                <span className="text-muted text-[12.5px]">
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

/* ---------------------------------------------------------------- card --- */

export function ContentCard({
  row,
  onPlay,
  onEdit,
  children,
}: {
  row: ContentRow;
  onPlay: () => void;
  onEdit?: () => void;
  /** The admin card slots its decision controls in here. */
  children?: React.ReactNode;
}) {
  const meta = CONTENT_STATUS[row.status];
  const tone = TONE[meta.tone];

  return (
    <article className="border-line bg-surface-1 flex h-full flex-col gap-3 rounded-[20px] border p-3 shadow-md transition-shadow duration-300 hover:shadow-lg">
      <VideoThumb row={row} onPlay={onPlay} />

      <div className="flex min-w-0 flex-1 flex-col gap-2 px-1 pb-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-muted min-w-0 truncate text-[11px] font-semibold tracking-[0.08em] uppercase">
            {row.brand?.name ?? 'A brand'}
          </p>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              tone.soft,
              tone.text
            )}
          >
            {meta.label}
          </span>
        </div>

        <p className="text-[14px] leading-[1.3] font-semibold break-words">
          {row.offer?.title ?? 'An offer'}
        </p>

        <p className="text-muted font-mono text-[11.5px] break-all">{row.ad_code}</p>

        {row.ad_authorized ? null : (
          <p className="text-stage-due text-[12px] font-medium">Not marked authorised</p>
        )}

        {row.decision_note ? (
          <p className="text-muted border-line border-t pt-2 text-[12.5px] leading-relaxed">
            {row.decision_note}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <time dateTime={row.created_at} className="text-faint text-[11.5px]">
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

        {children}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------ skeleton --- */

function Skeleton() {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="wx-skeleton h-[190px] rounded-[22px]" />
      <div className="wx-skeleton h-[150px] rounded-[20px]" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="wx-skeleton h-[360px] rounded-[20px]" />
        ))}
      </ul>
    </div>
  );
}
