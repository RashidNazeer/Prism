import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { m } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { TIERS, type CreatorTier } from '@/lib/auth/auth-context';
import { useReviewApplication } from '@/lib/admin/useReviewApplication';
import { useFocusTrap } from '@/lib/use-focus-trap';

const TIER_COPY: Record<CreatorTier, string> = {
  creator: 'Creator, the starting tier',
  rising: 'Rising, first tracked sales',
  pro: 'Pro, consistent revenue',
  elite: 'Elite, top performers',
};

export interface ReviewTarget {
  id: string;
  handle: string;
}

/**
 * The one place a decision is confirmed.
 *
 * Used by the row menu, the bulk bar and the detail screen, so approving one
 * person and approving forty behave identically and the wording can never drift
 * between them. The extra click is deliberate: this changes real accounts, and
 * a bulk approve changes a lot of them at once.
 */
export function ReviewDialog({
  targets,
  decision,
  onClose,
  onDone,
}: {
  targets: ReviewTarget[];
  decision: 'approved' | 'rejected';
  onClose: () => void;
  onDone?: (reviewed: number) => void;
}) {
  const [tier, setTier] = useState<CreatorTier>('creator');
  const [note, setNote] = useState('');
  const review = useReviewApplication();
  const busy = review.isPending;
  const panelRef = useRef<HTMLDivElement>(null);

  const many = targets.length > 1;
  const who = many ? `${targets.length} creators` : `@${targets[0]?.handle ?? ''}`;

  // Focus starts on the first real control, is trapped while the dialog is up,
  // and goes back where it came from on close. Deliberately NOT re-run when
  // `busy` flips: an effect that re-focuses on every state change yanks the
  // cursor out from under someone mid-decision.
  useFocusTrap(panelRef, { initialSelector: 'select, textarea' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // The page behind must not scroll while a modal is open, which is otherwise
  // very obvious on a phone.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const submit = () => {
    review.mutate(
      {
        applicationIds: targets.map((t) => t.id),
        decision,
        tier: decision === 'approved' ? tier : null,
        note: note.trim() || null,
      },
      {
        onSuccess: (outcome) => {
          onDone?.(outcome.reviewed);
          // A clean run closes. A partial one stays open so the reviewer can
          // read which ones did not go through, rather than the panel
          // vanishing and pretending everything worked.
          if (outcome.failures.length === 0) onClose();
        },
      }
    );
  };

  const failures = review.data?.failures ?? [];

  return (
    // The PANEL scrolls, not this wrapper. With `items-end` (and `items-center`
    // from sm up) a panel taller than the viewport overflows past the container's
    // top edge, and block-start overflow is not part of a scroll container's
    // scrollable area, so the heading becomes permanently unreachable on a short
    // phone. Verified in Chromium: at 375x554 a bulk dialog put its title 114px
    // above the viewport with a maximum scroll offset of zero.
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

      <m.div
        ref={panelRef}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        // Bottom sheet on a phone, centred card from `sm` up. Capped to the
        // viewport and scrolling inside itself, so every part of it stays
        // reachable however short the screen is.
        className="border-line bg-surface-1 relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-6 shadow-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">
            {decision === 'approved' ? 'Approve' : 'Reject'} {who}
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

        <p className="text-muted mt-2 text-[14px] leading-relaxed">
          {decision === 'approved' ? (
            <>
              {many ? 'They all become creators' : 'They become a creator'} straight away, on
              the tier you pick, and {many ? 'their dashboards' : 'their dashboard'}{' '}
              {many ? 'change' : 'changes'} while they are looking.
            </>
          ) : (
            <>
              Nothing is deleted. {many ? 'The accounts stay' : 'The account stays'} in place so
              the decision can be revisited by hand.
            </>
          )}
        </p>

        {many ? (
          <ul className="mt-4 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {targets.map((t) => (
              <li
                key={t.id}
                className="bg-surface-2 text-muted rounded-full px-2.5 py-1 text-[12px]"
              >
                @{t.handle}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 grid gap-5">
          {decision === 'approved' ? (
            <Field label="Tier" hint={TIER_COPY[tier]}>
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  name="tier"
                  aria-describedby={describedBy}
                  value={tier}
                  disabled={busy}
                  onChange={(e) => setTier(e.target.value as CreatorTier)}
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          <Field
            label="Note"
            hint={`Optional. ${many ? 'Everyone selected sees this' : 'They see this'} on their dashboard.`}
          >
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
                    ? 'Loved the content, welcome in.'
                    : 'Not the right fit for our brands right now.'
                }
              />
            )}
          </Field>
        </div>

        {review.error ? (
          <p role="alert" className="text-danger mt-4 text-[13px]">
            {(review.error as Error).message}
          </p>
        ) : null}

        {failures.length > 0 ? (
          <div className="border-danger/40 bg-danger-soft mt-4 rounded-xl border px-4 py-3">
            <p className="text-danger flex items-center gap-2 text-[13px] font-medium">
              <AlertTriangle size={15} aria-hidden />
              {review.data!.reviewed} went through, {failures.length} did not
            </p>
            <ul className="text-danger mt-2 grid gap-1 text-[12px]">
              {failures.slice(0, 5).map((f) => {
                const target = targets.find((t) => t.id === f.applicationId);
                return (
                  <li key={f.applicationId}>
                    @{target?.handle ?? f.applicationId.slice(0, 8)}: {f.error}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button disabled={busy} onClick={submit}>
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
                {many ? ` all ${targets.length}` : ''}
              </>
            )}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {failures.length > 0 ? 'Close' : 'Cancel'}
          </Button>
        </div>
      </m.div>
    </div>
  );
}
