import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { OFFER_STAGES, STAGE_META, type OfferStage } from '@/lib/offer-stages';
import type { MyWorkRow, WorkSummary } from '@/lib/creator/useMyWork';
import type { JobProgress } from '@/lib/work/job-progress';

/**
 * The detail behind the money journey: all seven real stages.
 *
 * The Overview journey folds the pipeline onto four money stops. This keeps the
 * seven stages from `offer-stages.ts` and draws them the SAME way, so the two
 * tabs read as one idea at two zoom levels.
 *
 * TWO PARTS, AND THAT SPLIT IS THE WHOLE POINT. `PipelineBoard` is the rail:
 * seven evenly spaced stops, each label under its own dot. `PipelineJobs` is
 * the work sitting on it. They used to be one thing, with the job card rendered
 * INSIDE its stop, and that was the bug. A stop holding a card got
 * `minmax(0,3fr)` while the empty ones got `1fr`, so the line between stop four
 * and stop five was three times longer than every other gap and the rail looked
 * broken. Worse, the occupied stop made the grid row as tall as its card, and
 * the six empty stops were one short label each, vertically centred in a band
 * of about 280px: roughly a thousand pixels of nothing across the middle of the
 * screen. Measured on a real creator account on 2026-10-09, which was the first
 * time anyone had seen this screen behind a creator login.
 *
 * So the rail now only ever draws dots and labels. Every stop is the same
 * width, so the line is even, and every stop is the same height, so there is
 * no band to fall into. The jobs go underneath in the golden frame, where a
 * card is allowed to be as tall as it needs to be.
 *
 * Nothing here is interactive: the jobs are already on the line below, so
 * there is nothing to open.
 *
 * Deliberately ASCII only. An earlier revision held the empty stops open with a
 * non-breaking space, the file was round-tripped through the shell, and every
 * non-ASCII character in it was re-encoded: six stops rendered a literal "A"
 * with a circumflex, and the em dashes in this comment turned to line noise.
 * Nothing invisible, nothing to corrupt.
 */

type Moved = { ids: Set<string>; key: number };

const TONE = {
  working: { text: 'text-stage-live', bar: 'bg-stage-live' },
  due: { text: 'text-stage-due', bar: 'bg-stage-due' },
  paid: { text: 'text-stage-paid', bar: 'bg-stage-paid' },
} as const;

const toneFor = (stage: OfferStage) => TONE[STAGE_META[stage].bucket];

/** Where each stop stands, worked out once and shared by both parts. */
function stopsFor(summary: WorkSummary, rows: MyWorkRow[]) {
  const stops = OFFER_STAGES.map((stage, i) => {
    const jobs = rows.filter((r) => (r.stage ?? 'pending_request') === stage);
    return { stage, i, jobs, amount: summary.byStage[stage].amount };
  });
  /* How far the furthest job has got. The line fills up to there and no further. */
  const furthest = stops.reduce((at, s) => (s.jobs.length > 0 ? s.i : at), -1);
  return { stops, furthest };
}

/* ------------------------------------------------------------------ rail --- */

