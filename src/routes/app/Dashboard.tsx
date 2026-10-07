import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { m } from 'motion/react';
import { Briefcase, Check, Clock, Sparkles, Store, X } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { WelcomeMoment } from '@/components/creator/WelcomeMoment';
import { ApprovedMoment } from '@/components/creator/ApprovedMoment';
import { MoneySplit, PipelineBoard } from '@/components/creator/PipelineBoard';
import { ContestEarnings } from '@/components/creator/ContestEarnings';
import { useContestEarnings } from '@/lib/creator/useContestEarnings';
import { JobProgressBar } from '@/components/work/JobProgress';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { OFFER_STAGES, STAGE_META, stageIndex, type OfferStage } from '@/lib/offer-stages';
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
import { useMyJobProgress, type JobProgress } from '@/lib/work/job-progress';

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

  return (
    /*
     * ONE GRID, 2026-10-08. Rashid: "Use a strong grid system. Everything
     * should feel intentionally aligned ... almost architectural."
     *
     * The cap moved 1140 to 1400 and the content centres inside it. At 1140 on
     * a wide screen the dashboard sat in the left two thirds with the rest of
     * the page empty beside it, which is the "large unused areas" in his brief:
     * not too little content, a container too narrow to use the room.
     *
     * ONE GAP VALUE EVERYWHERE. It was `gap-[14px]` between sections and other
     * numbers inside them, so nothing lined up across a boundary. `gap-4` is
     * the scale's own step and it follows the text-size control, which a
     * hardcoded 14px never did.
     */
    <div className="wx-pop mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <Header name={name} tier={tier} handle={handle} />

      {nothingYet ? (
        <Suspense fallback={<div className="wx-skeleton h-[420px] rounded-xl" />}>
          <FirstDay />
        </Suspense>
      ) : noOfferWork ? (
        /*
         * CONTEST MONEY, BUT NO OFFER WORK AT ALL. Contests are open to every
         * approved creator regardless of which brands they work with, so this
         * is a real person, not an edge case.
         *
         * The money card is NOT DRAWN for them, and that is the whole point of
         * this branch. It would be a hero block reading "$0 across 0 jobs" over
         * an empty flow bar and three zero cells, sitting above the only money
         * they actually have. Every figure in it would be true and the screen
         * would read as broken, which is the thing the owner's layout rules are
         * written against.
         *
         * So their money leads, and the first day panel underneath does its
         * real job: getting them onto an offer. No view switch either, because
         * Pipeline would be seven empty stages.
         */
        <>
          <ContestEarnings />
          <Suspense fallback={<div className="wx-skeleton h-[420px] rounded-xl" />}>
            <FirstDay />
          </Suspense>
        </>
      ) : (
        <>
          <ViewSwitch view={view} onChange={setView} />

          {view === 'pipeline' ? (
            <>
              <PipelineBoard summary={summary} rows={work} moved={moved} progress={progress} />

              <div className="grid [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] items-start gap-[14px]">
                <MoneySplit summary={summary} moved={moved} />
                <Activity rows={rows ?? []} events={events ?? []} moved={moved} compact />
              </div>

              {/* Its own row rather than a third cell in that grid: contest
                  money is a separate pot and must never sit in a layout that
                  reads as part of the offer money beside it. See rule M10. */}
              <ContestEarnings />
            </>
          ) : (
            <>
              <Money summary={summary} moved={moved} />

              {/*
                DIRECTLY UNDER THE MONEY CARD, and never inside it. The card
                above adds its three cells up to its own headline, which is what
                lets a creator check our arithmetic; a contest reward in there
                would break the addition. Renders nothing at all until there is
                contest money, so a creator in no contest sees the screen they
                have always seen.
              */}
              <ContestEarnings />

              {/*
                THE KPI ROW IS ITS OWN BAND NOW, directly under the money.
                It used to sit in the right-hand column beneath the timeline,
                where four small boxes were whatever width was left over after
                the work list took its share â€” the "four tiny disconnected
                boxes" in the brief. Across the full width they are four equal
                columns of the same grid everything else uses.
              */}
              <Counts summary={summary} />

              {/*
                SEVEN AND FIVE, not auto-fit. `repeat(auto-fit,minmax(320px,1fr))`
                gave two equal columns, so the work a creator came to act on got
                exactly as much room as the log of what already happened. The
                split is explicit and it only applies from `lg`; below that the
                two stack in the order the brief asks for, work before activity.
              */}
              {/* `items-stretch`, not `items-start`. Symmetry is the brief's
                  highest-priority requirement and two cards of different
                  heights side by side is the most visible way to break it. The
                  timeline grows to meet the work list; `h-full` on each card
                  carries the stretch through the wrapper. */}
              <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <Work rows={work} pending={pending} moved={moved} progress={progress} />
                </div>
                <div className="lg:col-span-5">
                  <Activity rows={rows ?? []} events={events ?? []} moved={moved} />
                </div>
              </div>
            </>
          )}
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

/** An eyebrow, a greeting, and who we think you are. Nothing else. */
function Header({
  name,
  tier,
  handle,
}: {
  name: string;
  tier: string | null;
  handle: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-[14px] px-0.5 py-1">
      <div className="flex flex-col gap-1.5">
        <p className="text-muted flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          {/* The one thing on the page allowed to move forever. It is telling
              the truth: the websocket is open and this screen is current. */}
          <span aria-hidden className="wx-blink bg-stage-paid size-1.5 rounded-full" />
          Live
          <span aria-hidden className="text-line">
            /
          </span>
          WurxMediaHub
        </p>
        {/* An h2, not an h1: the top bar owns the page's only one. This greets
            the person rather than naming the section, so unlike the other
            creator screens it earns its row and stays. */}
        <h2 className="font-display text-[clamp(1.625rem,4.4vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.02em]">
          {greet(name)}
        </h2>
        {/* One line saying what the screen is for. The brief asked for it and
            the greeting alone never said why any of this was on the page. */}
        <p className="text-muted text-[0.875rem] leading-[1.4]">
          Here is where your work stands and what it has earned.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {tier ? (
          <span className="wx-card rounded-full px-3 py-1.5 text-[0.75rem] font-semibold tracking-[0.02em] capitalize">
            {tier} creator
          </span>
        ) : null}
        {handle ? (
          <span className="wx-card text-muted wx-numeric rounded-full px-3 py-1.5 text-[0.75rem]">
            @{handle}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- money --- */

type Moved = { ids: Set<string>; key: number };

function Money({ summary, moved }: { summary: WorkSummary; moved: Moved }) {
  const { paid, due, working, total, currency } = summary.money;
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency);
  const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  /** How many jobs sit in each money bucket, straight off the stage counts. */
  const jobsIn = (bucket: 'working' | 'due' | 'paid') =>
    OFFER_STAGES.filter((s) => STAGE_META[s].bucket === bucket).reduce(
      (n, s) => n + summary.byStage[s].count,
      0
    );

  const cells = [
    {
      key: 'paid' as const,
      label: 'Paid',
      value: paid,
      tone: BUCKET_TONE.paid,
      sub: `${jobsIn('paid')} ${jobsIn('paid') === 1 ? 'job' : 'jobs'} settled`,
    },
    {
      key: 'due' as const,
      label: 'Awaiting payment',
      value: due,
      tone: BUCKET_TONE.due,
      sub:
        jobsIn('due') > 0
          ? `${jobsIn('due')} ${jobsIn('due') === 1 ? 'job' : 'jobs'} approved, money on its way`
          : 'nothing approved right now',
    },
    {
      key: 'working' as const,
      label: 'In progress',
      value: working,
      tone: BUCKET_TONE.working,
      sub: `${jobsIn('working')} ${jobsIn('working') === 1 ? 'job' : 'jobs'} under way`,
    },
  ];

  const segments = [
    { key: 'paid', value: paid, className: 'bg-stage-paid' },
    { key: 'due', value: due, className: 'bg-stage-due' },
    { key: 'working', value: working, className: 'bg-stage-live' },
  ].filter((s) => s.value > 0);

  return (
    /*
     * THE HERO. Rashid: "Does the $400 financial state feel like the primary
     * piece of information?" It is the only card on the screen carrying the
     * warm wash, which is how it leads without being bigger than everything
     * else â€” light rather than size. It does not lift on hover, because it is
     * not clickable and a card that moves under the cursor and then does
     * nothing is a promise the interface breaks.
     */
    <section className="wx-card wx-card-hero flex flex-col gap-6 overflow-hidden rounded-2xl p-[clamp(1.25rem,2.4vw,1.75rem)]">
      {/* `relative` so the content sits above the ::before wash. */}
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Agreed with you so far
          </p>
          <p className="flex flex-wrap items-baseline gap-2.5">
            <span
              key={`total-${moved.key}`}
              className={cn(
                'font-display text-[clamp(2.375rem,7vw,3.625rem)] leading-none font-semibold tracking-[-0.03em]',
                moved.ids.size > 0 && 'wx-bump'
              )}
            >
              {fmt(total)}
            </span>
            <span className="text-muted text-[0.8125rem]">
              across {summary.approved} {summary.approved === 1 ? 'job' : 'jobs'}
            </span>
          </p>
        </div>

        {/* Right aligned only once it is actually beside the headline. Wrapped
            onto its own line on a phone, a right-aligned figure floats in the
            middle of nowhere. */}
        <div className="flex flex-col gap-0.5 sm:text-right">
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            In your account
          </p>
          <span
            key={`paid-${moved.key}`}
            className={cn(
              'font-display text-stage-paid text-[clamp(1.5rem,3.4vw,1.875rem)] font-semibold',
              moved.ids.size > 0 && 'wx-bump'
            )}
          >
            {fmt(paid)}
          </span>
        </div>
      </div>

      {/* Every agreed pound, and where it currently sits. The three add up to
          the headline by construction: each stage belongs to exactly one
          bucket, so a creator can check our arithmetic. */}
      <div className="relative flex flex-col gap-3">
        {/*
          18px of saturated fill was louder than the $400 above it. A creator's
          eye went to the bar first, which inverts the hierarchy the whole card
          exists to state â€” and on a single-job account the bar is one colour
          across the full width, so it was a large block of indigo in a screen
          whose only accent is meant to be gold.

          10px, sunk into its track by an inset shadow, so it reads as a gauge
          cut into the card rather than a stripe painted across it. Same data,
          same colours, a third of the weight.
        */}
        <div
          role="img"
          aria-label={`${fmt(paid)} paid, ${fmt(due)} awaiting payment, ${fmt(working)} in progress`}
          className="bg-surface-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)]"
        >
          {segments.map((s) => (
            <m.span
              key={s.key}
              initial={{ width: 0 }}
              animate={{ width: `${share(s.value)}%` }}
              transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
              className={s.className}
            />
          ))}
        </div>

        {/*
          THREE EQUAL CELLS, always three columns from `sm` up. `auto-fit` with
          a 170px floor dropped to 2 + 1 at some widths, which put "In progress"
          alone on a row looking like a conclusion rather than one third of a
          split. These are parts of one number and have to read as one row.

          Each keeps its bucket tint and gains the top hairline, so they read as
          inset panels within the hero rather than three loose chips on it.
        */}
        <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {cells.map((cell) => (
            <div
              key={cell.key}
              className={cn(
                'flex flex-col gap-1.5 rounded-xl p-4 shadow-[inset_0_1px_0_0_var(--wx-card-top-light)]',
                cell.tone.soft
              )}
            >
              <dt
                className={cn(
                  'text-[0.6875rem] font-semibold tracking-[0.1em] uppercase',
                  cell.tone.text
                )}
              >
                {cell.label}
              </dt>
              <dd
                key={`${cell.key}-${moved.key}`}
                className={cn(
                  'font-display wx-numeric text-[1.5rem] leading-none font-semibold',
                  moved.ids.size > 0 && 'wx-bump'
                )}
              >
                {fmt(cell.value)}
              </dd>
              <dd className="text-muted text-[0.75rem] leading-[1.35]">{cell.sub}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- work --- */

function Work({
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
    <section className="wx-card flex h-full flex-col gap-4 rounded-2xl p-5">
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Work you took
        </h2>
        <p className="text-muted wx-numeric text-[0.8125rem]">
          {rows.length} {rows.length === 1 ? 'job' : 'jobs'}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const stage = row.stage ?? 'pending_request';
          const at = stageIndex(stage);
          const tone = toneFor(stage);
          const justMoved = moved.ids.has(row.id);

          return (
            /*
             * A WORK ITEM, not a generic card. Rashid listed what it has to
             * communicate at a glance: project, earnings, progress, the current
             * action and a way to act. The money is the second biggest figure
             * on the page after the hero, because it is the answer to "what is
             * this job worth" and it was previously the same size as the
             * offer's title.
             *
             * It sits on `--wx-surface-2`, a step above the card holding it,
             * rather than on the same surface with a border. A card drawn on
             * its own colour inside its parent reads as a sheet lying on it;
             * the border version read as a box drawn on a box.
             */
            <li
              key={`${row.id}-${moved.key}`}
              className={cn(
                'bg-surface-2 flex flex-col gap-3 rounded-xl p-4 shadow-[inset_0_1px_0_0_var(--wx-card-top-light)]',
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
                </div>
                <p className="font-display wx-numeric shrink-0 text-[1.375rem] leading-none font-semibold whitespace-nowrap">
                  {row.committed_amount === null
                    ? 'To confirm'
                    : money(row.committed_amount, row.currency)}
                </p>
              </div>

              {/* Seven steps, always all seven. Somebody at "sample shipped"
                  wants to know what comes next as much as what came before. */}
              <ol className="flex gap-[3px]" aria-label={`Stage: ${STAGE_META[stage].label}`}>
                {OFFER_STAGES.map((s, i) => (
                  <li
                    key={s}
                    aria-hidden
                    className={cn(
                      'h-[5px] flex-1 rounded-[3px]',
                      i < at && 'bg-text/25',
                      i === at && tone.bar,
                      i > at && 'bg-line'
                    )}
                  />
                ))}
              </ol>

              <p className="flex flex-wrap items-center gap-2">
                <span className={cn('text-[0.78125rem] font-semibold', tone.text)}>
                  {at + 1}. {STAGE_META[stage].label}
                </span>
                <span className="text-muted text-[0.78125rem]">
                  {STAGE_META[stage].creatorHint}
                </span>
                {justMoved ? (
                  <span className="text-stage-live text-[0.6875rem] font-semibold">
                    just now
                  </span>
                ) : null}
              </p>

              {/* What the stage cannot say: how much of it they have filmed.
                  "Content pending" told them to go and shoot; it never told
                  them how many were left, or gave them anywhere to put one. */}
              {progress?.get(row.id) ? (
                <JobProgressBar
                  progress={progress.get(row.id)!}
                  addVideoHref={`/app/content?job=${row.id}`}
                  className="border-line border-t pt-[11px]"
                  compact
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {pending.length > 0 ? (
        <div className="border-line flex flex-col gap-2 border-t pt-3.5">
          {pending.map((row) => (
            <div key={row.id} className="bg-surface-2 flex flex-col gap-1 rounded-xl p-3">
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
    <section className="wx-card flex h-full flex-col gap-4 rounded-2xl p-5">
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
                        'size-2 shrink-0 rounded-full ring-2 ring-[color:var(--wx-card-face)]',
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
function Counts({ summary }: { summary: WorkSummary }) {
  const items = [
    {
      n: summary.approved,
      label: 'offers you are on',
      to: '/app/offers?tab=in',
      icon: Briefcase,
      tone: 'text-stage-live',
    },
    {
      n: summary.brands,
      label: 'brands you work with',
      to: '/app/brands',
      icon: Store,
      tone: 'text-accent',
    },
    {
      n: summary.waiting,
      label: 'waiting on a decision',
      to: '/app/offers',
      icon: Clock,
      tone: 'text-stage-due',
    },
    {
      n: summary.declined,
      label: 'not accepted',
      to: '/app/offers',
      icon: X,
      tone: 'text-muted',
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.label}>
            <Link
              to={item.to}
              /* The icon sits BESIDE the number, not above it. Stacked, each
                 card was mostly empty and four of them made a band of air
                 across the widest part of the page. */
              className="wx-card wx-card-lift flex h-full items-center gap-3.5 rounded-2xl p-4"
            >
              <span
                aria-hidden
                className="bg-surface-2 grid size-9 shrink-0 place-items-center rounded-lg shadow-[inset_0_1px_0_0_var(--wx-card-top-light)]"
              >
                <Icon size={16} className={item.tone} />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-display wx-numeric text-[1.75rem] leading-none font-semibold">
                  {item.n}
                </span>
                <span className="text-muted text-[0.78125rem] leading-[1.3]">{item.label}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
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
              className={`relative grid size-8 place-items-center rounded-full border text-[0.6875rem] ${
                s.state === 'done'
                  ? 'border-accent bg-accent text-on-accent'
                  : s.state === 'now'
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface-1 text-faint'
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
        className="border-line bg-surface-1 mt-10 w-full rounded-2xl border px-6 py-5 text-left shadow-sm"
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
        <p className="border-line bg-surface-1 text-muted mt-6 rounded-2xl border px-5 py-4 text-left text-[0.875rem] leading-relaxed">
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

      <div className="border-line bg-surface-1 flex flex-col gap-[18px] rounded-xl border p-[22px] shadow-md">
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
        <div className="border-line bg-surface-1 flex flex-col gap-3.5 rounded-xl border p-5">
          <div className="wx-skeleton h-3 w-28" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="wx-skeleton h-[58px]" />
          ))}
        </div>
        <div className="border-line bg-surface-1 flex flex-col gap-3.5 rounded-xl border p-5">
          <div className="wx-skeleton h-3 w-24" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="wx-skeleton h-[38px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
