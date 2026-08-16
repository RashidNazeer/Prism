import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m, useReducedMotion } from 'motion/react';
import { ArrowLeft, Check, Clock, ExternalLink, Send, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { DeliverableDonut, DeliverableProgress } from '@/components/work/DeliverableProgress';
import { formatDeadline, timeLeft } from '@/lib/contest-time';
import { getSupabase } from '@/lib/supabase';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import {
  claimedTotalsOf,
  newVideosNeeded,
  useEnterContest,
  useMyContestStanding,
  videosAlreadyDeclared,
  type CreatorConfirmedTotals,
  type CreatorContest,
  type CreatorContestTerm,
  type CreatorProgressUpdate,
} from '@/lib/creator/useCreatorContests';

/**
 * A creator says what they have achieved on one contest, and staff decide.
 *
 * THE ONE THING TO UNDERSTAND BEFORE CHANGING ANYTHING HERE: a creator typing
 * their own GMV is a creator typing their own payslip. Everything sent from this
 * panel lands as a CLAIM, drawn in the "waiting to be confirmed" colour, and it
 * becomes a figure money can be owed against only when a member of staff
 * confirms it. The panel says so in words on every step rather than once in
 * small print, because a bar that filled in as somebody typed would tell them
 * they had earned something nobody has agreed to.
 *
 * THE SECURITY LINE, drawn in three places rather than one:
 *
 *   - THE TARGET IS READ ONLY HERE. It is rendered, never bound to an input,
 *     and it is not in the payload. Neither is the reward.
 *   - `SubmitProgressPayload` has no target and no reward field, and the Edge
 *     Function's schema for this action is STRICT, so a request carrying one is
 *     refused outright rather than quietly stripped.
 *   - `submit_contest_progress` takes no target argument and no reward
 *     argument at all, and matches the entry on `creator_id` as well as its id,
 *     so an entry id lifted from somebody else comes back as "that is not one
 *     of your contests".
 *
 * Nothing in this file may ever grow a control that writes a target, a reward,
 * a status, or anybody else's figures.
 *
 * TWO STEPS, ONE JOURNEY, AND THE PANEL NEVER CLOSES ON A FAILURE.
 *
 *   1. Their targets, read only, beside a box for what they have achieved. The
 *      figures are CUMULATIVE TOTALS rather than "since last time", so the
 *      previous ones are prefilled and named: they are correcting a number they
 *      can see rather than guessing what we already hold.
 *   2. Exactly N rows for links and ad codes, where N is the INCREASE in the
 *      count and never the total. Five to six asks for ONE row. The five
 *      earlier videos are listed above it, readable, and never re-entered.
 *   3. A confirmation saying it has been sent and counts once the team confirm
 *      it.
 *
 * A refusal is shown inside the panel with everything they typed still in it.
 * The database writes its refusals as sentences a creator can act on, so there
 * is something worth showing.
 */

/* ------------------------------------------------------ the videos so far -- */

interface VideoRow {
  id: string;
  video_url: string;
  ad_code: string;
  status: 'submitted' | 'approved' | 'needs_another_take';
  created_at: string;
}

/**
 * The videos already on this entry, oldest first.
 *
 * SHOWN, NEVER ASKED FOR AGAIN. Read here rather than in `useCreatorContests`
 * because this is the only screen that needs the rows themselves: every other
 * card in the product wants the COUNTS, and those come from
 * `contest_entry_progress`, which is one row per entry instead of one per video.
 *
 * No creator filter, for the reason the rest of the contest reads carry none:
 * row security returns their own submissions and nobody else's, and a filter
 * here would hide which layer was doing that work.
 */
function useEntryVideos(entryId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['creator', 'contest-videos', entryId],
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<VideoRow[]> => {
      const { data, error } = await getSupabase()
        .from('contest_submissions')
        .select('id, video_url, ad_code, status, created_at')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: true })
        // The video count itself is capped at 1000 by the database, so this can
        // never be a page of a longer list.
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as VideoRow[];
    },
  });
}

/* ------------------------------------------------------------ the checks -- */

/** The same ceilings `submit_contest_progress` raises a sentence for. */
const GMV_CEILING = 100_000_000;
const VIDEO_CEILING = 1000;

