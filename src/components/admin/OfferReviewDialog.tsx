import { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { Check, X } from 'lucide-react';
import { CreatorFace } from '@/components/admin/CreatorFace';
import { useCreatorAvatars } from '@/lib/admin/useCreatorAvatars';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { money } from '@/lib/money';
import { OFFER_STAGES, STAGE_META, type OfferStage } from '@/lib/offer-stages';
import {
  useReviewOfferApplication,
  type OfferQueueRow,
} from '@/lib/admin/useOfferApplications';

/**
 * Approve or reject one request.
 *
 * The confirmation step is deliberate: this is a decision about money, and the
 * creator is told the moment it lands. The panel restates exactly what is being
 * agreed to, because the row behind it may have been read a minute ago and the
 * numbers are the whole point.
 */
export function OfferReviewDialog({
  row,
  decision,
  onClose,
}: {
  row: OfferQueueRow;
  decision: 'approved' | 'rejected';
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  // Where the work starts. Usually the beginning, but a sample already in the
  // post is a real situation and making somebody approve then immediately
  // correct it is busywork.
  const [stage, setStage] = useState<OfferStage>('pending_request');
  const panelRef = useRef<HTMLDivElement>(null);
  const review = useReviewOfferApplication();
  const busy = review.isPending;

  useFocusTrap(panelRef, { initialSelector: 'textarea' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // The page behind must not scroll while a modal is open, which is very
  // obvious on a phone.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const faces = useCreatorAvatars([row.creator_id]);
  const who = row.creator_handle
    ? `@${row.creator_handle}`
    : (row.creator_name ?? 'this creator');
  const hasTerms = row.offer?.video_count !== null && row.offer?.reward_amount != null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${decision === 'approved' ? 'Approve' : 'Reject'} ${who}`}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => !busy && onClose()}
        className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />

      {/* The PANEL scrolls, not the wrapper. Block-start overflow is not part
          of a scroll container's scrollable area, so a tall panel centred in a
          short viewport puts its own heading permanently out of reach. */}
      <m.div
        ref={panelRef}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="border-line bg-surface-1 relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-6 shadow-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          {/* The last screen before an irreversible approval, so a face is a
              real check that the right row was clicked. The dialog's own
              aria-label already names them and CreatorFace is aria-hidden, so
              nothing is announced twice. */}
          <h2 className="flex items-center gap-2.5 text-lg font-bold">
            <CreatorFace
              src={faces[row.creator_id]}
              name={row.creator_name}
              handle={row.creator_handle}
              size={32}
            />
            <span>
              {decision === 'approved' ? 'Approve' : 'Reject'} {who}
            </span>
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <div className="border-line bg-surface-2 mt-4 rounded-xl border px-4 py-3.5">
          <p className="text-[0.875rem] font-semibold">{row.offer?.title ?? 'That offer'}</p>
          <p className="text-muted mt-0.5 text-[0.8125rem]">{row.brand?.name}</p>
          <p className="border-line mt-3 border-t pt-3 text-[0.875rem]">
            <span className="text-faint font-mono text-[0.625rem] tracking-[0.14em] uppercase">
              They are asking for
            </span>
            {hasTerms ? (
              <span className="wx-numeric mt-1 block font-semibold">
                {row.offer!.video_count} {row.offer!.video_count === 1 ? 'video' : 'videos'} for{' '}
                {money(row.offer!.reward_amount, row.offer!.currency)}
              </span>
            ) : (
              <span className="text-muted mt-1 block">
                This offer has no terms written on it, so agree them with the creator before you
                approve.
              </span>
            )}
          </p>
          {row.note ? (
            <p className="border-line text-muted mt-3 border-t pt-3 text-[0.8125rem] leading-relaxed">
              {row.note}
            </p>
          ) : null}
        </div>

        {/* What this costs, before it is spent. Approving is the moment the
            money stops being available to promise to anybody else, so the
            number belongs here rather than being discovered later on the brand
            list. */}
        {decision === 'approved' && row.budget ? <BudgetImpact row={row} /> : null}

        <p className="text-muted mt-4 text-[0.875rem] leading-relaxed">
          {decision === 'approved'
            ? 'They are told straight away, and the offer shows as theirs.'
            : 'Nothing is deleted. They can ask again, so a note here saves them guessing.'}
        </p>

        <div className="mt-5 grid gap-5">
          {decision === 'approved' ? (
            <Field label="Starting stage" hint={STAGE_META[stage].creatorHint}>
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  name="stage"
                  aria-describedby={describedBy}
                  value={stage}
                  disabled={busy}
                  onChange={(e) => setStage(e.target.value as OfferStage)}
                >
                  {OFFER_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_META[s].label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          <Field label="Note" hint="Optional. The creator reads this.">
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                name="note"
                aria-describedby={describedBy}
                value={note}
                maxLength={1000}
                disabled={busy}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  decision === 'approved'
                    ? 'Happy with that, go ahead.'
                    : 'Not on those terms right now, but keep an eye out.'
                }
              />
            )}
          </Field>
        </div>

        {review.error ? (
          <p role="alert" className="text-danger mt-4 text-[0.8125rem]">
            {(review.error as Error).message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button
            disabled={busy}
            onClick={() =>
              review.mutate(
                {
                  applicationId: row.id,
                  decision,
                  note: note.trim() || null,
                  ...(decision === 'approved' ? { stage } : {}),
                },
                { onSuccess: onClose }
              )
            }
          >
            {busy ? (
              'Saving...'
            ) : (
              <>
                {decision === 'approved' ? (
                  <Check size={16} aria-hidden />
                ) : (
                  <X size={16} aria-hidden />
                )}
                Yes, {decision === 'approved' ? 'approve' : 'reject'}
              </>
            )}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </m.div>
    </div>
  );
}

/**
 * What approving does to this brand's budget, and only this brand's.
 *
 * Deliberately does not block an approval that goes over. Whether to overspend
 * is a commercial decision, not a rule the software should be making at eleven
 * at night, so it says so plainly and leaves the choice where it belongs.
 */
function BudgetImpact({ row }: { row: OfferQueueRow }) {
  const currency = row.budget?.currency ?? row.currency;
  const allocated =
    row.budget?.budget_allocated == null ? null : Number(row.budget.budget_allocated);
  const used = Number(row.budget?.budget_used ?? 0) || 0;
  const cost = row.offer?.reward_amount == null ? 0 : Number(row.offer.reward_amount);

  if (allocated === null || !Number.isFinite(allocated)) {
    return (
      <p className="border-line bg-surface-2 text-muted mt-4 rounded-xl border px-4 py-3 text-[0.8125rem] leading-relaxed">
        {row.brand?.name} has no budget set, so there is nothing to count this against.
      </p>
    );
  }

  const after = used + cost;
  const left = allocated - after;
  const over = after > allocated;

  return (
    <div
      className={cn(
        'mt-4 rounded-xl border px-4 py-3',
        over ? 'border-danger/40 bg-danger-soft' : 'border-line bg-surface-2'
      )}
    >
      <p className="text-faint font-mono text-[0.625rem] tracking-[0.14em] uppercase">
        {row.brand?.name} budget
      </p>
      <p className="wx-numeric mt-1 text-[0.875rem]">
        <span className="font-semibold">{money(after, currency)}</span> of{' '}
        {money(allocated, currency)} committed after this
      </p>
      <p
        className={cn('mt-1 text-[0.8125rem]', over ? 'text-danger font-medium' : 'text-muted')}
      >
        {over ? (
          <>Over budget by {money(-left, currency)}. You can still approve it.</>
        ) : (
          <>{money(left, currency)} would be left</>
        )}
      </p>
    </div>
  );
}
