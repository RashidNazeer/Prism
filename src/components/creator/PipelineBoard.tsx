import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { OFFER_STAGES, STAGE_META, type OfferStage } from '@/lib/offer-stages';
import type { MyWorkRow, WorkSummary } from '@/lib/creator/useMyWork';
import type { JobProgress } from '@/lib/work/job-progress';

/**
 * The detail behind the money journey: all seven real stages, on one line.
 *
 * The Overview journey folds the pipeline onto four money stops. This keeps the
 * seven stages from `offer-stages.ts` and draws them the SAME way, so the two
 * tabs read as one idea at two zoom levels: a line, jobs sitting at whichever
 * stop they have reached, and stops with nothing in them collapsed to a thin
 * labelled marker instead of a full-height "Nothing here" card.
 *
 * It was seven equal columns, and on a real account six of them were empty. The
 * fault was equal visual weight for unequal content.
 *
 * Vertical below `xl` (a connector down the left, like the journey on a phone),
 * horizontal from `xl`, where seven stops finally have room. Nothing here is
 * interactive: the jobs are already on the line, so there is nothing to open.
 */

type Moved = { ids: Set<string>; key: number };

const TONE = {
  working: { text: 'text-stage-live', bar: 'bg-stage-live' },
  due: { text: 'text-stage-due', bar: 'bg-stage-due' },
  paid: { text: 'text-stage-paid', bar: 'bg-stage-paid' },
} as const;

const toneFor = (stage: OfferStage) => TONE[STAGE_META[stage].bucket];

