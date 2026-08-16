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
 * wall of text; one caption and a row of bars is a status.
 *
 * These are the SAME seven bars the home screen draws, deliberately. An offer
 * card and the dashboard can show the same job at the same moment, and two
 * different drawings of one pipeline read as two different facts.
 */

const BAR = {
  working: 'bg-stage-live',
  due: 'bg-stage-due',
  paid: 'bg-stage-paid',
} as const;

const TEXT = {
  working: 'text-stage-live',
  due: 'text-stage-due',
  paid: 'text-stage-paid',
} as const;

export function StageTracker({ stage, className }: { stage: OfferStage; className?: string }) {
  const at = stageIndex(stage);
  const bucket = STAGE_META[stage].bucket;

  return (
    <div className={className}>
      <ol className="flex gap-[3px]" aria-label={`Stage: ${STAGE_META[stage].label}`}>
        {OFFER_STAGES.map((s, i) => (
          <li
            key={s}
            // Every step is named in the caption below; repeating each one here
            // would make a screen reader read the pipeline twice.
            aria-hidden
            className={cn(
              'h-[5px] flex-1 rounded-[3px]',
              i < at && 'bg-text/25',
              i === at && BAR[bucket],
              i > at && 'bg-line'
            )}
          />
        ))}
      </ol>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={cn('text-[0.78125rem] font-semibold', TEXT[bucket])}>
          {at + 1}. {STAGE_META[stage].label}
        </span>
        <span className="text-muted text-[0.78125rem]">{STAGE_META[stage].short}</span>
      </p>
    </div>
  );
}
