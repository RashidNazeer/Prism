import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { money } from '@/lib/money';
import type { ContentStatus } from '@/lib/content';
import {
  useManageContest,
  type ContestContentReviewResult,
} from '@/lib/admin/useManageContest';

/**
 * Approve one contest video, or send it back.
 *
 * ONE COMPONENT, TWO SCREENS, on purpose. It renders inside the progress queue
 * beside the videos that arrived with a claim, and again in the standalone
 * contest video queue. A reviewer clearing a backlog and a reviewer checking
 * one creator's evidence are the same decision, and drawing it twice is how the
 * two drift apart.
 *
 * IT IS DELIBERATELY THE SAME SHAPE AS THE OFFER SIDE
 * (`Review` in `src/routes/admin/Content.tsx`): approve on the left, "Another
 * take" beside it, a note box the creator reads, and on an already-approved row
 * a quiet "Send it back" rather than nothing at all. Contest videos and offer
 * videos are the same act of watching a video and saying yes or no, so a
 * reviewer should not have to learn two screens.
 *
 * WHAT IS NOT THE SAME IS THE MONEY, and this is where Rashid's rule of
 * 2026-08-20 lands. On the offer side approving the last video moves a job to
 * Payment pending. Here, approving the last video of a video target OWES the
 * reward outright, and sending one back TAKES IT BACK while it is still only
 * owed. So this component has to say which of those just happened, or an admin
 * clicks a button and money moves silently.
 */
export function ContestVideoDecision({
  contentId,
  status,
  /** How the row is laid out. `inline` is the compact form used inside a list. */
  variant = 'inline',
}: {
  contentId: string;
  status: ContentStatus;
  variant?: 'inline' | 'block';
}) {
  const review = useManageContest();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');

  const result = review.data as ContestContentReviewResult | undefined;
  const owed = result?.rewards;
  const pulled = result?.withdrawn;

  const decide = (next: 'approved' | 'needs_another_take') =>
    review.mutate(
      { action: 'content.review', contentId, status: next, note: note.trim() || null },
      { onSuccess: () => setAsking(false) }
    );

  /*
   * WHAT THE DECISION DID TO THE MONEY. The database has always returned this
   * and no screen has ever shown it, which on the offer side meant finishing
   * somebody's work looked identical to approving one of five. Here it would be
   * worse: a reward appearing or disappearing with nothing said.
   */
  const moneyLine = (() => {
    if (owed?.awards) {
      return {
        tone: 'text-stage-paid',
        text: `That was the last one. ${money(owed.amount, owed.currency)} is now owed to them.`,
      };
    }
    if (pulled?.withdrawn) {
      return {
        tone: 'text-stage-due',
        text: `${money(pulled.amount, pulled.currency)} is no longer owed until they replace it. They have been told.`,
      };
    }
    if (pulled?.already_paid) {
      return {
        tone: 'text-stage-due',
        text: 'They are now short a video, but that reward has already been paid, so it stands.',
      };
    }
    return null;
  })();

  const say = moneyLine ? (
    <p role="status" className={`${moneyLine.tone} mt-1.5 text-[0.75rem] font-medium`}>
      {moneyLine.text}
    </p>
  ) : null;

  const failed = review.error ? (
    <p role="alert" className="text-danger mt-1.5 text-[0.75rem]">
      {(review.error as Error).message}
    </p>
  ) : null;

  if (asking) {
    return (
      <div className={variant === 'block' ? 'border-line border-t pt-2.5' : 'w-full'}>
        <label className="sr-only" htmlFor={`contest-note-${contentId}`}>
          What needs changing
        </label>
        <textarea
          id={`contest-note-${contentId}`}
          rows={2}
          maxLength={500}
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What needs changing? The creator reads this."
          className="wx-neo-inset placeholder:text-faint focus-visible:ring-accent/50 w-full rounded-xl px-3 py-2 text-[0.8125rem] focus:outline-none focus-visible:ring-2"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={review.isPending}
            onClick={() => decide('needs_another_take')}
          >
            {review.isPending ? 'Sending...' : 'Send back'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
        {failed}
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className={variant === 'block' ? 'border-line border-t pt-2.5' : ''}>
        {/*
          Quiet, because taking an approval back should never be the easiest
          thing on the row. It is still one click away, which "no control at
          all" was not: this whole review path had no caller until 2026-08-20.
        */}
        <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
          <RotateCcw size={14} aria-hidden />
          Send it back
        </Button>
        {say}
        {failed}
      </div>
    );
  }

  return (
    <div className={variant === 'block' ? 'border-line border-t pt-2.5' : ''}>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={review.isPending} onClick={() => decide('approved')}>
          <Check size={14} aria-hidden />
          {review.isPending ? 'Saving...' : 'Approve'}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
          <RotateCcw size={14} aria-hidden />
          Another take
        </Button>
      </div>
      {say}
      {failed}
    </div>
  );
}