export function PipelineBoard({
  summary,
  rows,
  moved,
}: {
  summary: WorkSummary;
  rows: MyWorkRow[];
  moved: Moved;
}) {
  const { paid, due, working, total, currency } = summary.money;
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency);
  const { stops, furthest } = stopsFor(summary, rows);

  const legend = [
    { label: 'In progress', value: working, tone: TONE.working },
    { label: 'Awaiting payment', value: due, tone: TONE.due },
    { label: 'Paid', value: paid, tone: TONE.paid },
  ];

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

      {/*
        Seven equal columns from `md`, a vertical list below it. Equal is not a
        style choice here: unequal columns are what made the line look broken,
        and a rail that lies about distance is worse than no rail.
      */}
      <ol
        aria-label="The seven stages of your work"
        className="grid grid-cols-1 gap-y-1 md:grid-cols-7 md:gap-y-0"
      >
        {stops.map(({ stage, i, jobs, amount }) => {
          const meta = STAGE_META[stage];
          const Icon = meta.icon;
          const tone = toneFor(stage);
          const reached = i <= furthest;
          const here = jobs.length > 0;
          const justMoved = jobs.some((r) => moved.ids.has(r.id));
          const last = i === stops.length - 1;

          return (
            <li
              key={`${stage}-${moved.key}`}
              aria-current={i === furthest ? 'step' : undefined}
              className={cn(
                'relative grid grid-cols-[1.5rem_1fr] items-start gap-x-3 pb-3 last:pb-0',
                'md:grid-cols-1 md:justify-items-center md:gap-y-2 md:pb-0 md:text-center'
              )}
            >
              {/* The connector. Vertically it runs down from this dot; from `md`
                  it runs sideways, and because every column is the same width,
                  a full column width is exactly the distance to the next dot. */}
              {!last ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-6 bottom-0 left-[0.6875rem] w-0.5 rounded-full',
                    'md:top-[0.6875rem] md:bottom-auto md:left-1/2 md:h-0.5 md:w-full',
                    i < furthest ? 'bg-accent' : 'bg-line'
                  )}
                />
              ) : null}

              <span
                aria-hidden
                className={cn(
                  'relative z-10 grid size-6 shrink-0 place-items-center rounded-full',
                  reached ? 'bg-accent text-on-accent' : 'wx-neo-inset text-muted',
                  i === furthest && 'ring-accent/40 ring-4',
                  justMoved && 'wx-pop'
                )}
              >
                {reached && !here ? <Check size={14} /> : <Icon size={13} />}
              </span>

              <div className="flex min-w-0 flex-col gap-0.5 md:items-center">
                <span
                  className={cn(
                    'text-[0.75rem] leading-[1.25] font-semibold',
                    here ? 'text-text' : 'text-muted'
                  )}
                >
                  {meta.label}
                </span>

                {/*
                  One line is always reserved, so all seven stops are the same
                  height and the labels sit on one baseline. An empty stop says
                  nothing rather than "nothing here" six times over.

                  The line is held open by `min-h` alone. `min-height` does not
                  apply to an inline element, which is why a non-breaking space
                  was here before, but this span is a flex item of the column
                  above it, so the height applies and no character is needed.
                */}
                <span
                  className={cn(
                    'wx-numeric min-h-[1.0625rem] text-[0.75rem] leading-[1.0625rem] font-semibold',
                    here ? tone.text : 'text-subtle'
                  )}
                >
                  {here
                    ? jobs.some((r) => r.committed_amount === null) && amount === 0
                      ? 'To confirm'
                      : fmt(amount)
                    : null}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ jobs --- */

/**
 * The work itself, at whatever stop it has reached.
 *
 * Only stops that HAVE something are drawn. Seven headings, six of them saying
 * nothing, is the wall of empty boxes this screen used to be.
 */
export function PipelineJobs({
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
  const { currency } = summary.money;
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency);
  const { stops } = stopsFor(summary, rows);
  const occupied = stops.filter((s) => s.jobs.length > 0);

  if (occupied.length === 0) {
    return (
      <section className="wx-neo-raised flex flex-col gap-1.5 rounded-2xl p-[clamp(1.125rem,2vw,1.5rem)]">
        <h2 className="text-[0.9375rem] font-semibold">Nothing on the line yet</h2>
        <p className="text-muted text-[0.8125rem] leading-[1.45]">
          When a brand takes you on, the job appears here and moves along the stages above as it
          goes. Nothing is hidden from you on the way.
        </p>
      </section>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      {occupied.map(({ stage, i, jobs, amount }) => {
        const meta = STAGE_META[stage];
        const tone = toneFor(stage);
        const next = OFFER_STAGES[i + 1];
        const justMoved = jobs.some((r) => moved.ids.has(r.id));

        return (
          <section
            key={`${stage}-${moved.key}`}
            className={cn(
              'wx-neo-raised flex min-w-0 flex-col gap-3 rounded-2xl p-[clamp(1.125rem,2vw,1.5rem)]',
              justMoved && 'wx-flash'
            )}
          >
            <div className="flex flex-col gap-0.5">
              <h2
                className={cn(
                  'text-[0.6875rem] font-semibold tracking-[0.1em] uppercase',
                  tone.text
                )}
              >
                {i + 1}. {meta.label}
              </h2>
              <p className="flex flex-wrap items-baseline gap-2">
                <span
                  className={cn(
                    'font-brand wx-numeric text-[1.375rem] leading-none font-semibold',
                    justMoved && 'wx-bump'
                  )}
                >
                  {jobs.some((r) => r.committed_amount === null) && amount === 0
                    ? 'To confirm'
                    : fmt(amount)}
                </span>
                <span className="text-muted text-[0.8125rem] leading-[1.35]">
                  {meta.creatorHint}
                </span>
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
                      'wx-neo-inset flex flex-col gap-1.5 rounded-xl p-3',
                      moved.ids.has(row.id) && 'wx-pop'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
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
                      <p className="text-stage-live text-[0.6875rem] font-semibold">just now</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
