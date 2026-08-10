import { m } from 'motion/react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { OFFER_STAGES, STAGE_META, type OfferStage } from '@/lib/offer-stages';
import type { MyWorkRow, WorkSummary } from '@/lib/creator/useMyWork';

/**
 * The second view of the same money: where every job is standing right now.
 *
 * The home screen answers "have I been paid and what is coming". This answers
 * "what is sitting where", which is the question somebody asks when three jobs
 * are in flight and one of them has gone quiet. Seven columns, the money parked
 * in each, and the jobs themselves as chips inside them.
 *
 * It reads `summary.byStage`, which `summarise()` has always computed and which
 * nothing was using until now.
 */

type Moved = { ids: Set<string>; key: number };

const TONE = {
  working: { text: 'text-stage-live', bar: 'bg-stage-live', soft: 'bg-stage-live-soft' },
  due: { text: 'text-stage-due', bar: 'bg-stage-due', soft: 'bg-stage-due-soft' },
  paid: { text: 'text-stage-paid', bar: 'bg-stage-paid', soft: 'bg-stage-paid-soft' },
} as const;

const toneFor = (stage: OfferStage) => TONE[STAGE_META[stage].bucket];

export function PipelineBoard({
  summary,
  rows,
  moved,
}: {
  summary: WorkSummary;
  rows: MyWorkRow[];
  moved: Moved;
}) {
  const { paid, due, working, currency } = summary.money;
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency);

  const legend = [
    { label: 'In progress', value: working, tone: TONE.working },
    { label: 'Awaiting payment', value: due, tone: TONE.due },
    { label: 'Paid', value: paid, tone: TONE.paid },
  ];

  return (
    <section className="border-line bg-surface-1 flex flex-col gap-[18px] rounded-[22px] border p-[clamp(18px,2.4vw,26px)] shadow-md">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
          Your pipeline, stage by stage
        </h2>

        <dl className="flex flex-wrap gap-4">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-[7px]">
              <span aria-hidden className={cn('size-[9px] rounded-[2px]', l.tone.bar)} />
              <dt className="text-muted text-[12.5px]">{l.label}</dt>
              <dd className="text-[13px] font-semibold">{fmt(l.value)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ol className="grid [grid-template-columns:repeat(auto-fit,minmax(142px,1fr))] gap-2">
        {OFFER_STAGES.map((stage, i) => {
          const here = rows.filter((r) => (r.stage ?? 'pending_request') === stage);
          const amount = summary.byStage[stage].amount;
          const tone = toneFor(stage);
          const justMoved = here.some((r) => moved.ids.has(r.id));

          return (
            <li
              key={`${stage}-${moved.key}`}
              className={cn(
                'border-line flex min-h-[150px] flex-col gap-2.5 rounded-[14px] border p-3',
                here.length > 0 ? tone.soft : 'bg-surface-2',
                justMoved && 'wx-flash'
              )}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-muted text-[10px] font-bold tracking-[0.1em]">
                  Stage {i + 1}
                </span>
                <span aria-hidden className={cn('h-[3px] w-[22px] rounded-[2px]', tone.bar)} />
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-[13px] leading-[1.2] font-semibold">
                  {STAGE_META[stage].label}
                </p>
                <p className="text-muted text-[11px] leading-[1.3]">
                  {STAGE_META[stage].short}
                </p>
              </div>

              <div className="mt-auto flex flex-col gap-1.5">
                <p
                  className={cn(
                    'font-display text-[17px] font-semibold',
                    here.length === 0 && 'text-muted',
                    justMoved && 'wx-bump'
                  )}
                >
                  {/* An empty column says so in words. A "$0" there reads as a
                      job worth nothing rather than as no job at all. */}
                  {here.length === 0 ? 'Nothing here' : fmt(amount)}
                </p>

                {here.map((row) => (
                  <p
                    key={row.id}
                    className={cn(
                      'border-line bg-surface-1 rounded-lg border px-[7px] py-[5px] text-[11.5px] leading-[1.25]',
                      moved.ids.has(row.id) && 'wx-pop'
                    )}
                  >
                    {row.brand?.name ? `${row.brand.name}, ` : ''}
                    {row.offer?.title ?? 'an offer'}
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The same three buckets as the home screen, read as proportions of the total
 * rather than as three separate figures. One bar each, so "most of what I am
 * owed has not been earned out yet" is visible without doing the arithmetic.
 */
export function MoneySplit({ summary, moved }: { summary: WorkSummary; moved: Moved }) {
  const { paid, due, working, total, currency } = summary.money;
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency);
  const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const settled = summary.byStage.paid.count;

  const bars = [
    {
      key: 'paid',
      label: 'Paid',
      value: paid,
      tone: TONE.paid,
      sub: `${settled} ${settled === 1 ? 'job' : 'jobs'} settled`,
    },
    {
      key: 'due',
      label: 'Awaiting payment',
      value: due,
      tone: TONE.due,
      sub: 'stage 6, approved for payment',
    },
    {
      key: 'working',
      label: 'In progress',
      value: working,
      tone: TONE.working,
      sub: 'stages 1 to 5',
    },
  ];

  return (
    <section className="border-line bg-surface-1 flex flex-col gap-4 rounded-[20px] border p-5 shadow-md">
      <h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
        Where the money sits
      </h2>

      <p className="flex flex-wrap items-baseline gap-2.5">
        <span
          key={`total-${moved.key}`}
          className={cn(
            'font-display text-[clamp(32px,5vw,46px)] leading-none font-semibold tracking-[-0.03em]',
            moved.ids.size > 0 && 'wx-bump'
          )}
        >
          {fmt(total)}
        </span>
        <span className="text-muted text-[13px]">agreed with you</span>
      </p>

      <dl className="flex flex-col gap-3">
        {bars.map((bar) => (
          <div key={bar.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <dt className={cn('text-[13px] font-semibold', bar.tone.text)}>{bar.label}</dt>
              <dd
                key={`${bar.key}-${moved.key}`}
                className={cn(
                  'font-display text-[17px] font-semibold',
                  moved.ids.size > 0 && 'wx-bump'
                )}
              >
                {bar.value > 0 ? fmt(bar.value) : 'Nothing waiting'}
              </dd>
            </div>
            <div className="bg-surface-2 h-2 overflow-hidden rounded-full">
              <m.div
                initial={{ width: 0 }}
                animate={{ width: `${share(bar.value)}%` }}
                transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
                className={cn('h-full rounded-full', bar.tone.bar)}
              />
            </div>
            <dd className="text-muted text-[12px]">{bar.sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
