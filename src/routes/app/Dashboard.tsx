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
import { useSearchParams } from 'react-router';
import { m } from 'motion/react';
import { Check, ChevronDown, Clock, Sparkles, X } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { TiltCard, TiltLift } from '@/components/ui/TiltCard';
import { WelcomeMoment } from '@/components/creator/WelcomeMoment';
import { ApprovedMoment } from '@/components/creator/ApprovedMoment';
import { PipelineBoard, PipelineJobs } from '@/components/creator/PipelineBoard';
import { VelocityCard } from '@/components/creator/VelocityCard';
import { ContestEarnings } from '@/components/creator/ContestEarnings';
import { useContestEarnings } from '@/lib/creator/useContestEarnings';
import { JobProgressBar } from '@/components/work/JobProgress';
import { cn } from '@/lib/utils';
import { TIER_LABEL } from '@/lib/tiers';
import type { CreatorTier } from '@/lib/auth/auth-context';

/** Narrows a plain string from the profile to a known tier, without a cast. */
function isCreatorTier(value: string): value is CreatorTier {
  return Object.hasOwn(TIER_LABEL, value);
}
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
    <div className="wx-pop flex w-full flex-col gap-3.5">
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
          {/* The money split that used to sit beside this now lives in the rail's
              own header, so the totals are said once. */}
          <PipelineBoard summary={summary} rows={work} moved={moved} />

          {/*
            THE SAME GOLDEN FRAME AS OVERVIEW, and for the same reason: the two
            tabs are one screen at two zoom levels, so they must not re-arrange
            themselves under the person reading. The wide column is the work,
            the narrow one is the record of it.

            This used to be Activity on the wide side and ContestEarnings on the
            narrow one. ContestEarnings renders NOTHING for a creator with no
            contest money, which is most of them, so the narrow column was empty
            and the right-hand third of the page was blank. A column that is
            only sometimes there cannot be half the frame. Contest money keeps
            its own card and never sits inside one that reads as offer money —
            rule M10 — it just sits above the history now instead of beside it.
          */}
          <div className="wx-golden items-start">
            <PipelineJobs summary={summary} rows={work} moved={moved} progress={progress} />

            <div className="flex min-w-0 flex-col gap-3.5">
              <ContestEarnings />
              <Activity rows={rows ?? []} events={events ?? []} moved={moved} compact />
            </div>
          </div>
        </>
      ) : (
        <>
          {/*
            PERFORMANCE FIRST, THEN THE THREE STANDING QUESTIONS.
            Rashid's design, 2026-10-10. What a creator opens this screen to ask
            is "what did my videos sell", so that is the hero and it carries the
            chart that explains it. Underneath, one card each for the three
            things that do not have a time axis: what have I been paid, what am
            I committed to, what is running.

            Those three replace a journey, a jobs list, a counts grid and an ad
            card stacked in two columns. Nothing was deleted to get here. The
            seven-stage money journey IS the Pipeline tab, one click away and
            linked from the cash card, which is the right place for stage detail
            and the wrong place for a landing screen.
          */}
          <VelocityCard />

          {/*
            THE MONEY JOURNEY KEEPS ITS PLACE, and takes the cash card's.
            Rashid asked for it back, 2026-10-10. It was briefly replaced by a
            narrow "cash and earnings" card, which was a mistake: the two said
            the same thing (agreed, and how much of it has landed) and the
            journey says it better, because its four stops add up to its own
            headline and a creator can check our arithmetic against it. Two
            cards answering one question is how the figures start disagreeing.

            Full width, above the row: it is a horizontal track with four stops
            and a figure under each, and it has nowhere to put them in a third
            of the screen.
          */}
          <Journey summary={summary} rows={work} moved={moved} progress={progress} />

          <div className="grid grid-cols-1 items-stretch gap-3.5 lg:grid-cols-2">
            <ContractCard rows={work} pending={pending} progress={progress} moved={moved} />
            <SprintCard />
          </div>

          <Activity rows={rows ?? []} events={events ?? []} moved={moved} compact />
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
        {tier && isCreatorTier(tier) ? (
          <span className="wx-neo-raised-sm rounded-full px-3 py-1.5 text-[0.75rem] font-semibold tracking-[0.02em]">
            {TIER_LABEL[tier]} tier
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

/* ---------------------------------------------------------------- jobs --- */

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
  /* The newest few lead; the rest are one click away, none removed. */
  const [all, setAll] = useState(false);
  const FEW = 4;
  const shown = all ? events : events.slice(0, FEW);

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
          {shown.map((event, i) => {
            const row = byId.get(event.application_id);
            const tone = toneFor(event.to_stage);
            const fresh =
              moved.ids.has(event.application_id) && !claimed.has(event.application_id);
            if (fresh) claimed.add(event.application_id);
            const last = i === shown.length - 1;

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

      {events.length > FEW ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll(!all)}
          className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center gap-1 self-start rounded-md text-[0.8125rem] font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {all ? 'Show fewer' : `Show all ${events.length}`}
          <ChevronDown
            size={12}
            aria-hidden
            className={cn('shrink-0 transition-transform duration-200', all && 'rotate-180')}
          />
        </button>
      ) : null}
    </section>
  );
}

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

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

/* ------------------------------------------------- the three standing cards - */

/**
 * THE THREE QUESTIONS THAT HAVE NO TIME AXIS.
 *
 * The velocity card above them answers "how are my videos selling, lately",
 * and owns the date range for it. These three answer things that are simply
 * TRUE RIGHT NOW: what has reached me, what I have agreed to, what is running.
 * A "last 30 days" on any of them would be meaningless, which is exactly why
 * the range deliberately stops at the card above.
 *
 * All three always render something. A card that disappears when it has nothing
 * leaves a hole in a three-column row, which is the bug that left a third of
 * the Pipeline tab blank. An empty state is a design, not a failure.
 */

/**
 * What this creator has actually agreed to deliver.
 *
 * ONE contract, not a list: the list is the Pipeline tab. The one shown is the
 * furthest along, because that is the one with a deadline attached to it.
 */
function ContractCard({
  rows,
  pending,
  progress,
  moved,
}: {
  rows: MyWorkRow[];
  /* Requests that have no stage yet: pending AND rejected, as the caller
     builds it. Only the pending ones are still a live question. */
  pending: MyWorkRow[];
  progress?: Map<string, JobProgress>;
  moved: Moved;
}) {
  const waiting = pending.filter((r) => r.status === 'pending').length;
  const lead = [...rows].sort(
    (a, b) =>
      stageIndex((b.stage ?? 'pending_request') as OfferStage) -
      stageIndex((a.stage ?? 'pending_request') as OfferStage)
  )[0];

  if (!lead) {
    return (
      <section
        aria-label="Active contract"
        className="wx-neo-raised flex min-w-0 flex-col gap-2 rounded-2xl p-[clamp(1.125rem,2vw,1.5rem)]"
      >
        <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Active contract
        </h2>
        <p className="text-[0.9375rem] font-semibold">Nothing signed yet</p>
        <p className="text-muted text-[0.8125rem] leading-[1.45]">
          {waiting > 0
            ? `You have ${waiting} request${waiting === 1 ? '' : 's'} waiting on a decision. We will tell you the moment one lands.`
            : 'When a brand takes you on, the deal and what it pays appear here.'}
        </p>
        <ButtonLink to="/app/offers" variant="secondary" className="mt-auto self-start">
          See what is open
        </ButtonLink>
      </section>
    );
  }

  const p = progress?.get(lead.id);
  const meta = STAGE_META[(lead.stage ?? 'pending_request') as OfferStage];
  const justMoved = moved.ids.has(lead.id);

  return (
    <section
      aria-label="Active contract"
      className={cn(
        'wx-neo-raised flex min-w-0 flex-col gap-3 rounded-2xl p-[clamp(1.125rem,2vw,1.5rem)]',
        justMoved && 'wx-flash'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Active contract
        </h2>
        <span className="text-accent truncate text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
          {lead.brand?.name ?? 'A brand'}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-[0.9375rem] leading-[1.3] font-semibold break-words">
          {lead.offer?.title ?? 'An offer'}
        </p>
        <p className="text-muted text-[0.75rem] leading-[1.4]">{meta.creatorHint}</p>
      </div>

      {p && p.required !== null ? (
        <div className="flex flex-col gap-1.5">
          <JobProgressBar progress={p} />
          <p className="text-muted wx-numeric text-[0.75rem] font-semibold">
            {p.approved} of {p.required} videos approved
          </p>
        </div>
      ) : null}

      <div className="wx-neo-inset mt-auto flex items-center justify-between gap-3 rounded-lg px-3 py-2">
        <span className="text-muted text-[0.75rem]">Fee</span>
        <span className="font-display wx-numeric text-[0.9375rem] font-semibold">
          {lead.committed_amount === null
            ? 'To confirm'
            : money(lead.committed_amount, lead.currency)}
        </span>
      </div>
    </section>
  );
}

/**
 * Contest money, which is a separate pot and must never be added to offer money.
 *
 * Rule M10. A contest reward inside the cash card would break the sum a creator
 * uses to check us, so it gets its own card and says plainly what it is.
 */
function SprintCard() {
  const q = useContestEarnings();
  const pots = q.data ?? [];
  const owed = pots.reduce((n, p) => n + p.owed, 0);
  const paid = pots.reduce((n, p) => n + p.paid, 0);
  const currency = pots[0]?.currency ?? 'USD';
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency);

  return (
    <section
      aria-label="Contests"
      className="wx-neo-raised flex min-w-0 flex-col gap-3 rounded-2xl p-[clamp(1.125rem,2vw,1.5rem)]"
    >
      <h2 className="text-muted flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        <Sparkles size={13} aria-hidden className="text-accent" />
        Contests
      </h2>

      {q.isPending ? (
        <div className="wx-skeleton h-24 rounded-xl" />
      ) : owed === 0 && paid === 0 ? (
        <>
          <p className="text-[0.9375rem] font-semibold">No contest winnings yet</p>
          <p className="text-muted text-[0.8125rem] leading-[1.45]">
            Contests are extra money on top of your deals. Anything you win lands here, kept
            separate from your offer money.
          </p>
          <ButtonLink to="/app/contests" variant="secondary" className="mt-auto self-start">
            See what is running
          </ButtonLink>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-muted text-[0.75rem]">Won, on its way to you</span>
            <span className="font-brand wx-numeric text-accent text-[clamp(1.75rem,3vw,2.25rem)] leading-none font-semibold">
              {fmt(owed)}
            </span>
          </div>
          <div className="wx-neo-inset flex items-center justify-between gap-3 rounded-lg px-3 py-2">
            <span className="text-muted text-[0.75rem]">Already paid out</span>
            <span className="wx-numeric text-stage-paid text-[0.8125rem] font-semibold">
              {fmt(paid)}
            </span>
          </div>
          <p className="text-subtle text-[0.6875rem] leading-[1.4]">
            Kept apart from your offer money on purpose, so neither figure hides the other.
          </p>
          <ButtonLink to="/app/contests" variant="secondary" className="mt-auto self-start">
            See your contests
          </ButtonLink>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------ the money journey - */

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
