import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import { m } from 'motion/react';
import {
  Briefcase,
  Check,
  ChevronDown,
  Clock,
  Minus,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { TiltCard, TiltLift } from '@/components/ui/TiltCard';
import { DateRangePicker } from '@/components/creator/DateRangePicker';
import {
  useBrandPerformance,
  useDailyPerformance,
  usePerformanceWindow,
  type BrandPerformance,
  type DailyPerformance,
} from '@/lib/creator/usePerformance';
import {
  addDays,
  clamp,
  presetToRange,
  type DateRange,
  type PresetKey,
} from '@/lib/creator/date-range';
import { WelcomeMoment } from '@/components/creator/WelcomeMoment';
import { ApprovedMoment } from '@/components/creator/ApprovedMoment';
import { MoneySplit, PipelineBoard } from '@/components/creator/PipelineBoard';
import { ContestEarnings } from '@/components/creator/ContestEarnings';
import { useContestEarnings } from '@/lib/creator/useContestEarnings';
import { JobProgressBar } from '@/components/work/JobProgress';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { STAGE_META, stageIndex, type OfferStage } from '@/lib/offer-stages';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useApplication } from '@/lib/auth/useApplication';
import { useOnboarding } from '@/lib/creator/useOnboarding';
import {
  useMyStageEvents,
  useMyWork,
  useWorkSummary,
  type MyWorkRow,
  type StageEvent,
  type WorkSummary,
} from '@/lib/creator/useMyWork';
import { needsFilming, useMyJobProgress, type JobProgress } from '@/lib/work/job-progress';

/**
 * The empty board, split off into its own chunk.
 *
 * It needs the offers list, the brands list and the apply dialog, and the
 * dialog drags the whole Zod schema chunk along with it. Imported directly
 * that weight landed on the home screen of every creator who already HAS work,
 * which is the screen that most needs to paint fast on a phone.
 */
const FirstDay = lazy(() => import('@/components/creator/FirstDay'));

/**
 * Home for applicants and creators.
 *
 * Four states, one screen: waiting on a decision, turned down, approved but
 * with nothing on yet, and working. The last one is the real product, and it is
 * the only screen in here that answers the question a creator actually opens
 * the app with: where is my money and what is happening to it.
 *
 * Everything is live. `useMyWork` watches this creator's own rows, so an admin
 * marking a sample shipped or a payment made lands here while they are looking
 * at it, with no refresh. That is the whole thesis of the product in one
 * behaviour, and as of 2026-08-11 you can SEE it happen: the card that moved
 * flashes, the figure that changed bumps, and the new line pops into the
 * timeline saying "just now".
 */
export function Dashboard() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const { data: application, isLoading: appLoading } = useApplication();
  const { moment, dismiss, dismissing } = useOnboarding();

  // Prefer the profile row over the JWT claim. A token only refreshes about
  // once an hour, so a creator approved thirty seconds ago is still carrying
  // `applicant` in their claims.
  const role = profile?.role ?? claims?.role;
  const firstName = (profile?.display_name || profile?.email?.split('@')[0] || '').split(
    ' '
  )[0];
  const status = application?.status;

  return (
    <>
      {moment === 'welcome' ? (
        <WelcomeMoment
          name={firstName ?? ''}
          busy={dismissing}
          onDone={() => dismiss('welcome')}
        />
      ) : null}

      {moment === 'approved' ? (
        <ApprovedMoment
          name={firstName ?? ''}
          tier={profile?.tier ?? null}
          note={application?.review_note ?? null}
          busy={dismissing}
          onDone={() => dismiss('approved')}
        />
      ) : null}

      {appLoading ? (
        <Skeleton />
      ) : role === 'creator' ? (
        <CreatorHome
          name={firstName ?? ''}
          tier={profile?.tier ?? null}
          handle={application?.tiktok_handle ?? null}
        />
      ) : status === 'rejected' ? (
        <Rejected note={application?.review_note ?? null} />
      ) : application ? (
        <InReview
          name={firstName ?? ''}
          handle={application.tiktok_handle}
          appliedAt={application.created_at}
        />
      ) : (
        <Unfinished />
      )}
    </>
  );
}

/* ------------------------------------------------------------ live moves -- */

/**
 * Which pieces of work changed stage WHILE somebody was looking.
 *
 * The first load is deliberately not a change. Everything would qualify, the
 * whole board would flash at once, and people would learn to ignore it.
 */