export function PipelineBoard({
  summary,
  rows,
  moved,
  progress,
}: {
  summary: WorkSummary;
  rows: MyWorkRow[];
  moved: Moved;
  progress?: Map<string, JobProgress>;
}) {
  const { paid, due, working, total, currency } = summary.money;
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency);

  const legend = [
    { label: 'In progress', value: working, tone: TONE.working },
    { label: 'Awaiting payment', value: due, tone: TONE.due },
    { label: 'Paid', value: paid, tone: TONE.paid },
  ];

  const stops = OFFER_STAGES.map((stage, i) => {
    const jobs = rows.filter((r) => (r.stage ?? 'pending_request') === stage);
    return { stage, i, jobs, amount: summary.byStage[stage].amount };
  });

  /* How far the furthest job has got. The line fills up to there and no further. */
  const furthest = stops.reduce((at, s) => (s.jobs.length > 0 ? s.i : at), -1);

  /* Stops with work get three times the room of empty ones (xl only). */
  const cols = stops
    .map((s) => (s.jobs.length > 0 ? 'minmax(0,3fr)' : 'minmax(0,1fr)'))
    .join(' ');

  return (
    <section className="wx-neo-raised flex flex-col gap-5 rounded-2xl p-[clamp(1.125rem,2vw,1.5rem)]">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Your pipeline, stage by stage
          </h2>
          <p className="flex flex-wrap items-baseline gap-2">
            <span
              key={`total-${moved.key}`}
              className={cn(
                'font-brand wx-numeric text-[1.75rem] leading-none font-semibold',
                moved.ids.size > 0 && 'wx-bump'
              )}
            >
              {fmt(total)}
            </span>
            <span className="text-muted text-[0.8125rem]">agreed with you</span>
          </p>
        </div>

        {/* The three money states. Every stage belongs to exactly one, so these
            add up to the figure on the left. */}
        <dl className="flex flex-wrap gap-x-5 gap-y-2">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-[7px]">
              <span aria-hidden className={cn('size-[9px] rounded-[2px]', l.tone.bar)} />
              <dt className="text-muted text-[0.78125rem]">{l.label}</dt>
              <dd
                key={`${l.label}-${moved.key}`}
                className={cn(
                  'wx-numeric text-[0.8125rem] font-semibold',
                  moved.ids.size > 0 && 'wx-bump'
                )}
              >
                {fmt(l.value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <ol
        aria-label="The seven stages of your work"
        style={{ '--cols': cols } as CSSProperties}
        className="relative grid grid-cols-1 xl:[grid-template-columns:var(--cols)]"
      >
        {stops.map(({ stage, i, jobs, amount }) => {
          const meta = STAGE_META[stage];
          const Icon = meta.icon;
          const tone = toneFor(stage);
          const reached = i <= furthest;
          const here = jobs.length > 0;
          const justMoved = jobs.some((r) => moved.ids.has(r.id));
          const next = OFFER_STAGES[i + 1];

          return (
            <li
              key={`${stage}-${moved.key}`}
              className={cn(
                'relative grid grid-cols-[1.5rem_1fr] gap-x-3 pb-3 last:pb-0 xl:grid-cols-1 xl:gap-y-2 xl:pr-3 xl:pb-0',
                here && 'pb-4'
              )}
            >
              {i < stops.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-6 bottom-0 left-[0.6875rem] w-0.5 rounded-full xl:top-[0.6875rem] xl:right-0 xl:bottom-auto xl:left-6 xl:h-0.5 xl:w-auto',
                    i < furthest ? 'bg-accent' : 'bg-line'
                  )}
                />
              ) : null}

              <span
                aria-hidden
                className={cn(
                  'relative z-10 grid size-6 shrink-0 place-items-center rounded-full',
                  reached ? 'bg-accent text-on-accent' : 'wx-neo-inset text-muted',
                  i === furthest && 'ring-accent/40 ring-4'
                )}
              >
                {reached && !here ? <Check size={14} /> : <Icon size={13} />}
              </span>

              {here ? (
                <div
                  className={cn(
                    'wx-neo-inset flex min-w-0 flex-col gap-2.5 rounded-xl p-3',
                    justMoved && 'wx-flash'
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <p
                      className={cn(
                        'text-[0.6875rem] font-semibold tracking-[0.1em] uppercase',
                        tone.text
                      )}
                    >
                      {i + 1}. {meta.label}
                    </p>
                    <p
                      className={cn(
                        'font-brand wx-numeric text-[1.375rem] leading-none font-semibold',
                        justMoved && 'wx-bump'
                      )}
                    >
                      {jobs.some((r) => r.committed_amount === null) && amount === 0
                        ? 'To confirm'
                        : fmt(amount)}
                    </p>
                    <p className="text-muted text-[0.75rem] leading-[1.35]">
                      {meta.creatorHint}
                    </p>
                    {next ? (
                      <p className="text-muted text-[0.75rem] leading-[1.35]">
                        Next: <span className="text-text">{STAGE_META[next].label}</span>
                      </p>
                    ) : null}
                  </div>

                  <ul className="flex flex-col gap-2">
                    {jobs.map((row) => {
                      const p = progress?.get(row.id);
                      const pct =
                        p && p.required
                          ? Math.min(100, Math.round((p.approved / p.required) * 100))
                          : 0;
                      return (
                        <li
                          key={row.id}
                          className={cn(
                            'wx-neo-raised-sm flex flex-col gap-1.5 rounded-lg p-2.5',
                            moved.ids.has(row.id) && 'wx-pop'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-col">
                              <p className="text-muted truncate text-[0.6875rem] font-semibold tracking-[0.1em] uppercase">
                                {row.brand?.name ?? 'A brand'}
                              </p>
                              <p className="text-[0.8125rem] leading-[1.25] font-semibold break-words">
                                {row.offer?.title ?? 'An offer'}
                              </p>
                            </div>
                            <p className="font-display wx-numeric shrink-0 text-[0.9375rem] font-semibold whitespace-nowrap">
                              {row.committed_amount === null
                                ? 'To confirm'
                                : money(row.committed_amount, row.currency)}
                            </p>
                          </div>

                          {p && p.required !== null ? (
                            <div className="flex flex-col gap-1">
                              <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
                                <div
                                  className={cn(
                                    'h-full rounded-full',
                                    p.done ? 'bg-stage-paid' : 'bg-stage-live'
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p
                                className={cn(
                                  'wx-numeric text-[0.75rem] font-semibold',
                                  p.done ? 'text-stage-paid' : 'text-muted'
                                )}
                              >
                                {p.approved} of {p.required} videos approved
                              </p>
                            </div>
                          ) : null}

                          {moved.ids.has(row.id) ? (
                            <p className="text-stage-live text-[0.6875rem] font-semibold">
                              just now
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                /* An empty stop is a marker on the line, not a card. The words
                   are the label only; the one-line hint appears when stacked,
                   where there is room, and is dropped on the narrow desktop
                   columns. */
                <div className="flex min-h-6 min-w-0 flex-col justify-center gap-0.5 p-1">
                  <span className="text-muted text-[0.75rem] leading-[1.25] font-semibold">
                    {meta.label}
                  </span>
                  <span className="text-muted text-[0.6875rem] leading-[1.3] xl:hidden">
                    {meta.short}, nothing here
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
