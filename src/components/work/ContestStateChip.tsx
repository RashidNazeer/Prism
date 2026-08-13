import { cn } from '@/lib/utils';
import { CONTEST_STATE_LABEL, type ContestLifecycle } from '@/lib/contest-state';

/**
 * The one chip that says where a contest itself has got to.
 *
 * In `src/components/work/` because both sides draw it and neither side may
 * import the other. It takes a state and nothing else: it decides nothing about
 * who is looking, reads no query and carries no staff-only fact.
 *
 * THE COLOURS ARE NOT STAGE TOKENS, and that is rule C1 rather than taste. The
 * three stage tokens say where one creator's work and money have got to. A
 * contest's own lifecycle is a different fact: open is not paid, and a passed
 * deadline is not money owed to anybody. Three screens each had a private copy
 * of this map, which is three chances to reach for `stage-paid` because green
 * looked right.
 */
const STATE_STYLE: Record<ContestLifecycle, string> = {
  open: 'bg-info-soft text-info',
  off: 'bg-surface-2 text-muted',
  closed: 'bg-surface-2 text-text',
  settled: 'bg-surface-3 text-text',
  cancelled: 'bg-danger-soft text-danger',
};

export function ContestStateChip({
  state,
  className,
}: {
  state: ContestLifecycle;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
        STATE_STYLE[state],
        className
      )}
    >
      {CONTEST_STATE_LABEL[state]}
    </span>
  );
}