function useJustMoved(rows: MyWorkRow[] | undefined) {
  const previous = useRef<Map<string, OfferStage | null> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [moved, setMoved] = useState<{ ids: Set<string>; key: number }>({
    ids: new Set(),
    key: 0,
  });

  useEffect(() => {
    if (!rows) return;
    const next = new Map(rows.map((r) => [r.id, r.stage]));
    const before = previous.current;
    previous.current = next;
    if (!before) return;

    const ids = new Set<string>();
    for (const [id, stage] of next) {
      if (before.has(id) && before.get(id) !== stage) ids.add(id);
    }
    if (ids.size === 0) return;

    // The key forces React to remount the animated nodes, which is what
    // actually restarts a CSS animation. Re-adding the same class does not.
    setMoved((prev) => ({ ids, key: prev.key + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMoved({ ids: new Set(), key: 0 }), 2600);
  }, [rows]);

  // Cleared on unmount only. Clearing it as effect teardown would cut the
  // flash short every time an unrelated refetch handed back a new array.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return moved;
}

/* ------------------------------------------------------------ the board -- */

const BUCKET_TONE = {
  working: {
    text: 'text-stage-live',
    bar: 'bg-stage-live',
    soft: 'bg-stage-live-soft',
    dot: 'bg-stage-live',
  },
  due: {
    text: 'text-stage-due',
    bar: 'bg-stage-due',
    soft: 'bg-stage-due-soft',
    dot: 'bg-stage-due',
  },
  paid: {
    text: 'text-stage-paid',
    bar: 'bg-stage-paid',
    soft: 'bg-stage-paid-soft',
    dot: 'bg-stage-paid',
  },
} as const;

const toneFor = (stage: OfferStage) => BUCKET_TONE[STAGE_META[stage].bucket];

function greet(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

function CreatorHome({
  name,
  tier,
  handle,
}: {
  name: string;
  tier: string | null;
  handle: string | null;
}) {
  const { data: rows, isLoading } = useMyWork();
  // Eight, not more. Four jobs walking seven stages each generate a lot of
  // history, and a timeline long enough to outrun the work list beside it
  // turns the whole right column into a wall nobody reads to the bottom of.
  const { data: events } = useMyStageEvents(8);
  // How much of each job has actually been filmed. The stage says where the
  // work stands with US; this says where it stands with THEM.
  const { data: progress } = useMyJobProgress();
  const summary = useWorkSummary(rows);
  const moved = useJustMoved(rows);
  /*
   * Read here as well as inside `ContestEarnings`, and that is one request:
   * TanStack dedupes on the query key, so the second caller gets the first
   * one's promise. It is read here because the FIRST DAY screen below has to
   * know about it, and a component that decides its own visibility cannot tell
   * its parent what it decided.
   */
  const { data: contestMoney } = useContestEarnings();

  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'pipeline' ? 'pipeline' : 'overview';
  const setView = (next: View) => {
    const p = new URLSearchParams();
    if (next !== 'overview') p.set('view', next);
    setParams(p, { replace: true });
  };

  /** Earliest in the pipeline first, so the thing needing attention leads. */
  const work = useMemo(() => {
    const approved = (rows ?? []).filter((r) => r.status === 'approved');
    return approved.sort(
      (a, b) =>
        stageIndex(a.stage ?? 'pending_request') - stageIndex(b.stage ?? 'pending_request')
    );
  }, [rows]);

  const pending = useMemo(
    () => (rows ?? []).filter((r) => r.status === 'pending' || r.status === 'rejected'),
    [rows]
  );

  if (isLoading) return <Skeleton />;

  /*
   * A CREATOR WITH MONEY IS NOT ON THEIR FIRST DAY, and until 2026-08-14 this
   * line said they were.
   *
   * `nothingYet` used to ask only about OFFER work, which was complete while
   * offers were the only way to earn anything. Contests are open to every
   * approved creator regardless of which brands they work with, so somebody can
   * enter one, hit a target, be owed real money, and land on a screen telling
   * them to go and take their first offer. The money card underneath will read
   * zero, which is true of their offer work, and the contest block beside it
   * carries what they have actually earned.
   */
  const hasContestMoney = (contestMoney ?? []).some((r) => r.owed > 0 || r.paid > 0);
  const noOfferWork = summary.approved === 0 && summary.waiting === 0;
  const nothingYet = noOfferWork && !hasContestMoney;

  const showSwitch = !nothingYet && !noOfferWork;

  return (
    /*
     * THE MONEY JOURNEY IS THE SPINE, 2026-10-09. Rashid asked for an entirely new
     * way to present the data: one line that money travels along, with the jobs
     * sitting at whichever stop they have reached.
     *
     * What this replaced: seven figures on screen with four of them zero, a
     * greeting and a sentence describing the page that cost ~270px before the
     * first number, and a money bar that rendered solid and full-width while $0
     * of $400 was actually paid. See `Journey` for how each is answered.
     */
    <div className="wx-pop mx-auto flex w-full max-w-[1400px] flex-col gap-3.5">
      <Header
        name={name}
        tier={tier}
        handle={handle}
        trailing={showSwitch ? <ViewSwitch view={view} onChange={setView} /> : null}
      />

      {nothingYet ? (
        <Suspense fallback={<div className="wx-skeleton h-[420px] rounded-xl" />}>
          <FirstDay />
        </Suspense>
      ) : noOfferWork ? (
        /*
         * CONTEST MONEY, BUT NO OFFER WORK AT ALL. Contests are open to every
         * approved creator regardless of which brands they work with, so this is
         * a real person, not an edge case. The journey is NOT drawn for them:
         * there are no jobs to put on it. Their money leads and the first day
         * panel does its real job, getting them onto an offer.
         */
        <>
          <ContestEarnings />
          <Suspense fallback={<div className="wx-skeleton h-[420px] rounded-xl" />}>
            <FirstDay />
          </Suspense>
        </>
      ) : view === 'pipeline' ? (
        <>
          <PipelineBoard summary={summary} rows={work} moved={moved} progress={progress} />

          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] items-start gap-3.5">
            <MoneySplit summary={summary} moved={moved} />
            <Activity rows={rows ?? []} events={events ?? []} moved={moved} compact />
          </div>

          {/* Its own row rather than a third cell in that grid: contest money is
              a separate pot and must never sit in a layout that reads as part of
              the offer money beside it. See rule M10. */}
          <ContestEarnings />
        </>
      ) : (
        <>
          <Journey summary={summary} rows={work} moved={moved} progress={progress} />

          {/* Right under the journey, so the next action is one glance from the
              line it belongs to. */}
          <Jobs rows={work} pending={pending} moved={moved} progress={progress} />

          {/* Its own card, never inside the journey: the journey adds its stops up
              to its own headline, which is what lets a creator check our
              arithmetic, and a contest reward in there would break the sum. */}
          <ContestEarnings />

          {/* The only part of Home that has a time axis, so the only part that
              owns a date range. See AdNumbers. */}
          <AdNumbers />

          <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Counts summary={summary} work={work} pending={pending} />
            </div>
            <div className="lg:col-span-7">
              <Activity rows={rows ?? []} events={events ?? []} moved={moved} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- views --- */

/**
 * Two ways to read the same money.
 *
 * Overview answers "have I been paid and what is coming". Pipeline answers
 * "what is sitting where", which is the question once three jobs are in flight
 * and one has gone quiet. Both were designed; picking one for everybody would
 * have thrown away half of what the design says.
 *
 * The choice lives in the URL so a refresh keeps it, matching how every filter
 * in this product behaves.
 */
const VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pipeline', label: 'Pipeline' },
] as const;

type View = (typeof VIEWS)[number]['key'];

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div
      role="tablist"
      aria-label="How to read your work"
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

/* --------------------------------------------------------------- header -- */

/**
 * ONE COMPACT ROW, 2026-10-09. The eyebrow, the 2.5rem greeting and the sentence
 * describing the page used to cost roughly 270px before a single number. A
 * greeting is a courtesy, not content, so it is one line and the journey starts
 * directly beneath it. An h2, not an h1: the top bar owns the page's only one.
 */
function Header({
  name,
  tier,
  handle,
  trailing,
}: {
  name: string;
  tier: string | null;
  handle: string | null;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-0.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* The one thing on the page allowed to move forever. It is telling the
            truth: the websocket is open and this screen is current. */}
        <span aria-hidden className="wx-blink bg-stage-paid size-1.5 shrink-0 rounded-full" />
        <h2 className="font-brand truncate text-[1.25rem] leading-tight font-semibold tracking-[-0.01em]">
          {greet(name)}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tier ? (
          <span className="wx-neo-raised-sm rounded-full px-3 py-1.5 text-[0.75rem] font-semibold tracking-[0.02em] capitalize">
            {tier} creator
          </span>
        ) : null}
        {handle ? (
          <span className="wx-neo-raised-sm text-muted wx-numeric max-w-[12rem] truncate rounded-full px-3 py-1.5 text-[0.75rem]">
            @{handle}
          </span>
        ) : null}
        {trailing}
      </div>
    </div>
  );
}

type Moved = { ids: Set<string>; key: number };

/* ------------------------------------------------------------- journey --- */

/**
 * FOUR STOPS ON ONE LINE: agreed, filming, approved, paid.
 *
 * The seven pipeline stages fold onto four stops, and each stage lands on
 * exactly one, so the amounts sitting on the stops always add up to the headline
 * (and to the three buckets `summarise` reports). A stop shows the money that is
 * SITTING THERE NOW, not money that has passed through it, which is why a job
 * that is filming does not also appear under "agreed".
 *
 *   agreed    pending_request, sample_requested, sample_shipped (being set up)
 *   filming   content_pending, content_completed
 *   approved  payment_pending (approved, money on its way)
 *   paid      paid
 */
const STOPS = [
  { key: 'agreed', label: 'Agreed', hint: 'being set up', tone: BUCKET_TONE.working },
  { key: 'filming', label: 'Filming', hint: 'being made', tone: BUCKET_TONE.working },
  { key: 'approved', label: 'Approved', hint: 'money on its way', tone: BUCKET_TONE.due },
  { key: 'paid', label: 'Paid', hint: 'in your account', tone: BUCKET_TONE.paid },
] as const;

function stopOf(stage: OfferStage): number {
  const i = stageIndex(stage);
  return i < 3 ? 0 : i < 5 ? 1 : i === 5 ? 2 : 3;
}

const jobsWord = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;

function Journey({
  summary,
  rows,
  moved,
  progress,
}: {
  summary: WorkSummary;
  /** Approved work, already sorted. */
  rows: MyWorkRow[];
  moved: Moved;
  progress: Map<string, JobProgress> | undefined;
}) {
  const { paid, total, currency } = summary.money;
  /* One stop open at a time: two lists open at once is the wall the timeline's
     eight-row cap was written against. */
  const [openStop, setOpenStop] = useState<number | null>(null);
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency);

  const stops = useMemo(
    () =>
      STOPS.map((s, i) => {
        const jobs = rows.filter((r) => stopOf(r.stage ?? 'pending_request') === i);
        const amount = jobs.reduce((n, r) => n + (Number(r.committed_amount ?? 0) || 0), 0);
        const unpriced = jobs.some((r) => r.committed_amount === null);
        return { ...s, jobs, amount, unpriced };
      }),
    [rows]
  );

  /* How far the furthest job has got. The line fills up to there and no further,
     so it can never read as complete while the money has not moved. */
  const furthest = stops.reduce((at, s, i) => (s.jobs.length > 0 ? i : at), -1);

  /* "0 of 10" under Filming: videos approved against videos agreed, over the
     jobs that are actually at that stop. */
  const videos = useMemo(() => {
    let done = 0;
    let need = 0;
    for (const r of stops[1]?.jobs ?? []) {
      const p = progress?.get(r.id);
      if (p && p.required !== null) {
        done += p.approved;
        need += p.required;
      }
    }
    return need > 0 ? { done, need } : null;
  }, [stops, progress]);

  /* Stops with jobs get twice the room of empty ones. Empty stops stay on the
     line as a thin marker; this is layout only, every figure is still printed. */
  const cols = stops
    .map((s) => (s.jobs.length > 0 ? 'minmax(0,2fr)' : 'minmax(0,1fr)'))
    .join(' ');
  const open = openStop === null ? null : stops[openStop];

  return (
    /*
     * A TILT CARD. `overflow-hidden` is deliberately absent: any overflow other
     * than visible flattens `preserve-3d`, which would put the headline back on
     * the card's own plane. Only the two headline figures are lifted; the line
     * and its labels stay flat so they stay sharp.
     */
    <TiltCard
      as="section"
      className="wx-neo-raised flex flex-col gap-5 rounded-2xl p-[clamp(1.125rem,2vw,1.5rem)]"
    >
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Agreed with you
          </p>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <TiltLift>
              <span
                key={`total-${moved.key}`}
                className={cn(
                  'font-brand block text-[clamp(2.375rem,7vw,3.625rem)] leading-none font-semibold tracking-[-0.03em]',
                  moved.ids.size > 0 && 'wx-bump'
                )}
              >
                {fmt(total)}
              </span>
            </TiltLift>
            <span className="text-muted text-[0.8125rem]">
              across {jobsWord(summary.approved)}
            </span>
          </div>
        </div>

        <div className="wx-neo-inset flex flex-col gap-0.5 rounded-xl px-4 py-2.5 sm:text-right">
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            In your account
          </p>
          <TiltLift depth={14}>
            <span
              key={`paid-${moved.key}`}
              className={cn(
                'font-display wx-numeric text-stage-paid block text-[clamp(1.375rem,3vw,1.75rem)] leading-none font-semibold',
                moved.ids.size > 0 && 'wx-bump'
              )}
            >
              {fmt(paid)}
            </span>
          </TiltLift>
          {/* The honest version of the old bar: how much of the deal has landed. */}
          <p className="text-muted wx-numeric text-[0.75rem]">
            {fmt(paid)} of {fmt(total)} paid
          </p>
        </div>
      </div>

      {/*
        THE LINE. Vertical on a phone, where four columns would be ~80px each;
        horizontal from `sm`. The same markup does both: the connector is
        positioned per breakpoint and the column widths come from `--cols`.
      */}
      <ol
        aria-label="Where your money is"
        style={{ '--cols': cols } as CSSProperties}
        className="relative grid grid-cols-1 sm:[grid-template-columns:var(--cols)]"
      >
        {stops.map((s, i) => {
          const reached = i <= furthest;
          const here = i === furthest;
          const has = s.jobs.length > 0;
          const isOpen = openStop === i;
          return (
            <li
              key={s.key}
              className="relative grid grid-cols-[1.5rem_1fr] gap-x-3 pb-4 last:pb-0 sm:grid-cols-1 sm:gap-y-2 sm:pr-3 sm:pb-0"
            >
              {i < stops.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-6 bottom-0 left-[0.6875rem] w-0.5 rounded-full sm:top-[0.6875rem] sm:right-0 sm:bottom-auto sm:left-6 sm:h-0.5 sm:w-auto',
                    i < furthest ? 'bg-accent' : 'bg-line'
                  )}
                />
              ) : null}

              <span
                aria-hidden
                className={cn(
                  'relative z-10 grid size-6 shrink-0 place-items-center rounded-full',
                  reached ? 'bg-accent text-on-accent' : 'wx-neo-inset',
                  here && 'ring-accent/40 ring-4'
                )}
              >
                {reached ? (
                  <Check size={14} />
                ) : (
                  <span className="bg-line-strong size-2 rounded-full" />
                )}
              </span>

              {has ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls="journey-drill"
                  onClick={() => setOpenStop(isOpen ? null : i)}
                  className="focus-visible:ring-accent flex min-h-11 w-full min-w-0 flex-col gap-0.5 rounded-lg p-1 text-left focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      'flex items-center gap-1 text-[0.6875rem] font-semibold tracking-[0.1em] uppercase',
                      s.tone.text
                    )}
                  >
                    {s.label}
                    <ChevronDown
                      size={12}
                      aria-hidden
                      className={cn(
                        'shrink-0 transition-transform duration-200',
                        isOpen && 'rotate-180'
                      )}
                    />
                  </span>
                  <span
                    key={`${s.key}-${moved.key}`}
                    className={cn(
                      'font-brand wx-numeric text-[1.375rem] leading-none font-semibold',
                      moved.ids.size > 0 && 'wx-bump'
                    )}
                  >
                    {fmt(s.amount)}
                  </span>
                  <span className="text-muted text-[0.75rem] leading-[1.35]">
                    {jobsWord(s.jobs.length)}, {s.hint}
                    {s.unpriced ? ', fee to confirm' : ''}
                  </span>
                  {s.key === 'filming' && videos ? (
                    <span className="wx-numeric text-[0.8125rem] font-semibold">
                      {videos.done} of {videos.need} videos approved
                    </span>
                  ) : null}
                </button>
              ) : (
                /* An empty stop is a marker, not a card. It still says what it
                   holds, which is nothing, so no figure is hidden. */
                <div className="flex min-h-6 min-w-0 flex-col justify-center gap-0.5 p-1">
                  <span className="text-muted text-[0.6875rem] font-semibold tracking-[0.1em] uppercase">
                    {s.label}
                  </span>
                  <span className="text-muted wx-numeric text-[0.8125rem]">{fmt(0)} here</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {open ? (
        <div
          id="journey-drill"
          role="region"
          aria-label={`Jobs at ${open.label.toLowerCase()}`}
          className="wx-neo-inset wx-pop rounded-xl p-3"
        >
          <DrillRows
            empty="No jobs in here right now."
            items={open.jobs.map((r) => ({
              id: r.id,
              top: r.brand?.name ?? 'A brand',
              title: r.offer?.title ?? 'An offer',
              note: STAGE_META[r.stage ?? 'pending_request'].label,
              figure:
                r.committed_amount === null
                  ? 'To confirm'
                  : money(r.committed_amount, r.currency),
            }))}
          />
        </div>
      ) : null}
    </TiltCard>
  );
}

/**
 * The rows a disclosure opens onto.
 *
 * ONE LIST SHAPE FOR EVERY DRILL-DOWN on Home, so a job reads the same whether
 * it was reached from a money cell or from a count. Plain rows, no tilt: a list
 * where every row leans towards the cursor is noise.
 */
interface DrillItem {
  id: string;
  top: string;
  title: string;
  note?: string;
  figure?: string;
}

function DrillRows({ items, empty }: { items: DrillItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-muted py-1 text-[0.8125rem] leading-relaxed">{empty}</p>;
  }
  return (
    <ul className="flex flex-col">
      {items.map((it) => (
        <li
          key={it.id}
          className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-muted truncate text-[0.6875rem] font-semibold tracking-[0.1em] uppercase">
              {it.top}
            </p>
            <p className="text-[0.875rem] leading-[1.3] font-semibold break-words">
              {it.title}
            </p>
            {it.note ? <p className="text-muted text-[0.75rem]">{it.note}</p> : null}
          </div>
          {it.figure ? (
            <p className="wx-numeric shrink-0 text-[0.9375rem] font-semibold whitespace-nowrap">
              {it.figure}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- jobs --- */

/**
 * The jobs, each saying what happens next and where to do it.
 *
 * Sorted by the caller, earliest stage first. "10 videos, $40 each" is the
 * agreed amount divided by the agreed video count, both frozen at approval
 * (`committed_*`), never the offer's live values: re-scoping an offer does not
 * change a deal that is already under way.
 */
function Jobs({
  rows,
  pending,
  moved,
  progress,
}: {
  rows: MyWorkRow[];
  pending: MyWorkRow[];
  moved: Moved;
  progress: Map<string, JobProgress> | undefined;
}) {
  return (
    <section className="wx-neo-raised flex flex-col gap-3.5 rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Your jobs
        </h2>
        <p className="text-muted wx-numeric text-[0.8125rem]">{jobsWord(rows.length)}</p>
      </div>

      <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {rows.map((row) => {
          const stage = row.stage ?? 'pending_request';
          const at = stageIndex(stage);
          const tone = toneFor(stage);
          const justMoved = moved.ids.has(row.id);
          const p = progress?.get(row.id);
          const count = row.committed_video_count;
          const each =
            row.committed_amount !== null && count
              ? money(
                  Math.round((Number(row.committed_amount) / count) * 100) / 100,
                  row.currency
                )
              : null;
          const detail = [
            count ? `${count} ${count === 1 ? 'video' : 'videos'}` : null,
            each ? `${each} each` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          /* The one sentence of what to do. Filming outranks the stage's generic
             hint because it is the thing only this person can move. */
          const action =
            p && needsFilming(p) ? 'Film your next video' : STAGE_META[stage].creatorHint;

          return (
            <li
              key={`${row.id}-${moved.key}`}
              className={cn(
                'wx-neo-inset flex flex-col gap-2.5 rounded-xl p-3.5',
                justMoved && 'wx-flash'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-muted truncate text-[0.6875rem] font-semibold tracking-[0.1em] uppercase">
                    {row.brand?.name ?? 'A brand'}
                  </p>
                  <p className="text-[0.96875rem] leading-[1.25] font-semibold break-words">
                    {row.offer?.title ?? 'An offer'}
                  </p>
                  {detail ? <p className="text-muted text-[0.78125rem]">{detail}</p> : null}
                </div>
                <p className="font-display wx-numeric shrink-0 text-[1.375rem] leading-none font-semibold whitespace-nowrap">
                  {row.committed_amount === null
                    ? 'To confirm'
                    : money(row.committed_amount, row.currency)}
                </p>
              </div>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className={cn('text-[0.78125rem] font-semibold', tone.text)}>
                  {at + 1}. {STAGE_META[stage].label}
                </span>
                <span className="text-[0.78125rem] font-semibold">{action}</span>
                {justMoved ? (
                  <span className="text-stage-live text-[0.6875rem] font-semibold">
                    just now
                  </span>
                ) : null}
              </p>

              {/* How much they have filmed, and the way to add the next one. */}
              {p ? (
                <JobProgressBar
                  progress={p}
                  addVideoHref={`/app/content?job=${row.id}`}
                  className="border-line border-t pt-[11px]"
                  compact
                />
              ) : null}

              {p ? <PaceLine progress={p} since={row.decided_at ?? row.created_at} /> : null}
            </li>
          );
        })}
      </ul>

      {pending.length > 0 ? (
        <div className="border-line flex flex-col gap-2 border-t pt-3.5">
          {pending.map((row) => (
            <div key={row.id} className="wx-neo-inset flex flex-col gap-1 rounded-xl p-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-muted text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
                  {row.status === 'pending' ? 'Waiting on a decision' : 'Not accepted'}
                </span>
                <span className="text-[0.875rem] font-semibold">
                  {row.offer?.title ?? 'An offer'}
                </span>
                <span className="text-muted text-[0.8125rem]">{row.brand?.name}</span>
              </p>
              <p className="text-muted text-[0.78125rem] leading-[1.4]">
                {row.status === 'pending'
                  ? `Asked on ${dayMonth(row.created_at)}. We will tell you the moment there is an answer.`
                  : (row.decision_note ??
                    'This one went to somebody else. You can ask again any time.')}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * GOAL AND PACE, for a job with a number of videos attached.
 *
 * THE PLAN SAID "THE PACE NEEDED TO FINISH ON TIME", and nothing in the data
 * can answer that: an offer has no deadline, and neither does an application or
 * the `job_progress` view. A "needed pace" drawn against an invented date would
 * be a number we made up, on the screen whose whole point is that its numbers
 * are real. So this reports the pace the creator IS keeping and where that
 * lands, and leaves "needed" for the day a deadline exists.
 *
 * COUNTS APPROVED VIDEOS ONLY, the same rule `remaining` uses: a video still
 * with the team is not yet one of the five, so a projection built on it would
 * promise a finish nobody has agreed to.
 *
 * NOTHING UNTIL THREE DAYS IN. One approved video on day one projects as
 * "finished by Thursday" or "never", and both are noise.
 */
function PaceLine({ progress, since }: { progress: JobProgress; since: string }) {
  if (progress.required === null || progress.done) return null;

  const days = (Date.now() - Date.parse(since)) / 86_400_000;
  const toFilm = needsFilming(progress);

  let pace: string;
  if (progress.approved === 0) {
    pace =
      progress.waiting > 0 ? 'Your first video is with the team.' : 'No video approved yet.';
  } else if (!(days >= 3)) {
    return null;
  } else {
    const perDay = progress.approved / days;
    const left = (progress.remaining ?? 0) / perDay;
    const perWeek = Math.round(perDay * 7 * 10) / 10;
    pace =
      left > 365
        ? `${perWeek} a week so far: at that pace this takes over a year.`
        : `${perWeek} a week so far: at that pace the last one is approved around ${new Date(
            Date.now() + left * 86_400_000
          ).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`;
  }

  return (
    <p className="text-muted text-[0.78125rem] leading-[1.4]">
      <span className="text-text font-semibold">Pace </span>
      {pace}
      {toFilm ? ` ${progress.remaining! - progress.waiting} still to film.` : ''}
    </p>
  );
}

/* ------------------------------------------------------------ activity --- */

function Activity({
  rows,
  events,
  moved,
  compact = false,
}: {
  rows: MyWorkRow[];
  events: StageEvent[];
  moved: Moved;
  /**
   * Pipeline drops the coloured dot column. The board beside it already says
   * which bucket everything is in, in colour, seven times over, so repeating it
   * per row is noise rather than information.
   */
  compact?: boolean;
}) {
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Only the NEWEST event for a piece of work that just moved says "just now".
  // Events arrive newest first, so the first one wins and the rest keep their
  // date, which is what actually happened.
  const claimed = new Set<string>();

  return (
    <section className="wx-neo-raised flex h-full flex-col gap-3.5 rounded-2xl p-4">
      <h2 className="text-muted flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        <span aria-hidden className="wx-blink bg-stage-paid size-1.5 rounded-full" />
        Everything that moved
      </h2>

      {events.length === 0 ? (
        <p className="text-muted py-2 text-[0.8125rem] leading-relaxed">
          Nothing has moved yet. Every step the team takes on your work lands here as it
          happens.
        </p>
      ) : (
        /*
         * A TIMELINE, not a list of rows in a box. Rashid: "The timeline should
         * feel integrated into the card rather than like a list pasted into a
         * box."
         *
         * The rail is drawn by each row rather than as one absolute line down
         * the section, so it cannot drift out of step with the dots when a row
         * wraps to two lines or three. Every row paints its own segment and the
         * last one stops short, which is what makes the sequence read as having
         * an end rather than running off the bottom edge.
         *
         * THE BORDERS BETWEEN ROWS ARE GONE. With a rail joining the dots, a
         * horizontal rule through every row cut the very line that was meant to
         * connect them.
         */
        <ol className="flex flex-col">
          {events.map((event, i) => {
            const row = byId.get(event.application_id);
            const tone = toneFor(event.to_stage);
            const fresh =
              moved.ids.has(event.application_id) && !claimed.has(event.application_id);
            if (fresh) claimed.add(event.application_id);
            const last = i === events.length - 1;

            return (
              <li
                key={`${event.id}-${moved.key}`}
                className={cn(
                  'group grid gap-3',
                  compact
                    ? 'grid-cols-[1fr_auto] py-2.5'
                    : 'grid-cols-[0.875rem_1fr_auto] pb-4',
                  fresh && 'wx-pop'
                )}
              >
                {compact ? null : (
                  /* The dot and its segment of rail, as one column. */
                  <span className="flex flex-col items-center gap-1 pt-1">
                    <span
                      aria-hidden
                      className={cn(
                        'ring-surface-1 size-2 shrink-0 rounded-full ring-2',
                        tone.dot
                      )}
                    />
                    {last ? null : <span aria-hidden className="bg-line w-px flex-1" />}
                  </span>
                )}

                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-[0.875rem] leading-[1.3] font-semibold">
                    {STAGE_META[event.to_stage].label}
                  </p>
                  <p className="text-muted text-[0.78125rem] leading-[1.35]">
                    {row?.brand?.name ? `${row.brand.name}, ` : ''}
                    {row?.offer?.title ?? 'an offer'}
                  </p>
                  {event.note ? (
                    <p className="text-stage-live text-[0.78125rem] leading-[1.35]">
                      {event.note}
                    </p>
                  ) : null}
                </div>

                <time
                  dateTime={event.created_at}
                  className="text-muted pt-0.5 text-[0.75rem] whitespace-nowrap"
                >
                  {fresh ? 'just now' : dayMonth(event.created_at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/* -------------------------------------------------------------- counts --- */

/**
 * THE KPI BAND.
 *
 * Rashid: "Instead of four tiny disconnected boxes, make them feel like a
 * single coordinated component." They were in the right-hand column under the
 * timeline, taking whatever width was left; now they are four equal columns of
 * the page grid, directly under the money.
 *
 * AN ICON EACH, in a tinted well, because four bare numerals in a row are hard
 * to tell apart at a glance and the brief asked for icon / number / label. The
 * icons repeat ones already used elsewhere for the same ideas rather than
 * introducing a second vocabulary.
 *
 * THESE ONES DO LIFT, because every one of them is a link that goes somewhere.
 *
 * TWO COLUMNS ON A PHONE, not one. Four full-width rows pushed the work list
 * below the fold on a 375px screen, and these are a glance, not the point of
 * the page.
 */
function Counts({
  summary,
  work,
  pending,
}: {
  summary: WorkSummary;
  work: MyWorkRow[];
  pending: MyWorkRow[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  /* What each count is made of, built from rows already in memory. */
  const drill = (key: string): DrillItem[] => {
    const ask = (r: MyWorkRow): DrillItem => ({
      id: r.id,
      top: r.brand?.name ?? 'A brand',
      title: r.offer?.title ?? 'An offer',
      note:
        r.status === 'approved'
          ? STAGE_META[r.stage ?? 'pending_request'].label
          : `Asked on ${dayMonth(r.created_at)}`,
    });
    if (key === 'offers') return work.map(ask);
    if (key === 'waiting') return pending.filter((r) => r.status === 'pending').map(ask);
    if (key === 'declined') return pending.filter((r) => r.status === 'rejected').map(ask);
    const byBrand = new Map<string, DrillItem & { n: number }>();
    for (const r of work) {
      const had = byBrand.get(r.brand_id);
      if (had) had.n += 1;
      else
        byBrand.set(r.brand_id, {
          id: r.brand_id,
          top: 'Brand',
          title: r.brand?.name ?? 'A brand',
          n: 1,
        });
    }
    return [...byBrand.values()].map(({ n, ...b }) => ({
      ...b,
      note: `${n} ${n === 1 ? 'job' : 'jobs'}`,
    }));
  };

  const items = [
    {
      key: 'offers',
      empty: 'You are not on any offers yet.',
      n: summary.approved,
      label: 'offers you are on',
      to: '/app/offers?tab=in',
      icon: Briefcase,
      tone: 'text-stage-live',
    },
    {
      key: 'brands',
      empty: 'No brands yet.',
      n: summary.brands,
      label: 'brands you work with',
      to: '/app/brands',
      icon: Store,
      tone: 'text-accent',
    },
    {
      key: 'waiting',
      empty: 'Nothing is waiting on a decision.',
      n: summary.waiting,
      label: 'waiting on a decision',
      to: '/app/offers',
      icon: Clock,
      tone: 'text-stage-due',
    },
    {
      key: 'declined',
      empty: 'Nothing has been turned down.',
      n: summary.declined,
      label: 'not accepted',
      to: '/app/offers',
      icon: X,
      tone: 'text-muted',
    },
  ];

  return (
    /*
     * ONE CARD, FOUR CELLS, 2026-10-08 (second pass).
     *
     * They were four separate cards and that was wrong twice over.
     *
     * THE GRID. Four equal cards put vertical edges at 25, 50 and 75 percent
     * while the row beneath them splits seven-five at about 58. Nothing lined
     * up between the two bands, which is the "shared grid columns" requirement
     * broken in the most visible way there is. As one card the band has no
     * internal edges to disagree with anything, and the seven-five split below
     * is free to be what the content needs.
     *
     * THE RECTANGLES. The brief asked for these to stop reading as "four tiny
     * disconnected boxes" and four cards with four gaps between them is exactly
     * that, whatever is drawn inside them. Hairlines rather than gaps: the same
     * four facts, one object.
     *
     * 2026-10-09: the cells used to be links. Each is now a disclosure that opens
     * what the count is made of, in place, and the old destination is a link at
     * the foot of what it opens, so nothing became harder to reach. The whole
     * band is one TiltCard and only the four figures are lifted; the lists that
     * open are flat text and would be harder to read on a moving plane.
     *
     * No `overflow-hidden` any more: it flattens `preserve-3d`, which is what
     * the lifted figures stand on.
     */
    <TiltCard className="wx-neo-raised rounded-2xl">
      <ul className="grid grid-cols-2">
        {items.map((item, i) => {
          const Icon = item.icon;
          const isOpen = open === item.key;
          return (
            <li
              key={item.key}
              className={cn(
                'border-line relative',
                /* Two columns on a phone, four from lg: the dividers have to
                 follow, or they cut the band in the wrong places. */
                i % 2 === 1 && 'border-l',
                i >= 2 && 'border-t'
              )}
            >
              <div className="flex h-full items-center gap-3 p-4">
                <span
                  aria-hidden
                  className="wx-neo-inset grid size-9 shrink-0 place-items-center rounded-lg"
                >
                  <Icon size={16} className={item.tone} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  {/* Clicks pass through the lifted figure to the toggle's
                      stretched hit area below; a lifted plane would otherwise
                      swallow them. */}
                  <TiltLift className="pointer-events-none" depth={16}>
                    <span className="font-brand wx-numeric block text-[1.625rem] leading-none font-semibold">
                      {item.n}
                    </span>
                  </TiltLift>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls="counts-drill"
                    onClick={() => setOpen(isOpen ? null : item.key)}
                    className="text-muted focus-visible:after:ring-accent flex min-h-11 items-center gap-1 text-left text-[0.75rem] leading-[1.3] after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2"
                  >
                    {item.label}
                    <ChevronDown
                      size={12}
                      aria-hidden
                      className={cn(
                        'shrink-0 transition-transform duration-200',
                        isOpen && 'rotate-180'
                      )}
                    />
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {open ? (
        <div
          id="counts-drill"
          role="region"
          aria-label={items.find((x) => x.key === open)?.label}
          className="border-line wx-pop flex flex-col gap-3 border-t p-4"
        >
          <DrillRows
            items={drill(open)}
            empty={items.find((x) => x.key === open)?.empty ?? ''}
          />
          <Link
            to={items.find((x) => x.key === open)?.to ?? '/app/offers'}
            className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center self-start rounded-md text-[0.8125rem] font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Open the full list
          </Link>
        </div>
      ) : null}
    </TiltCard>
  );
}

/* ------------------------------------------------------------ ad numbers -- */

const DAY_MS = 86_400_000;
const spanDays = (r: DateRange) =>
  Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / DAY_MS) +
  1;

/**
 * THE WINDOW IMMEDIATELY BEFORE THIS ONE, the same number of days long.
 *
 * Built from `addDays` in date-range.ts, which is UTC throughout, so a window
 * can never be a day out for a creator east of Greenwich. A range that is itself
 * partial (this month, nine days in) is not a special case: the previous window
 * is nine days too, so the two are always like for like.
 */
function previousWindow(r: DateRange): DateRange {
  const n = spanDays(r);
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

type Delta = { kind: 'pct'; pct: number } | { kind: 'new' } | null;

/**
 * A change, or the honest absence of one.
 *
 * Previous zero and current positive is "new", never an infinite percentage.
 * Both zero says nothing at all: "0% vs last month" on a figure that has never
 * moved is a sentence with no information in it. Compared at cent precision, so
 * float dust in a sum cannot turn nothing into "+0.00001%".
 */
function deltaOf(cur: number | null, prev: number | null): Delta {
  if (cur === null || prev === null) return null;
  const c = Math.round(cur * 100) / 100;
  const p = Math.round(prev * 100) / 100;
  if (p === 0) return c === 0 ? null : { kind: 'new' };
  return { kind: 'pct', pct: ((c - p) / p) * 100 };
}

function sumDaily(rows: DailyPerformance[]) {
  let cost = 0;
  let revenue = 0;
  let orders = 0;
  for (const r of rows) {
    cost += Number(r.cost);
    revenue += Number(r.gross_revenue);
    orders += Number(r.orders);
  }
  return { cost, revenue, orders, roi: cost > 0 ? revenue / cost : null };
}

/**
 * THE ONE PART OF HOME WITH A TIME AXIS.
 *
 * The money and the counts above and below are STATE: what is agreed, paid or
 * waiting right now. They have no "last 30 days" to be compared with, so the
 * range deliberately does not touch them. These four figures come from the same
 * daily ad rows My numbers reads, which is where a range means something.
 *
 * NO NEW QUERY SHAPE. `creator_daily_performance` already aggregates to one row
 * per day in SQL and takes `p_from`/`p_to`, so the previous period is the same
 * call with the window before. The browser only adds up one row per day (a few
 * dozen, a few hundred at most) rather than fetching videos and reducing them,
 * and the sparkline is those same rows. Both calls carry the hook's five minute
 * `staleTime`: the data changes once a night.
 */
function AdNumbers() {
  const windowQ = usePerformanceWindow();
  const [preset, setPreset] = useState<PresetKey>('30');
  const [custom, setCustom] = useState<DateRange | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const range = useMemo<DateRange | null>(
    () =>
      preset === 'custom'
        ? clamp(custom ?? { from: '', to: '' }, windowQ.data)
        : presetToRange(preset, windowQ.data),
    [preset, custom, windowQ.data]
  );

  /*
   * PREVIOUS PERIOD, and how much of it exists. The window can reach back past
   * the creator's first video, where there is no data to be compared with:
   *  - wholly before it: no comparison at all ("All time" lands here, correctly);
   *  - partly before it: compared PER DAY over the days that do exist. Comparing
   *    30 days against 12 would call every creator's second month a triumph.
   */
  const floor = windowQ.data?.earliest ?? null;
  const prev = useMemo(() => {
    if (!range || !floor) return null;
    const w = previousWindow(range);
    if (w.to < floor) return null;
    const from = w.from < floor ? floor : w.from;
    return { range: w, covered: spanDays({ from, to: w.to }), full: spanDays(w) };
  }, [range, floor]);

  const curQ = useDailyPerformance(range?.from ?? null, range?.to ?? null);
  const prevQ = useDailyPerformance(prev?.range.from ?? null, prev?.range.to ?? null);
  /* Only fetched once somebody opens a card. */
  const brandsQ = useBrandPerformance(open ? (range?.from ?? null) : null, range?.to ?? null);

  const cur = useMemo(() => sumDaily(curQ.data ?? []), [curQ.data]);
  const before = useMemo(() => {
    if (!prev || !prevQ.data) return null;
    const s = sumDaily(prevQ.data);
    /* Scaled up to the current length when only part of it is on record. */
    const k = spanDays(range!) / prev.covered;
    return prev.covered === prev.full
      ? s
      : { ...s, cost: s.cost * k, revenue: s.revenue * k, orders: s.orders * k };
  }, [prev, prevQ.data, range]);

  /* Nothing to say for a creator with no ad data at all. */
  if (windowQ.isPending) return <div className="wx-skeleton h-36 rounded-xl" />;
  if (!range || !windowQ.data || windowQ.data.videos === 0) return null;

  const rows = curQ.data ?? [];
  const currency = rows.find((r) => r.currency)?.currency ?? null;
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency ?? 'USD');
  const partial = Boolean(prev && prev.covered < prev.full);
  const days = spanDays(range);
  const vs = prev
    ? partial
      ? `vs the ${prev.covered} days before, per day`
      : `vs previous ${days} ${days === 1 ? 'day' : 'days'}`
    : null;

  const kpis: KpiProps[] = [
    {
      id: 'gmv',
      label: 'GMV',
      value: fmt(cur.revenue),
      delta: deltaOf(cur.revenue, before?.revenue ?? null),
      series: rows.map((r) => Number(r.gross_revenue)),
      spark: 'text-accent',
      good: 'up',
      metric: (b) => fmt(Number(b.gmv)),
    },
    {
      id: 'spend',
      label: 'Ad spend',
      value: fmt(cur.cost),
      delta: deltaOf(cur.cost, before?.cost ?? null),
      series: rows.map((r) => Number(r.cost)),
      spark: 'text-muted',
      /* More spend is neither good nor bad on its own, so it is never coloured
         as if it were. */
      good: 'neutral',
      metric: (b) => fmt(Number(b.spend)),
    },
    {
      id: 'orders',
      label: 'Orders',
      value: String(cur.orders),
      delta: deltaOf(cur.orders, before?.orders ?? null),
      series: rows.map((r) => Number(r.orders)),
      spark: 'text-muted',
      good: 'up',
      metric: (b) => String(b.orders),
    },
    {
      id: 'roi',
      label: 'ROI',
      value: cur.roi === null ? '-' : `${cur.roi.toFixed(2)}x`,
      delta: deltaOf(cur.roi, before?.roi ?? null),
      series: rows.map((r) =>
        Number(r.cost) > 0 ? Number(r.gross_revenue) / Number(r.cost) : 0
      ),
      spark: 'text-muted',
      good: 'up',
      metric: (b) => (b.roi === null ? '-' : `${Number(b.roi).toFixed(2)}x`),
    },
  ];

  return (
    <section aria-label="Your ad numbers" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Your ad numbers
        </h2>
        <DateRangePicker
          preset={preset}
          range={range}
          window={windowQ.data}
          onChange={(p, r) => {
            setPreset(p);
            setCustom(p === 'custom' ? r : null);
            setOpen(null);
          }}
        />
      </div>

      {curQ.isPending ? (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="wx-skeleton h-32 rounded-xl" />
          ))}
        </div>
      ) : curQ.isError ? (
        <p className="text-muted wx-neo-inset rounded-xl p-4 text-[0.8125rem]">
          We could not load your ad numbers just now. Refresh in a moment.
        </p>
      ) : (
        <div className="grid grid-cols-2 items-start gap-3.5 lg:grid-cols-4">
          {kpis.map((k) => (
            <Kpi
              key={k.id}
              {...k}
              vs={vs}
              open={open === k.id}
              onToggle={() => setOpen(open === k.id ? null : k.id)}
              brands={brandsQ.data}
              brandsPending={brandsQ.isFetching && !brandsQ.data}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface KpiProps {
  id: string;
  label: string;
  value: string;
  delta: Delta;
  series: number[];
  spark: string;
  /** Which direction is good news, or neither. Decides the delta's colour. */
  good: 'up' | 'neutral';
  /** How a brand row shows this metric. */
  metric: (b: BrandPerformance) => string;
}

function Kpi({
  id: kpiId,
  label,
  value,
  delta,
  vs,
  series,
  spark,
  good,
  metric,
  open,
  onToggle,
  brands,
  brandsPending,
}: KpiProps & {
  vs: string | null;
  open: boolean;
  onToggle: () => void;
  brands: BrandPerformance[] | undefined;
  brandsPending: boolean;
}) {
  const id = `kpi-${kpiId}`;
  return (
    <TiltCard className="wx-neo-raised rounded-xl">
      <div className="relative flex flex-col gap-1.5 p-4">
        {/* The toggle is the label; its hit area is stretched over the card so
            the whole KPI is clickable while the control stays a real button
            with a real name. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="text-muted focus-visible:after:ring-accent flex min-h-11 items-center justify-between gap-2 text-left text-[0.6875rem] font-semibold tracking-[0.12em] uppercase after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2"
        >
          <span>
            {label}
            <span className="sr-only">, see which brands it came from</span>
          </span>
          <ChevronDown
            size={14}
            aria-hidden
            className={cn('shrink-0 transition-transform duration-200', open && 'rotate-180')}
          />
        </button>

        <TiltLift className="pointer-events-none">
          <p className="font-display wx-numeric text-[clamp(1.25rem,2.4vw,1.625rem)] leading-none font-bold break-words">
            {value}
          </p>
        </TiltLift>

        <DeltaLine delta={delta} vs={vs} good={good} />
        <Spark values={series} className={spark} />
      </div>

      {open ? (
        <div
          id={id}
          role="region"
          aria-label={`${label} by brand`}
          className="border-line wx-pop border-t p-4"
        >
          {brandsPending ? (
            <div className="wx-skeleton h-12 rounded-md" />
          ) : !brands || brands.length === 0 ? (
            <p className="text-muted text-[0.8125rem] leading-relaxed">
              Nothing to split by brand in this period.
            </p>
          ) : (
            <DrillRows
              empty=""
              items={brands.map((b) => ({
                id: b.brand_id ?? 'unmatched',
                top: 'Brand',
                title: b.brand_name ?? 'Not matched to a brand',
                figure: metric(b),
              }))}
            />
          )}
        </div>
      ) : null}
    </TiltCard>
  );
}

/** "+24% vs previous 30 days", or "new", or nothing. Never colour alone. */
function DeltaLine({
  delta,
  vs,
  good,
}: {
  delta: Delta;
  vs: string | null;
  good: 'up' | 'neutral';
}) {
  if (!delta || !vs) return null;

  if (delta.kind === 'new') {
    return (
      <p className="text-muted flex flex-wrap items-center gap-x-1.5 text-[0.75rem] leading-[1.3]">
        <span className="text-accent font-semibold">New</span>
        <span>{vs}</span>
      </p>
    );
  }

  const rounded = Math.round(delta.pct);
  const up = rounded > 0;
  const flat = rounded === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const tone = flat || good === 'neutral' ? 'text-muted' : up ? 'text-success' : 'text-danger';
  const shown = Math.min(Math.abs(rounded), 999);

  return (
    <p className="text-muted flex flex-wrap items-center gap-x-1.5 text-[0.75rem] leading-[1.3]">
      <span className={cn('wx-numeric inline-flex items-center gap-1 font-semibold', tone)}>
        <Icon size={12} aria-hidden />
        <span className="sr-only">{flat ? 'No change' : up ? 'Up' : 'Down'}</span>
        {flat ? '0%' : `${up ? '+' : '-'}${shown}%${Math.abs(rounded) > 999 ? '+' : ''}`}
      </span>
      <span>{vs}</span>
    </p>
  );
}

/**
 * THE SHAPE OF A FIGURE OVER THE CHOSEN RANGE.
 *
 * Hand-drawn SVG rather than a piece of `PerformanceChart`: that component is a
 * full two-series chart with axes, a legend and a tooltip, and a 28px line has
 * none of those. `aria-hidden` because it is a hint at a trend and never the
 * only way to read a value; every number it draws is printed above it. The
 * stroke is `currentColor`, so the colour is whatever token the caller's text
 * class names, and it follows both themes.
 */
function Spark({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = span === 0 ? 14 : 25 - ((v - min) / span) * 22;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className={cn('mt-1 h-7 w-full overflow-visible', className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* -------------------------------------------------------------- waiting -- */

const STEPS = [
  { label: 'Applied', state: 'done' as const },
  { label: 'In review', state: 'now' as const },
  { label: 'Approved', state: 'next' as const },
];

function InReview({
  name,
  handle,
  appliedAt,
}: {
  name: string;
  handle: string;
  appliedAt: string;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center sm:py-12">
      {/* A slow double ring around a clock. It never stops, so the screen
          always looks alive rather than like a page that failed to load. */}
      <div className="relative grid size-28 place-items-center">
        {[0, 1].map((i) => (
          <m.span
            key={i}
            aria-hidden
            initial={{ scale: 0.6, opacity: 0.5 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 1.5,
              ease: 'easeOut',
            }}
            className="border-accent absolute inset-0 rounded-full border"
          />
        ))}
        <m.span
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          className="bg-accent-soft text-accent relative grid size-20 place-items-center rounded-full"
        >
          <Clock size={30} aria-hidden />
        </m.span>
      </div>

      <m.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 text-[clamp(1.6rem,5vw,2.25rem)] font-extrabold text-balance"
      >
        Thank you for joining{name ? `, ${name}` : ''}
      </m.h1>

      <m.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="text-muted mt-4 max-w-md leading-relaxed text-pretty"
      >
        Your application is with our team. A real person reads every one, so it takes a little
        time rather than a moment.
      </m.p>

      {/* Where they are, at a glance. */}
      <m.ol
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-9 flex w-full max-w-sm items-start justify-between gap-2"
      >
        {STEPS.map((s, i) => (
          <li key={s.label} className="relative flex flex-1 flex-col items-center gap-2">
            {i > 0 ? (
              <span
                aria-hidden
                className={`absolute top-4 right-1/2 left-[-50%] h-px ${
                  s.state === 'next' ? 'bg-line' : 'bg-accent'
                }`}
              />
            ) : null}

            <span
              className={`relative grid size-8 place-items-center rounded-full text-[0.6875rem] ${
                s.state === 'done'
                  ? 'bg-accent text-on-accent'
                  : s.state === 'now'
                    ? 'bg-accent-soft text-accent'
                    : 'wx-neo-raised-sm text-faint'
              }`}
            >
              {s.state === 'done' ? (
                <Check size={14} aria-hidden />
              ) : s.state === 'now' ? (
                <m.span
                  aria-hidden
                  animate={{ opacity: [1, 0.25, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="bg-accent size-2 rounded-full"
                />
              ) : (
                <span aria-hidden className="bg-line-strong size-2 rounded-full" />
              )}
            </span>
            <span
              className={`font-mono text-[0.625rem] tracking-[0.12em] uppercase ${
                s.state === 'next' ? 'text-faint' : 'text-muted'
              }`}
            >
              {s.label}
            </span>
          </li>
        ))}
      </m.ol>

      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="wx-neo-raised mt-10 w-full rounded-2xl px-6 py-5 text-left"
      >
        <p className="text-faint font-mono text-[0.625rem] tracking-[0.14em] uppercase">
          Under review
        </p>
        <p className="mt-2 text-lg font-bold break-all">@{handle}</p>
        <p className="text-muted mt-1 text-[0.8125rem]">
          Applied{' '}
          {new Date(appliedAt).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <p className="border-line text-muted mt-4 flex items-start gap-2 border-t pt-4 text-[0.8125rem] leading-relaxed">
          <Sparkles size={15} aria-hidden className="text-accent mt-0.5 shrink-0" />
          Keep this page open if you like. The moment a decision is made it changes here on its
          own, with no refresh and no email needed.
        </p>
      </m.div>
    </div>
  );
}

/* ------------------------------------------------------------- rejected -- */

function Rejected({ note }: { note: string | null }) {
  return (
    <div className="mx-auto max-w-lg py-8 text-center sm:py-14">
      <span className="bg-danger-soft text-danger mx-auto grid size-16 place-items-center rounded-full">
        <X size={26} aria-hidden />
      </span>
      <h2 className="mt-6 text-[clamp(1.5rem,5vw,2rem)] font-extrabold">Not this time</h2>
      <p className="text-muted mt-4 leading-relaxed text-pretty">
        We are not able to take you on right now. This is usually about fit with the brands we
        are running, rather than the quality of your work, and it is not permanent.
      </p>
      {note ? (
        <p className="wx-neo-raised text-muted mt-6 rounded-2xl px-5 py-4 text-left text-[0.875rem] leading-relaxed">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------- unfinished -- */

function Unfinished() {
  return (
    <div className="mx-auto max-w-lg py-8 text-center sm:py-14">
      <h2 className="text-[clamp(1.5rem,5vw,2rem)] font-extrabold">Finish your application</h2>
      <p className="text-muted mt-4 leading-relaxed text-pretty">
        Your account is ready, but we do not have your application details yet. It takes about a
        minute.
      </p>
      <ButtonLink to="/apply" className="mt-6">
        Complete it now
      </ButtonLink>
    </div>
  );
}

/* ------------------------------------------------------------ skeletons -- */

function Skeleton() {
  return (
    <div className="flex max-w-[1140px] flex-col gap-[14px]">
      <div className="flex flex-col gap-2 px-0.5 py-1">
        <div className="wx-skeleton h-3.5 w-40" />
        <div className="wx-skeleton h-10 w-72 max-w-full" />
      </div>

      <div className="wx-neo-raised flex flex-col gap-[18px] rounded-xl p-[22px]">
        <div className="wx-skeleton h-3.5 w-[150px]" />
        <div className="wx-skeleton h-[46px] w-[210px]" />
        <div className="wx-skeleton h-4 w-full rounded-full" />
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="wx-skeleton h-[74px]" />
          ))}
        </div>
      </div>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-[14px]">
        <div className="wx-neo-raised flex flex-col gap-3.5 rounded-xl p-5">
          <div className="wx-skeleton h-3 w-28" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="wx-skeleton h-[58px]" />
          ))}
        </div>
        <div className="wx-neo-raised flex flex-col gap-3.5 rounded-xl p-5">
          <div className="wx-skeleton h-3 w-24" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="wx-skeleton h-[38px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
