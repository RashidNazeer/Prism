import { useEffect, useId, useRef, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { z } from 'zod';
import { Clock, ExternalLink, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { formatDeadline, timeLeft } from '@/lib/contest-time';
import { useFocusTrap } from '@/lib/use-focus-trap';
import {
  useEnterContest,
  type ContestDeliverableType,
  type CreatorContest,
} from '@/lib/creator/useCreatorContests';

/**
 * Entering a contest, and the moment it is meant to feel like something.
 *
 * Rashid asked for this by name: tapping enter should feel like an event rather
 * than a form submit. So the panel rises 14 pixels over 220ms with the page
 * behind it PERFECTLY STILL, which is why the body scroll is locked with the
 * scrollbar width paid back in padding. Locking overflow on its own removes the
 * scrollbar, the page grows by its width, and everything behind the panel jumps
 * sideways at the exact instant the reader's eye moves to it.
 *
 * `m.div` under `LazyMotion features={domAnimation} strict`, which is what this
 * codebase ships. `motion.div` throws in strict mode on purpose, so nothing can
 * quietly pull the full build back into the bundle.
 *
 * THE WORDS DIFFER BEFORE THE TAP, NOT AFTER IT. A contest on auto approve says
 * they are in the moment they tap; one on review says a person decides and the
 * answer arrives on this screen. Telling somebody afterwards which of the two
 * they just did is telling them too late to matter.
 *
 * WHAT IT NEVER DOES:
 *
 *   - Close on a failure. The refusal is shown inside the panel and everything
 *     they typed stays exactly where it was. A dialog that vanishes with the
 *     error is a dialog that loses the note somebody spent a minute on.
 *   - Enter twice. The action is disabled for the whole flight, and the
 *     database holds a partial unique index over live entries besides.
 *   - Say anything about anybody else. No headcount, no field size, no
 *     position. Decision D7.
 */

/* -------------------------------------------------- the deliverable rows -- */

/**
 * Enough of a deliverable to draw one, shared by the contest's live rows and by
 * the frozen terms an entrant already holds. Both shapes carry these fields and
 * a card has to read identically either way, or one promise looks like two.
 *
 * `currency` is optional because only a frozen term carries one: a term is
 * quoted in the currency it was agreed in, which can differ from what the
 * contest says today.
 *
 * `targetValue` IS READ ONLY on every creator surface, for ever. It is drawn
 * here and it is never bound to an input anywhere a creator can reach.
 *
 * PLACINGS ARE GONE, so there is no rank to draw and no ordinal to write.
 * Anybody who reaches a target earns its reward and several creators can earn
 * the same one.
 */
export interface DeliverableLike {
  id: string;
  type: ContestDeliverableType;
  title: string;
  detail: string | null;
  targetValue: number;
  rewardAmount: number;
  currency?: string;
}

/**
 * What this row asks somebody to actually do, in one phrase.
 *
 * Never the title. The title is the admin's own words and nothing in this
 * product generates one, so this sits BESIDE it rather than replacing it. The
 * type is what decides how one column is read: a GMV target is money and a
 * video target is a count.
 */
function ask(d: DeliverableLike, currency: string): string {
  if (d.type === 'video_count') {
    const n = Math.round(d.targetValue);
    return n === 1 ? 'Post 1 video' : `Post ${n} videos`;
  }
  return `Reach ${money(d.targetValue, d.currency ?? currency)} in GMV`;
}

/**
 * The rows a contest asks for, drawn once for the whole creator side.
 *
 * A reward of zero is a REAL VALUE now rather than a missing one: the database
 * requires an amount, and zero means a deliverable that is part of the brief
 * rather than one that pays. So it is said in words rather than printed as a
 * currency zero, which would read as a decision nobody has made.
 */
export function DeliverableRows({
  rows,
  currency,
  className,
}: {
  rows: DeliverableLike[];
  currency: string;
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {rows.map((d) => (
        <li
          key={d.id}
          className="wx-neo-inset flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-xl px-3.5 py-3"
        >
          <span className="min-w-0 flex-1 basis-40">
            <span className="text-text block text-[0.875rem] leading-snug font-semibold">
              {d.title}
            </span>
            <span className="text-muted mt-0.5 block text-[0.8125rem]">{ask(d, currency)}</span>
            {d.detail ? (
              <span className="text-faint mt-0.5 block text-[0.75rem] leading-relaxed">
                {d.detail}
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              'font-display shrink-0 text-[1rem] font-semibold',
              d.rewardAmount > 0 ? 'text-accent' : 'text-faint text-[0.8125rem] font-normal'
            )}
          >
            {d.rewardAmount > 0
              ? money(d.rewardAmount, d.currency ?? currency)
              : 'Part of the brief'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------ the panel --- */

/**
 * 1000, the length `contest_entries.note` allows. Checked here, again by Zod in
 * the Edge Function, and again by the column, which is the house rule.
 */
const noteSchema = z.string().trim().max(1000, 'Keep that under 1000 characters');

export function ContestEntryDialog({
  contest,
  onClose,
}: {
  contest: CreatorContest;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: 'textarea' });

  const headingId = useId();
  const reduced = useReducedMotion();

  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

  const enter = useEnterContest();
  const busy = enter.isPending;

  const instant = !contest.needsAdminApproval;

  /*
   * THE PAGE BEHIND STAYS STILL. Overflow hidden alone removes the scrollbar
   * and the whole layout jumps left by its width; the padding pays that width
   * back. Both are restored to whatever they were, rather than to '', so two
   * overlapping surfaces cannot leave the body locked.
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const parsed = noteSchema.safeParse(note);
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? 'That note is too long');
      return;
    }
    setNoteError('');

    try {
      await enter.mutateAsync({
        action: 'contest.enter',
        contestId: contest.id,
        note: parsed.data || null,
      });
      onClose();
    } catch {
      /*
       * Deliberately swallowed HERE and read off `enter.error` below. The panel
       * stays open, the refusal is shown in it, and the note is still in the
       * box. The database writes its refusals as sentences a creator can act on
       * ("that contest closed on 31 Aug 2026 23:59 UTC"), so there is something
       * worth showing.
       */
    }
  }

  const left = timeLeft(contest.expiresAt);

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
        // The reduced motion path lands the panel where it belongs with no
        // travel at all. `MotionConfig reducedMotion="user"` already honours
        // the system setting, and this makes the intent explicit at the one
        // place in this feature that moves.
        initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="wx-neo-raised relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-6 sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:p-7"
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
              {contest.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-1 grid size-[44px] shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        {/* ------------------------------------------- what happens on tap -- */}
        <div
          className={cn(
            'mt-5 rounded-xl px-4 py-3.5',
            instant ? 'bg-stage-paid-soft' : 'bg-stage-live-soft'
          )}
        >
          <p
            className={cn(
              'text-[0.875rem] font-semibold',
              instant ? 'text-stage-paid' : 'text-stage-live'
            )}
          >
            {instant ? 'You are in the moment you tap' : 'A person decides this one'}
          </p>
          <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
            {instant
              ? 'Nobody has to approve you. Tap once and the deliverables below are locked to your entry exactly as they read now.'
              : 'You are asking to enter. Somebody at Wurx reads every entry, and the answer lands on this screen the moment they decide. Nothing to check by email.'}
          </p>
        </div>

        {/* ------------------------------------------------- the deadline -- */}
        <div className="border-line mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-4">
          <span className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Closes
          </span>
          <span className="text-right">
            <span className="text-text block text-[0.875rem] font-semibold">
              {formatDeadline(contest.expiresAt, contest.expiresAtTimezone)}
            </span>
            <span className="text-muted mt-0.5 flex items-center justify-end gap-1.5 font-mono text-[0.75rem]">
              <Clock size={12} aria-hidden />
              {left}
            </span>
          </span>
        </div>

        <form onSubmit={submit} noValidate className="mt-5">
          {enter.error ? (
            <p
              role="alert"
              className="bg-danger-soft text-danger mb-4 rounded-xl px-4 py-3 text-[0.8125rem] font-medium"
            >
              {(enter.error as Error).message}
            </p>
          ) : null}

          {/* ---------------------------------- exactly what they agree to -- */}
          <div className="wx-neo-inset rounded-xl px-4 py-3.5">
            <p className="text-faint text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {instant ? 'What you are agreeing to' : 'What you are asking for'}
            </p>

            {contest.description ? (
              <p className="text-muted mt-2 text-[0.8125rem] leading-relaxed">
                {contest.description}
              </p>
            ) : null}

            {contest.deliverables.length > 0 ? (
              <DeliverableRows
                rows={contest.deliverables}
                currency={contest.currency}
                className="mt-3"
              />
            ) : (
              <p className="text-muted mt-2 text-[0.8125rem] leading-relaxed">
                Nothing has been set on this one yet. The team will confirm what it asks for and
                what it pays with you directly.
              </p>
            )}

            {/*
              "How it is judged" used to sit here. It is gone with the placings:
              the rows above say in numbers what that sentence said in words, and
              anybody who reaches a target earns its reward.
            */}

            {contest.products.length > 0 ? (
              <p className="text-muted mt-3 text-[0.8125rem] leading-relaxed">
                <span className="text-text font-semibold">Products: </span>
                {contest.products.map((p) => p.productName).join(', ')}
              </p>
            ) : null}

            <p className="text-faint mt-3 text-[0.75rem] leading-relaxed">
              {instant
                ? 'These are copied onto your entry as you tap, and they cannot be changed afterwards, by anybody.'
                : 'These are copied onto your entry the moment somebody says yes, and they cannot be changed afterwards, by anybody.'}
            </p>

            {contest.briefUrl ? (
              <a
                href={contest.briefUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[0.8125rem] font-semibold hover:underline"
              >
                Read the full brief
                <ExternalLink size={13} aria-hidden />
              </a>
            ) : null}
          </div>

          <div className="mt-5">
            <Field
              label="Anything to add"
              error={noteError || undefined}
              hint={
                instant
                  ? 'Optional. The team reads this alongside your entry.'
                  : 'Optional. The person deciding reads this with your entry.'
              }
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  name="note"
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g. I already post about this range, so I can start this week."
                  value={note}
                  disabled={busy}
                  onChange={(e) => {
                    setNote(e.target.value);
                    if (noteError) setNoteError('');
                  }}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button type="submit" disabled={busy}>
              <Trophy size={16} aria-hidden />
              {busy
                ? instant
                  ? 'Entering...'
                  : 'Sending...'
                : instant
                  ? 'Enter this contest'
                  : 'Ask to enter'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </m.div>
    </div>
  );
}
