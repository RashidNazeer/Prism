import { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { TIERS, type CreatorTier } from '@/lib/auth/auth-context';
import { useReviewApplication } from '@/lib/admin/useReviewApplication';
import type { ApplicationDetail } from '@/lib/admin/useApplicationDetail';

const TIER_COPY: Record<CreatorTier, string> = {
  creator: 'Creator, the starting tier',
  rising: 'Rising, first tracked sales',
  pro: 'Pro, consistent revenue',
  elite: 'Elite, top performers',
};

/**
 * Approve or reject, with a confirmation step.
 *
 * The extra click is deliberate. This changes a real person's account: they are
 * promoted to creator, given a tier, and their dashboard changes underneath
 * them within the second. A decision is not reversible from this screen, so it
 * should not be one stray click away.
 */
export function ReviewPanel({ application }: { application: ApplicationDetail }) {
  const [tier, setTier] = useState<CreatorTier>('creator');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<'approved' | 'rejected' | null>(null);

  const review = useReviewApplication();
  const busy = review.isPending;

  const submit = () => {
    if (!confirming) return;
    review.mutate(
      {
        applicationId: application.id,
        decision: confirming,
        tier: confirming === 'approved' ? tier : null,
        note: note.trim() || null,
      },
      { onSuccess: () => setConfirming(null) }
    );
  };

  return (
    <section className="rounded-2xl border border-line bg-surface-1 p-6">
      <h2 className="text-lg font-bold">Decision</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Approving makes @{application.tiktok_handle} a creator straight away and assigns
        their tier. Rejecting leaves the account in place so the decision can be revisited.
      </p>

      <div className="mt-6 grid gap-5">
        <Field
          label="Tier on approval"
          hint={TIER_COPY[tier]}
          error={
            review.error && /tier/i.test((review.error as Error).message)
              ? (review.error as Error).message
              : undefined
          }
        >
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="tier"
              aria-describedby={describedBy}
              invalid={invalid}
              value={tier}
              disabled={busy || confirming !== null}
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

        <Field
          label="Note"
          hint="Optional. The applicant sees this on their dashboard, so write it for them."
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              name="note"
              aria-describedby={describedBy}
              value={note}
              maxLength={1000}
              disabled={busy || confirming !== null}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Loved the skincare content, welcome in."
            />
          )}
        </Field>
      </div>

      {/* --------------------------------------------------------- confirm -- */}
      {confirming ? (
        <div className="mt-6 rounded-xl border border-accent bg-accent-soft p-4">
          <p className="flex items-start gap-2.5 text-[14px] leading-relaxed font-medium">
            <AlertTriangle size={17} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            <span>
              {confirming === 'approved' ? (
                <>
                  Approve @{application.tiktok_handle} as{' '}
                  <span className="capitalize">{tier}</span>? Their account becomes a
                  creator immediately.
                </>
              ) : (
                <>
                  Reject @{application.tiktok_handle}? They see the decision on their
                  dashboard right away.
                </>
              )}
            </span>
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button size="sm" disabled={busy} onClick={submit}>
              {busy
                ? 'Saving...'
                : confirming === 'approved'
                  ? 'Yes, approve'
                  : 'Yes, reject'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button onClick={() => setConfirming('approved')} disabled={busy}>
            <Check size={16} aria-hidden />
            Approve
          </Button>
          <Button variant="secondary" onClick={() => setConfirming('rejected')} disabled={busy}>
            <X size={16} aria-hidden />
            Reject
          </Button>
        </div>
      )}

      {review.error ? (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {(review.error as Error).message}
        </p>
      ) : null}
    </section>
  );
}
