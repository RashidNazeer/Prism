import { Link } from 'react-router';
import { Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { needsFilming, progressSentence, type JobProgress } from '@/lib/work/job-progress';

/**
 * How much of one job has been filmed.
 *
 * NEUTRAL, like the hook behind it. Creator screens use it today and the admin
 * queue uses it next, so it lives in `src/components/work/` and takes no view
 * of who is looking. Anything staff-only arrives as a prop; there is no role
 * check in here and there never should be, because a component that decides for
 * itself whether the viewer is staff is one wrong boolean away from putting
 * staff copy on a creator's screen.
 *
 * The bar has three parts and they are the three answers a creator wants:
 * approved (this counts), with the team (done my bit, waiting on you), and
 * still to film (over to me). Videos sent back are not in the bar, because
 * they are not progress; they are named in the sentence instead.
 *
 * Only the three stage colours are used. They are the only thing in the product
 * allowed to say where work or money has got to.
 */
export function JobProgressBar({
  progress,
  addVideoHref,
  className,
  compact = false,
}: {
  progress: JobProgress;
  /** Where "Add a video" goes. Omitted means no action is offered. */
  addVideoHref?: string;
  className?: string;
  /** Drops the eyebrow, for places already labelled by their surroundings. */
  compact?: boolean;
}) {
  const { required, approved, waiting } = progress;
  const showAction = Boolean(addVideoHref) && needsFilming(progress);

  // Everything is measured against what was agreed, so the three widths always
  // add up to the whole bar and never overflow it.
  const denominator = required && required > 0 ? required : null;
  const approvedPct = denominator ? Math.min(100, (approved / denominator) * 100) : 0;
  const waitingPct = denominator
    ? Math.min(100 - approvedPct, (waiting / denominator) * 100)
    : 0;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        {compact ? null : (
          <span className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
            Content
          </span>
        )}
        {denominator ? (
          <span className="font-display text-[13px] font-semibold">
            <span className={cn(progress.done ? 'text-stage-paid' : 'text-text')}>
              {approved}
            </span>
            <span className="text-faint"> / {denominator}</span>
          </span>
        ) : null}
      </div>

      {denominator ? (
        <div
          className={cn('bg-line mt-1.5 flex h-[6px] gap-[2px] overflow-hidden rounded-[3px]')}
          role="img"
          aria-label={progressSentence(progress)}
        >
          {approvedPct > 0 ? (
            <span
              className="bg-stage-paid h-full rounded-[3px]"
              style={{ width: `${approvedPct}%` }}
            />
          ) : null}
          {waitingPct > 0 ? (
            <span
              className="bg-stage-live h-full rounded-[3px]"
              style={{ width: `${waitingPct}%` }}
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-muted text-[12.5px]">{progressSentence(progress)}</p>
        {showAction ? (
          <Link
            to={addVideoHref!}
            className="border-line-interactive text-text hover:border-accent hover:text-accent inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors"
          >
            <Video size={13} aria-hidden />
            Add a video
          </Link>
        ) : null}
      </div>
    </div>
  );
}
