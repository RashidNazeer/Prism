import { m } from 'motion/react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OFFER_STAGES, STAGE_META, stageIndex, type OfferStage } from '@/lib/offer-stages';

/**
 * Where one piece of work has got to, as seven steps.
 *
 * The whole pipeline is always shown, not just the part already done, because
 * a creator seeing "sample shipped" wants to know what comes after it as much
 * as what came before. Hiding the rest would answer half the question.
 *
 * Labels sit under the current step only. Seven captions across a phone is a
 * wall of text; one caption and a row of dots is a status.
 */
export function StageTracker({
  stage,
  className,
}: {
  stage: OfferStage;
  className?: string;
}) {
  const at = stageIndex(stage);
  const meta = STAGE_META[stage];
  const Icon = meta.icon;

  return (
    <div className={className}>
      <ol className="flex items-center gap-1" aria-label={`Stage: ${meta.label}`}>
        {OFFER_STAGES.map((s, i) => {
          const done = i < at;
          const now = i === at;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1">
              <m.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.45, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  'h-1.5 w-full origin-left rounded-full',
                  done || now ? 'bg-accent' : 'bg-surface-2'
                )}
                // Every step is in the label above; repeating each one here
                // would make a screen reader read the pipeline twice.
                aria-hidden
              />
            </li>
          );
        })}
      </ol>

      <p className="mt-2 flex items-center gap-2 text-[13px]">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full',
            stage === 'paid' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent'
          )}
        >
          {stage === 'paid' ? <Check size={13} aria-hidden /> : <Icon size={13} aria-hidden />}
        </span>
        <span className="min-w-0">
          <span className="font-semibold">{meta.label}</span>
          <span className="ml-2 text-faint">
            {at + 1} of {OFFER_STAGES.length}
          </span>
        </span>
      </p>
    </div>
  );
}