/**
 * A figure typed by a human, read as a number.
 *
 * Commas, spaces and a leading currency symbol are all things somebody pastes
 * out of Seller Centre, and refusing "1,240.50" as "not a number" is the kind of
 * refusal that makes a person retype a figure they already had right.
 *
 * A LEADING MINUS SURVIVES, and that is not a detail. Stripping every leading
 * non-digit read "-5" as 5, so the two "cannot be less than zero" refusals below
 * could never fire and a figure about money was quietly changed into a different
 * one. A wrong number has to be refused by name, never corrected on somebody's
 * behalf.
 */
function readFigure(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/[,\s]/g, '')
    .replace(/^[^\d.\-+]+/, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;

interface NewVideo {
  url: string;
  code: string;
}

/**
 * The one curve in this panel, written as a tuple rather than left to infer as
 * `number[]`, which is what a bare array literal in a const becomes and is not
 * assignable to Motion's easing type.
 */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ------------------------------------------------------------- the panel -- */

type Step = 'figures' | 'videos' | 'sent';

export function ContestProgressDialog({
  contest,
  onClose,
}: {
  contest: CreatorContest;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Focus opens on the first figure rather than on the close button, which is
  // where "the first focusable element" would park a keyboard user.
  useFocusTrap(panelRef, { initialSelector: 'input' });

  const headingId = useId();
  const reduced = useReducedMotion();
  const queryClient = useQueryClient();

  const entry = contest.entry;
  const entryId = entry?.id ?? '';

  const act = useEnterContest();
  const busy = act.isPending;
  const videos = useEntryVideos(entryId, Boolean(entryId));

  const [step, setStep] = useState<Step>('figures');
  const [gmv, setGmv] = useState('');
  const [count, setCount] = useState('');
  const [rows, setRows] = useState<NewVideo[]>([]);
  const [figureErrors, setFigureErrors] = useState<{ gmv?: string; count?: string }>({});
  const [rowErrors, setRowErrors] = useState<Record<number, { url?: string; code?: string }>>(
    {}
  );
  const [refusal, setRefusal] = useState('');
  const [sent, setSent] = useState<{ gmv: number; count: number; added: number } | null>(null);

  const updates = contest.progressUpdates;
  const confirmed = contest.confirmed;
  const pending = contest.pendingClaim;
  const claimed = claimedTotalsOf(updates, confirmed);
  const floor = videosAlreadyDeclared(updates);
  const currency = entry?.currency ?? contest.currency;

  /*
   * PREFILLED WITH WHAT THEY LAST TOLD US, once. The figures are cumulative
   * totals, so an empty box would ask somebody at 640 GMV to remember 640 rather
   * than to correct it, and the commonest answer to that question is a number
   * typed slightly wrong.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const startGmv = updates[0]?.gmv ?? confirmed?.confirmedGmv ?? 0;
    if (startGmv > 0) setGmv(String(startGmv));
    if (floor > 0) setCount(String(floor));
  }, [updates, confirmed, floor]);

  /*
   * THE PAGE BEHIND STAYS PERFECTLY STILL. Overflow hidden on its own removes
   * the scrollbar, the layout grows by its width, and everything behind the
   * panel jumps sideways at the exact instant the reader's eye lands on it. The
   * padding pays that width back. Both are restored to whatever they were,
   * rather than to '', so two overlapping surfaces cannot leave the body locked.
   */
  useEffect(() => {
    const { style } = document.body;
    const previousOverflow = style.overflow;
    const previousPadding = style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;

    style.overflow = 'hidden';
    if (gap > 0) style.paddingRight = `${gap}px`;

    return () => {
      style.overflow = previousOverflow;
      style.paddingRight = previousPadding;
    };
  }, []);

  // Escape closes it, unless something is in flight: pulling the panel out from
  // under a request in progress leaves nowhere for the answer to land.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  /*
   * A STEP CHANGE MOVES FOCUS WITH IT. The control that was focused has just
   * unmounted, and the browser hands focus back to the body when that happens,
   * so a keyboard or screen reader user would land outside a panel they are
   * still inside. The first input of the new step, or its first button when it
   * has none.
   */
  useEffect(() => {
    const container = panelRef.current;
    if (!container) return;
    const target =
      container.querySelector<HTMLElement>('input') ??
      container.querySelector<HTMLElement>('button:not([aria-hidden])');
    target?.focus();
  }, [step]);

  const earlier = videos.data ?? [];

  /** What they have typed, as numbers, or null while it does not read as one. */
  const typedGmv = readFigure(gmv);
  const typedCount = readFigure(count);

  /*
   * THE INCREASE, NEVER THE TOTAL, and computed by the one shared helper so no
   * screen can invent its own arithmetic. Five to six is one row.
   */
  const newVideos = typedCount === null ? 0 : newVideosNeeded(typedCount, updates);

  function checkFigures(): boolean {
    const next: { gmv?: string; count?: string } = {};

    if (typedGmv === null) {
      next.gmv = 'Put in your total GMV so far, or 0 if there is none yet';
    } else if (typedGmv < 0) {
      next.gmv = 'A GMV figure cannot be less than zero';
    } else if (typedGmv > GMV_CEILING) {
      next.gmv = `A GMV figure of ${typedGmv.toLocaleString()} looks like a typo`;
    }

    if (typedCount === null) {
      next.count = 'Put in how many videos you have posted on this contest in total';
    } else if (!Number.isInteger(typedCount)) {
      next.count = 'A video count is a whole number of videos';
    } else if (typedCount < 0) {
      next.count = 'A video count cannot be less than zero';
    } else if (typedCount < floor) {
      /*
       * BOTH NUMBERS NAMED, because "that is too low" on a form with one box is
       * not something anybody can act on. Refused here, and refused again by
       * `submit_contest_progress`, which is the guarantee rather than this.
       */
      next.count =
        `You have already told us about ${floor} ${floor === 1 ? 'video' : 'videos'}, ` +
        `so this update cannot say ${typedCount}. Videos cannot be taken back.`;
    } else if (typedCount > VIDEO_CEILING) {
      next.count = `A video count of ${typedCount} looks like a typo`;
    }

    setFigureErrors(next);
    return Object.keys(next).length === 0;
  }

  function toVideos() {
    if (busy) return;
    setRefusal('');
    if (!checkFigures()) return;

    // Keep whatever is already typed when the count moves. Somebody who fills
    // two rows and then corrects the count from 7 to 8 must not lose them.
    setRows((prev) =>
      Array.from({ length: newVideos }, (_, i) => prev[i] ?? { url: '', code: '' })
    );
    setRowErrors({});
    setStep('videos');
  }

  function checkRows(): boolean {
    const next: Record<number, { url?: string; code?: string }> = {};
    const seen = new Set<string>();
    const already = new Set(earlier.map((v) => v.video_url.trim().toLowerCase()));

    rows.forEach((row, i) => {
      const url = row.url.trim();
      const code = row.code.trim();
      const problem: { url?: string; code?: string } = {};

      if (!/^https:\/\/\S+$/i.test(url)) {
        problem.url = 'Paste the full link to the post, starting with https://';
      } else if (url.length > 2048) {
        problem.url = 'That link is too long to be a video link';
      } else if (already.has(url.toLowerCase())) {
        problem.url = 'You have already posted that link on this contest';
      } else if (seen.has(url.toLowerCase())) {
        problem.url = 'That same link is on another row';
      } else {
        seen.add(url.toLowerCase());
      }

      if (code.length < 3) problem.code = 'Every new video needs its ad code';

      if (problem.url || problem.code) next[i] = problem;
    });

    setRowErrors(next);
    return Object.keys(next).length === 0;
  }

  async function send() {
    if (busy || !entry) return;
    setRefusal('');

    // Re-checked here as well as on the way through, because the count can be
    // corrected on the way back.
    if (!checkFigures()) {
      setStep('figures');
      return;
    }
    if (!checkRows()) return;

    const finalGmv = roundMoney(typedGmv ?? 0);
    const finalCount = Math.round(typedCount ?? 0);

    try {
      await act.mutateAsync({
        action: 'progress.submit',
        entryId: entry.id,
        gmv: finalGmv,
        videoCount: finalCount,
        videos: rows.map((r) => ({ videoUrl: r.url.trim(), adCode: r.code.trim() })),
      });
      // The shared mutation invalidates their entries, the catalogue and their
      // standing. The video list belongs to this screen, so it is refreshed
      // here rather than there.
      void queryClient.invalidateQueries({ queryKey: ['creator', 'contest-videos', entryId] });
      setSent({ gmv: finalGmv, count: finalCount, added: rows.length });
      setStep('sent');
    } catch (err) {
      /*
       * The panel STAYS OPEN and everything they typed stays exactly where it
       * was. A dialog that vanishes with its error is a dialog that loses six
       * links somebody spent five minutes pasting.
       */
      setRefusal(err instanceof Error ? err.message : 'That did not go through. Try again.');
    }
  }

  /*
   * Around 220ms, with a reduced motion path that lands each step where it
   * belongs and travels no distance at all. `MotionConfig reducedMotion="user"`
   * already honours the system setting; this makes the intent explicit at the
   * places in this panel that move.
   */
  const stepMotion = reduced
    ? { initial: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : { initial: { opacity: 0, y: 8 }, transition: { duration: 0.22, ease: EASE } };

  // Opened only from a card whose entry is approved. Belt and braces, and it
  // keeps every hook above unconditional.
  if (!entry) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => !busy && onClose()}
        className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />

      <m.div
        ref={panelRef}
        initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.22, ease: EASE }}
        className="border-line bg-surface-1 relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-6 shadow-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {contest.brand?.name ?? 'Contest'}
            </p>
            <h2
              id={headingId}
              className="font-display mt-1 text-[1.3125rem] leading-tight font-bold"
            >
              {step === 'sent' ? 'Sent to the team' : 'Update your progress'}
            </h2>
            <p className="text-muted mt-1 text-[0.8125rem]">{contest.name}</p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        {refusal ? (
          <p
            role="alert"
            className="bg-danger-soft text-danger mt-5 rounded-xl px-4 py-3 text-[0.8125rem] font-medium"
          >
            {refusal}
          </p>
        ) : null}

        {pending && step !== 'sent' ? (
          <WaitingPanel claim={pending} currency={currency} onClose={onClose} />
        ) : step === 'figures' ? (
          <m.div key="figures" {...stepMotion} animate={{ opacity: 1, y: 0 }} className="mt-5">
            {/*
              The deadline, in the zone the ADMIN chose rather than the reader's
              own, through the one formatter in the product. Rule L6: a creator
              in California who reads "closes today" at 16:00 and is refused at
              23:59 in London has nothing on the screen to point at.
            */}
            <div className="border-line mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-4">
              <span className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                Closes
              </span>
              <span className="text-right">
                <span className="text-text block text-[0.8125rem] font-semibold">
                  {formatDeadline(contest.expiresAt, contest.expiresAtTimezone)}
                </span>
                <span className="text-muted mt-0.5 flex items-center justify-end gap-1.5 font-mono text-[0.75rem]">
                  <Clock size={12} aria-hidden />
                  {timeLeft(contest.expiresAt)}
                </span>
              </span>
            </div>

            <Targets
              terms={contest.terms}
              confirmed={confirmed}
              claimed={claimed}
              currency={currency}
            />

            <Standing contestId={contest.id} />

            {updates[0]?.status === 'rejected' ? (
              <div className="bg-danger-soft mt-4 rounded-xl px-4 py-3.5">
                <p className="text-danger text-[0.8125rem] font-semibold">
                  Your last figures were sent back
                </p>
                {updates[0].staffMessage ? (
                  <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
                    {updates[0].staffMessage}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="border-line bg-surface-2 mt-4 rounded-xl border px-4 py-4">
              <p className="text-faint text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                What you have achieved
              </p>
              <p className="text-muted mt-1.5 text-[0.8125rem] leading-relaxed">
                Your totals on this contest so far, not what you have done since last time.
              </p>

              {updates[0] ? (
                <p className="text-faint mt-2 text-[0.75rem] leading-relaxed">
                  Last time you told us {money(updates[0].gmv, currency)} and{' '}
                  {updates[0].videoCount} {updates[0].videoCount === 1 ? 'video' : 'videos'}
                  {updates[0].status === 'confirmed' ? ', which the team confirmed.' : '.'}
                </p>
              ) : null}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Total GMV so far"
                  error={figureErrors.gmv}
                  hint={`Everything this contest has sold, in ${currency}.`}
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      name="gmv"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="e.g. 640"
                      value={gmv}
                      disabled={busy}
                      onChange={(e) => {
                        setGmv(e.target.value);
                        if (figureErrors.gmv)
                          setFigureErrors((p) => ({ ...p, gmv: undefined }));
                      }}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      className="font-mono"
                    />
                  )}
                </Field>

                <Field
                  label="Videos posted so far"
                  error={figureErrors.count}
                  hint={
                    floor > 0
                      ? `You have told us about ${floor} so far. It can go up, never down.`
                      : 'Your total on this contest, not just the new ones.'
                  }
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      name="videoCount"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="e.g. 6"
                      value={count}
                      disabled={busy}
                      onChange={(e) => {
                        setCount(e.target.value);
                        if (figureErrors.count)
                          setFigureErrors((p) => ({ ...p, count: undefined }));
                      }}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      className="font-mono"
                    />
                  )}
                </Field>
              </div>

              {/*
                Said BEFORE they type rather than after they send. Somebody who
                finds out afterwards that six links are coming has already
                decided how long this was going to take.
              */}
              <p className="text-faint mt-3 text-[0.75rem] leading-relaxed">
                {newVideos > 0
                  ? `Next you will be asked for ${newVideos} new video ${
                      newVideos === 1 ? 'link and its ad code' : 'links and their ad codes'
                    }. The ones you have already sent are not asked for again.`
                  : 'Nothing here counts until somebody at Wurx confirms it.'}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button type="button" className="min-h-11" disabled={busy} onClick={toVideos}>
                Continue
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </Button>
            </div>
          </m.div>
        ) : step === 'videos' ? (
          <m.div key="videos" {...stepMotion} animate={{ opacity: 1, y: 0 }} className="mt-5">
            <div className="bg-stage-due-soft rounded-xl px-4 py-3.5">
              <p className="text-stage-due text-[0.875rem] font-semibold">
                {newVideos === 0
                  ? 'No new videos this time'
                  : newVideos === 1
                    ? 'One new video to add'
                    : `${newVideos} new videos to add`}
              </p>
              <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
                {newVideos === 0
                  ? 'Your count has not moved, so there is nothing new to send. Your GMV figure still goes to the team.'
                  : 'Only the ones this update adds. Everything you have already sent stays exactly as it is.'}
              </p>
            </div>

            {videos.isLoading ? (
              <div className="mt-4 flex flex-col gap-2">
                <div className="wx-skeleton h-14 rounded-xl" />
                <div className="wx-skeleton h-14 rounded-xl" />
              </div>
            ) : videos.isError ? (
              /*
                Said plainly rather than swallowed. The list is context rather
                than the job, so the rows below still work: the database is what
                decides whether a link is already on this entry, and it refuses a
                duplicate by name.
              */
              <p className="text-muted border-line mt-4 rounded-xl border px-3.5 py-3 text-[0.8125rem] leading-relaxed">
                Your earlier videos would not load just now. You can still add the new ones.
              </p>
            ) : earlier.length > 0 ? (
              <div className="mt-4">
                <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                  Already sent
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {earlier.map((v, i) => (
                    <EarlierVideo key={v.id} video={v} index={i + 1} />
                  ))}
                </ul>
              </div>
            ) : null}

            {rows.length > 0 ? (
              <div className="mt-5 flex flex-col gap-4">
                {rows.map((row, i) => (
                  <div key={i} className="border-line bg-surface-2 rounded-xl border px-4 py-4">
                    <p className="text-text text-[0.8125rem] font-semibold">
                      New video {floor + i + 1}
                    </p>
                    <div className="mt-3 flex flex-col gap-4">
                      <Field label="Video link" error={rowErrors[i]?.url}>
                        {({ id, describedBy, invalid }) => (
                          <Input
                            id={id}
                            name={`videoUrl-${i}`}
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            placeholder="https://www.tiktok.com/@you/video/..."
                            value={row.url}
                            disabled={busy}
                            onChange={(e) => {
                              const value = e.target.value;
                              setRows((prev) =>
                                prev.map((r, j) => (j === i ? { ...r, url: value } : r))
                              );
                              if (rowErrors[i]?.url)
                                setRowErrors((prev) => ({
                                  ...prev,
                                  [i]: { ...prev[i], url: undefined },
                                }));
                            }}
                            aria-describedby={describedBy}
                            invalid={invalid}
                          />
                        )}
                      </Field>

                      <Field label="Ad code" error={rowErrors[i]?.code}>
                        {({ id, describedBy, invalid }) => (
                          <Input
                            id={id}
                            name={`adCode-${i}`}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="Paste the code for this video"
                            value={row.code}
                            disabled={busy}
                            onChange={(e) => {
                              const value = e.target.value;
                              setRows((prev) =>
                                prev.map((r, j) => (j === i ? { ...r, code: value } : r))
                              );
                              if (rowErrors[i]?.code)
                                setRowErrors((prev) => ({
                                  ...prev,
                                  [i]: { ...prev[i], code: undefined },
                                }));
                            }}
                            aria-describedby={describedBy}
                            invalid={invalid}
                            className="font-mono"
                          />
                        )}
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="border-line mt-6 border-t pt-4">
              <p className="text-faint text-[0.75rem] leading-relaxed">
                You are telling the team you are at {money(roundMoney(typedGmv ?? 0), currency)}{' '}
                and {Math.round(typedCount ?? 0)}{' '}
                {Math.round(typedCount ?? 0) === 1 ? 'video' : 'videos'} in total. Nothing
                counts until they confirm it, and each video is watched on its own.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button
                type="button"
                className="min-h-11"
                disabled={busy}
                onClick={() => void send()}
              >
                <Send size={15} aria-hidden />
                {busy ? 'Sending...' : 'Send to the team'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={busy}
                onClick={() => {
                  setRefusal('');
                  setStep('figures');
                }}
              >
                <ArrowLeft size={15} aria-hidden />
                Back
              </Button>
            </div>
          </m.div>
        ) : (
          <m.div key="sent" {...stepMotion} animate={{ opacity: 1, y: 0 }} className="mt-5">
            <div className="bg-stage-due-soft rounded-xl px-4 py-4">
              <p className="text-stage-due flex items-center gap-2 text-[0.875rem] font-semibold">
                <Check size={16} aria-hidden />
                It is with the team
              </p>
              <p className="text-muted mt-1.5 text-[0.8125rem] leading-relaxed">
                Nothing counts until somebody at Wurx confirms it. Until then these figures show
                as waiting on this screen, and the answer lands here with no refresh needed.
              </p>
            </div>

            {sent ? (
              <dl className="border-line mt-4 flex flex-col gap-2 border-t pt-4">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted text-[0.8125rem]">GMV you reported</dt>
                  <dd className="font-display text-[0.9375rem] font-semibold">
                    {money(sent.gmv, currency)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted text-[0.8125rem]">Videos in total</dt>
                  <dd className="font-display text-[0.9375rem] font-semibold">{sent.count}</dd>
                </div>
                {sent.added > 0 ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted text-[0.8125rem]">New videos sent</dt>
                    <dd className="font-display text-[0.9375rem] font-semibold">{sent.added}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            <p className="text-faint mt-4 text-[0.75rem] leading-relaxed">
              Each video is watched on its own, so one being sent back does not undo the rest.
            </p>

            <div className="mt-6">
              <Button type="button" className="min-h-11" onClick={onClose}>
                Done
              </Button>
            </div>
          </m.div>
        )}
      </m.div>
    </div>
  );
}

/* ---------------------------------------------------------- the fixtures -- */

/**
 * Their targets, and how far along they are. READ ONLY, ALWAYS.
 *
 * Not one of these numbers is bound to an input and not one of them is in the
 * payload. Drawn with the shared `DeliverableProgress`, so the confirmed band
 * and the claimed band mean the same thing here as everywhere else in the
 * product: confirmed is money that can be owed, claimed is a sentence somebody
 * typed.
 *
 * The rows are the FROZEN TERMS rather than the contest's live deliverables. An
 * admin adding or re-pricing one on Friday must not move the target of somebody
 * approved on Monday.
 */
function Targets({
  terms,
  confirmed,
  claimed,
  currency,
}: {
  terms: CreatorContestTerm[];
  confirmed: CreatorConfirmedTotals | null;
  claimed: { gmv: number; videoCount: number };
  currency: string;
}) {
  if (terms.length === 0) {
    return (
      <div className="border-line bg-surface-2 rounded-xl border px-4 py-3.5">
        <p className="text-text text-[0.875rem] font-semibold">No targets on this one yet</p>
        <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
          Tell us where you have got to anyway. The team will confirm your figures and say what
          this contest asks for.
        </p>
      </div>
    );
  }

  const confirmedFor = (t: CreatorContestTerm) =>
    t.type === 'gmv' ? (confirmed?.confirmedGmv ?? 0) : (confirmed?.confirmedVideoCount ?? 0);
  const claimedFor = (t: CreatorContestTerm) =>
    t.type === 'gmv' ? claimed.gmv : claimed.videoCount;

  const only = terms.length === 1 ? terms[0]! : null;

  return (
    <div className="border-line bg-surface-2 rounded-xl border px-4 py-4">
      <p className="text-faint text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        What you are going for
      </p>
      <p className="text-muted mt-1.5 text-[0.8125rem] leading-relaxed">
        Set by the team when you were let in. These cannot be changed here, or by you anywhere.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-5">
        {/*
          A donut only where there is ONE number worth looking at. Several
          deliverables side by side are bars, because comparing arc lengths is
          something people are measurably bad at and comparing bar lengths is
          not.
        */}
        {only ? (
          <DeliverableDonut
            type={only.type}
            target={only.targetValue}
            confirmed={confirmedFor(only)}
            claimed={claimedFor(only)}
            currency={only.currency || currency}
            size={116}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-4">
          {terms.map((t) => (
            <DeliverableProgress
              key={t.id}
              type={t.type}
              target={t.targetValue}
              confirmed={confirmedFor(t)}
              claimed={claimedFor(t)}
              currency={t.currency || currency}
              reward={t.rewardAmount}
              title={t.title}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * "2nd closest of 5 to the GMV target." That sentence, and nothing else.
 *
 * NO HANDLE, NO NAME, NO OTHER ENTRANT'S FIGURE, and there is none to render:
 * `my_contest_standing` returns the caller's own numbers and two aggregates over
 * the field, takes no user id, and reads `auth.uid()` itself. This is the exact
 * width of the amendment Rashid made to decision D7 on 2026-08-13 and nothing
 * here may widen it.
 *
 * NOTHING IS DRAWN WHEN THERE IS NOTHING TO SAY: no standing at all, or a field
 * of one, where "1st of 1" is a fact about nobody and reads like a joke.
 */
function Standing({ contestId }: { contestId: string }) {
  const { data } = useMyContestStanding(contestId);
  if (!data || data.entrants < 2) return null;

  return (
    <p className="text-muted mt-4 text-[0.8125rem] leading-relaxed">
      <span className="text-text font-semibold">Where you are in the field: </span>
      {ordinal(data.gmvPlace)} closest of {data.entrants} on GMV, {ordinal(data.videoPlace)} on
      videos. Ranked on confirmed figures only, and nobody else is ever named.
    </p>
  );
}

const ordinal = (n: number): string => {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
};

/**
 * What a creator sees when a claim is already with the team.
 *
 * ONE CLAIM WAITING AT A TIME, held by a unique index in the database and said
 * here in a sentence, because two overlapping claims describe the same videos
 * and cannot both be reviewed honestly. A form whose only possible outcome is a
 * refusal is worse than no form, so there is not one on this panel.
 */
function WaitingPanel({
  claim,
  currency,
  onClose,
}: {
  claim: CreatorProgressUpdate;
  currency: string;
  onClose: () => void;
}) {
  return (
    <div className="mt-5">
      <div className="bg-stage-due-soft rounded-xl px-4 py-4">
        <p className="text-stage-due flex items-center gap-2 text-[0.875rem] font-semibold">
          <Clock size={16} aria-hidden />
          Your last update is still with the team
        </p>
        <p className="text-muted mt-1.5 text-[0.8125rem] leading-relaxed">
          Wait for them to confirm it before sending another. The answer lands on this screen
          with no refresh needed.
        </p>
      </div>

      <dl className="border-line mt-4 flex flex-col gap-2 border-t pt-4">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted text-[0.8125rem]">GMV you reported</dt>
          <dd className="font-display text-[0.9375rem] font-semibold">
            {money(claim.gmv, currency)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted text-[0.8125rem]">Videos in total</dt>
          <dd className="font-display text-[0.9375rem] font-semibold">{claim.videoCount}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <Button type="button" className="min-h-11" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** One video already on this entry. Shown, never asked for again. */
function EarlierVideo({ video, index }: { video: VideoRow; index: number }) {
  const label =
    video.status === 'approved'
      ? 'Counted'
      : video.status === 'needs_another_take'
        ? 'Sent back'
        : 'With the team';

  return (
    <li className="border-line bg-surface-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3.5 py-3">
      <span className="text-faint shrink-0 font-mono text-[0.75rem]">{index}</span>
      <a
        href={video.video_url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-accent inline-flex min-h-11 min-w-0 flex-1 basis-40 items-center gap-1.5 text-[0.8125rem] font-medium hover:underline"
      >
        <span className="truncate">{video.video_url}</span>
        <ExternalLink size={12} aria-hidden className="shrink-0" />
      </a>
      <span className="text-faint shrink-0 font-mono text-[0.75rem]">{video.ad_code}</span>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 text-[0.75rem] font-semibold',
          video.status === 'approved'
            ? 'text-stage-paid'
            : video.status === 'needs_another_take'
              ? 'text-danger'
              : 'text-stage-due'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-2 rounded-full',
            video.status === 'approved'
              ? 'bg-stage-paid'
              : video.status === 'needs_another_take'
                ? 'bg-danger'
                : 'bg-stage-due'
          )}
        />
        {label}
      </span>
    </li>
  );
}

/**
 * The block on the contest card: their claimed figures against the target, and
 * what is still waiting to be confirmed.
 *
 * It lives beside the dialog rather than in the route because the two have to
 * agree about what a claim is. `DeliverableProgress` does the drawing, so this
 * cannot invent a fourth colour for money.
 *
 * NOTHING IS DRAWN AS A ZERO. A creator with nothing confirmed reads a sentence
 * saying so, because printing 0 GMV against a target says "you have sold
 * nothing", which is a different and usually untrue thing to say to somebody who
 * has not been reviewed yet.
 */
export function ContestProgressSummary({
  contest,
  className,
}: {
  contest: CreatorContest;
  className?: string;
}) {
  const { terms, confirmed, pendingClaim, progressUpdates } = contest;
  const currency = contest.entry?.currency ?? contest.currency;
  const claimed = claimedTotalsOf(progressUpdates, confirmed);

  const confirmedFor = (t: CreatorContestTerm) =>
    t.type === 'gmv' ? (confirmed?.confirmedGmv ?? 0) : (confirmed?.confirmedVideoCount ?? 0);
  const claimedFor = (t: CreatorContestTerm) =>
    t.type === 'gmv' ? claimed.gmv : claimed.videoCount;

  const refused = progressUpdates[0]?.status === 'rejected' ? progressUpdates[0] : null;
  const nothingConfirmed = !confirmed || confirmed.confirmedAt === null;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {terms.length > 0 ? (
        terms.map((t) => (
          <DeliverableProgress
            key={t.id}
            type={t.type}
            target={t.targetValue}
            confirmed={confirmedFor(t)}
            claimed={claimedFor(t)}
            currency={t.currency || currency}
            reward={t.rewardAmount}
            title={t.title}
          />
        ))
      ) : (
        <p className="text-muted text-[0.8125rem] leading-relaxed">
          The team have not set what this one asks for yet.
        </p>
      )}

      {pendingClaim ? (
        <p className="text-stage-due flex items-center gap-1.5 text-[0.75rem] font-semibold">
          <Clock size={12} aria-hidden />
          Your figures are with the team
        </p>
      ) : refused ? (
        <p className="text-danger text-[0.75rem] leading-relaxed">
          Your last figures were sent back
          {refused.staffMessage ? `. ${refused.staffMessage}` : '.'}
        </p>
      ) : nothingConfirmed && terms.length > 0 ? (
        <p className="text-muted flex items-center gap-1.5 text-[0.75rem]">
          <Trophy size={12} aria-hidden />
          Nothing confirmed yet. Tell us where you have got to.
        </p>
      ) : null}
    </div>
  );
}
