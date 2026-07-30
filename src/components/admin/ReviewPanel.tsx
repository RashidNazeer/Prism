import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ReviewDialog } from '@/components/admin/ReviewDialog';
import type { ApplicationDetail } from '@/lib/admin/useApplicationDetail';

/**
 * Approve or reject from the detail screen.
 *
 * The tier, note and confirmation all live in `ReviewDialog`, which the queue's
 * row menu and bulk bar use as well. One decision flow, so the wording and the
 * safeguards cannot drift between reviewing one person and reviewing forty.
 */
export function ReviewPanel({ application }: { application: ApplicationDetail }) {
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);

  return (
    <section className="rounded-2xl border border-line bg-surface-1 p-6">
      <h2 className="text-lg font-bold">Decision</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Approving makes @{application.tiktok_handle} a creator straight away and assigns
        their tier. Rejecting leaves the account in place so the decision can be revisited.
      </p>

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Button onClick={() => setDecision('approved')}>
          <Check size={16} aria-hidden />
          Approve
        </Button>
        <Button variant="secondary" onClick={() => setDecision('rejected')}>
          <X size={16} aria-hidden />
          Reject
        </Button>
      </div>

      {decision ? (
        <ReviewDialog
          targets={[{ id: application.id, handle: application.tiktok_handle }]}
          decision={decision}
          onClose={() => setDecision(null)}
        />
      ) : null}
    </section>
  );
}
