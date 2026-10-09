import { useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { DailyPerformance } from '@/lib/creator/usePerformance';

/**
 * One number a day, drawn as the mark that tells the truth about it.
 *
 * BARS FOR AMOUNTS, A LINE FOR A RATE. This is the whole design of this file.
 *
 * GMV, ad spend and orders are DISCRETE DAILY TOTALS. Each day stands alone:
 * nothing flows from Tuesday into Wednesday. A line between them draws slopes
 * that never happened, and on a real account it is not a subtle error. Rashid's
 * ad spend is $0.35 on one day, $0.17 on another and nothing on the fifty days
 * between; the line version glided smoothly down across seven week labels and
 * read as a gradual wind-down. It was a picture of a trend that did not exist.
 * Bars cannot tell that lie: each day is its own column and an empty day is
 * visibly empty.
 *
 * ROI is the exception, and the reason the choice is per metric rather than a
 * setting. It is a RATE, not an amount. Days do not add up to a total ROI, and
 * what anybody reads off it is direction, which is the one thing a line is for.
 *
 * ONE SERIES, ONE SCALE. An earlier draft drew order volume as bars behind
 * whichever money line was selected, which meant two scales on one chart. Two
 * scales can be made to cross wherever the scaling happens to put them, and a
 * reader has no way to know. Orders have their own tab; nothing is lost and the
 * second axis is gone.
 *
 * THE RAMP IS TIME. Oldest bar magenta, newest bar cyan, stepping through the
 * four kit accents in the order the brand guidelines fix them: magenta, violet,
 * blue, cyan, "use them in this order whenever they appear together". Cyan is
 * the kit's growth colour, so the newest day landing on it is the right way
 * round and not an arbitrary choice.
 *
 * This is REDUNDANT encoding, which is what makes it safe. The x-axis already
 * says which bar is older; the colour repeats it. Nobody has to tell two hues
 * apart to read the chart, because the position already told them. An earlier
 * draft of this file claimed the gradient meant nothing at all, which stopped
 * being true the moment it was keyed to recency, so the legend now says what it
 * means rather than leaving a reader to guess.
 *
 * The moment two SERIES need separating they get two distinct hues and direct
 * labels instead, which is what `PerformanceChart` does. A ramp can encode an
 * ordered thing like time; it cannot encode identity.
 *
 * INLINE SVG, no charting library: the stack is locked, and the marks obey the
 * same tokens as everything else. The plot is pure marks with
 * `preserveAspectRatio="none"` so it fills any width; strokes carry
 * `vector-effect="non-scaling-stroke"` so they do not stretch with it, and
 * anything that must stay round is an HTML element laid over the top.
 *
 * Axis labels are HTML, not `<text>`: every type size here is a rem and follows
 * the reader's own setting, and text inside a scaled viewBox cannot.
 */

export type VelocityMetric = 'gmv' | 'spend' | 'orders' | 'roi';

const VB_W = 760;
const VB_H = 240;

/**
 * The spectrum ramp, as CSS. Written once because the bars, the line and the
 * legend swatch must all be the same ramp: a legend that does not match its
 * marks is worse than no legend.
 */
const RAMP =
  'linear-gradient(90deg, var(--wx-chart-1) 0%, var(--wx-chart-2) 38%, var(--wx-chart-3) 70%, var(--wx-chart-4) 100%)';

/** A rate is a line; an amount is a bar. The only rule in here. */
export const shapeFor = (m: VelocityMetric): 'line' | 'bars' => (m === 'roi' ? 'line' : 'bars');

const valueOf = (r: DailyPerformance, m: VelocityMetric): number => {
  const cost = Number(r.cost);
  const gmv = Number(r.gross_revenue);
  if (m === 'gmv') return gmv;
  if (m === 'spend') return cost;
  if (m === 'orders') return Number(r.orders);
  return cost > 0 ? gmv / cost : 0;
};

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * A round ceiling, so the gridline labels are numbers a person would say.
 * Zero everywhere still has to produce a usable axis, hence the floor of 1.
 */
function ceilingFor(max: number) {
  if (max <= 0) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / step) * step;
}

type Pt = { x: number; y: number };

/**
 * Catmull-Rom through the points, written as cubic beziers.
 *
 * Clamped into the plot box on both sides: an un-clamped spline overshoots
 * after a spike and draws a curve dipping below zero, which is a number that
 * did not happen.
 */
function smoothPath(pts: Pt[]): string {
  const first = pts[0];
  if (!first) return '';
  if (pts.length === 1) return `M ${first.x} ${first.y}`;
  const clamp = (v: number) => (v < 0 ? 0 : v > VB_H ? VB_H : v);

  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (!p1 || !p2) continue;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function VelocityChart({
  rows,
  metric,
  formatValue,
  seriesLabel,
}: {
  rows: DailyPerformance[];
  metric: VelocityMetric;
  /**
   * The card owns formatting, so the axis and the figure above it can never
   * disagree, and the chart never needs to know about currency at all.
   */
  formatValue: (n: number) => string;
  seriesLabel: string;
}) {
  const uid = useId().replace(/:/g, '');
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const shape = shapeFor(metric);

  const model = useMemo(() => {
    if (rows.length === 0) return null;

    const values = rows.map((r) => valueOf(r, metric));
    const ceiling = ceilingFor(Math.max(...values, 0));

    /*
     * BARS SIT IN A SLOT, A LINE SITS ON A POINT. A bar occupies a day, so it
     * is centred in one of n equal slots and the first and last are inset by
     * half a slot. A line point IS the day, so it sits on the edge. Using one
     * rule for both puts the last bar half outside the plot.
     */
    const slot = VB_W / rows.length;
    const x =
      shape === 'bars'
        ? (i: number) => i * slot + slot / 2
        : (i: number) => (rows.length === 1 ? VB_W / 2 : (i / (rows.length - 1)) * VB_W);
    const y = (v: number) => VB_H - (v / ceiling) * VB_H;

    const pts: Pt[] = values.map((v, i) => ({ x: x(i), y: y(v) }));
    const line = shape === 'line' ? smoothPath(pts) : '';
    const last = pts[pts.length - 1];
    const area =
      line && last ? `${line} L ${last.x} ${VB_H} L ${pts[0]?.x ?? 0} ${VB_H} Z` : '';

    /* The best day on this series, which is what the pill names. */
    let peak = -1;
    values.forEach((v, i) => {
      const best = values[peak];
      if (v > 0 && (peak === -1 || best === undefined || v > best)) peak = i;
    });

    /*
     * WHERE EACH BAR SITS ON THE COLOUR RAMP: its rank among the days that
     * actually have a bar, NOT its position on the calendar.
     *
     * Spreading the ramp over the calendar is the obvious reading and it fails
     * on real data. Rashid's ad spend lands on days 0, 1 and 4 of a 56 day
     * window, so by calendar all three sit inside the first 7% of the ramp and
     * paint as three shades of magenta: exactly the "these look the same"
     * complaint. By rank the three bars take the whole ramp, magenta to cyan,
     * and oldest and newest are unmistakable.
     *
     * The order is still strictly the order of time, which is what the colour
     * claims. It is an ORDINAL scale, not a measurement: the gap in hue between
     * two bars says which came first, never how many days apart they were. The
     * x-axis is what answers that, and it is right there underneath.
     */
    const ranks = new Map<number, number>();
    values.forEach((v, i) => {
      if (v > 0) ranks.set(i, ranks.size);
    });

    return {
      values,
      ceiling,
      x,
      y,
      line,
      area,
      barW: Math.max(1.5, slot * 0.6),
      ranks,
      peak,
      allZero: values.every((v) => v === 0),
      ticks: [ceiling, ceiling / 2, 0],
    };
  }, [rows, metric, shape]);

  if (!model) return null;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const t = (e.clientX - rect.left) / rect.width;
    /* Hit testing matches the mark: a slot for bars, a point for a line. */
    const i =
      shape === 'bars' ? Math.floor(t * rows.length) : Math.round(t * (rows.length - 1));
    setHover(i >= 0 && i < rows.length ? i : null);
  };

  const activeIndex = hover ?? (model.peak >= 0 ? model.peak : null);
  const active = activeIndex === null ? null : rows[activeIndex];
  const pct = (i: number) => (model.x(i) / VB_W) * 100;
  /* Dates under the plot: never more than about eight, so they cannot collide. */
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* The swatch is the same ramp as the marks, and the words say what the
            ramp means. Colour that carries meaning without a key is decoration
            that a reader is left to decode. */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem]">
          <span className="text-muted">
            {seriesLabel}
            {shape === 'bars' ? ' a day' : ' over time'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-subtle text-[0.6875rem]">oldest</span>
            <span
              aria-hidden
              className="inline-block h-2 w-10 rounded-full"
              style={{ backgroundImage: RAMP }}
            />
            <span className="text-subtle text-[0.6875rem]">newest</span>
          </span>
        </span>

        {model.peak >= 0 && !model.allZero ? (
          <span className="wx-neo-inset text-muted rounded-full px-3 py-1 text-[0.75rem]">
            Best day{' '}
            <span className="text-text font-semibold">
              {shortDate(rows[model.peak]?.stat_date ?? '')}
            </span>{' '}
            <span className="wx-numeric text-text font-semibold">
              {formatValue(model.values[model.peak] ?? 0)}
            </span>
          </span>
        ) : null}
      </figcaption>

      {model.allZero ? (
        /* A designed empty state, not an axis with a flat line on it. A flat
           line at zero reads as "we measured nothing", which is a different
           claim from "nothing has happened yet". */
        <div className="wx-neo-inset text-muted grid min-h-[12rem] place-items-center rounded-xl px-6 text-center text-[0.8125rem] leading-[1.5]">
          <span>
            No {seriesLabel.toLowerCase()} recorded in this period yet.
            <br />
            The day your videos start selling, this fills in.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
          <div
            aria-hidden
            className="text-subtle flex flex-col justify-between text-right text-[0.6875rem] leading-none"
            style={{ height: 'var(--plot-h)' }}
          >
            {model.ticks.map((t) => (
              <span key={t} className="wx-numeric">
                {formatValue(t)}
              </span>
            ))}
          </div>

          <div
            ref={plotRef}
            role="img"
            aria-label={`${seriesLabel} by day`}
            className="relative touch-pan-y"
            style={{ height: 'var(--plot-h)' }}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
            >
              <defs>
                <linearGradient id={`${uid}-ramp`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--wx-chart-1)" />
                  <stop offset="38%" stopColor="var(--wx-chart-2)" />
                  <stop offset="70%" stopColor="var(--wx-chart-3)" />
                  <stop offset="100%" stopColor="var(--wx-chart-4)" />
                </linearGradient>
                <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--wx-chart-3)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--wx-chart-3)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Gridlines at the labelled ticks, and nowhere else. */}
              {model.ticks.map((t) => (
                <line
                  key={t}
                  x1={0}
                  x2={VB_W}
                  y1={model.y(t)}
                  y2={model.y(t)}
                  stroke="var(--wx-chart-grid)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {shape === 'line' ? (
                <>
                  <path d={model.area} fill={`url(#${uid}-fill)`} />
                  <path
                    d={model.line}
                    fill="none"
                    stroke={`url(#${uid}-ramp)`}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              ) : null}

              {activeIndex !== null && shape === 'line' ? (
                <line
                  x1={model.x(activeIndex)}
                  x2={model.x(activeIndex)}
                  y1={0}
                  y2={VB_H}
                  stroke="var(--wx-chart-grid)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>

            {/*
              THE BARS ARE HTML, NOT SVG, AND THAT IS WHY THEY ARE ROUND.
              The plot stretches to any width with `preserveAspectRatio="none"`,
              which scales x and y by different amounts. An SVG `rx` goes with
              it, so a 2px corner came out as a 2x4px ellipse at one width and
              something else at another: bars that were meant to be pills looked
              shaved. An HTML element's `border-radius` is resolved against its
              own real box, so a pill is a pill at every width. The kit asks for
              full pills on chart bars, and this is the only way to keep that
              promise inside a stretched viewBox.

              The spectrum runs across the WHOLE plot, not across each bar. Each
              bar paints one slice of a single gradient: the background is sized
              to the full plot width and offset to the bar's own position, which
              is the standard way to window a shared gradient in pure
              percentages. Painting the ramp into every bar would give each one
              its own rainbow and make the colour mean something per bar, which
              it must not.
            */}
            {shape === 'bars' ? (
              <div aria-hidden className="pointer-events-none absolute inset-0">
                {model.values.map((v, i) => {
                  if (v <= 0) return null;
                  const n = model.ranks.size;
                  const rank = model.ranks.get(i) ?? 0;
                  const wPct = (model.barW / VB_W) * 100;
                  /* Centred on the day, so capping the width keeps the bar on
                     its own tick instead of sliding it off to the left. */
                  const centrePct = (model.x(i) / VB_W) * 100;
                  /* One bar has no older and no newer, so a ramp would be
                     meaningless on it. It takes the primary accent flat. */
                  const ramp =
                    n > 1
                      ? {
                          backgroundImage: RAMP,
                          backgroundSize: `${n * 100}% 100%`,
                          backgroundPositionX: `${(rank / (n - 1)) * 100}%`,
                        }
                      : { backgroundColor: 'var(--wx-chart-2)' };
                  return (
                    <span
                      key={rows[i]?.stat_date ?? i}
                      /*
                        FULL PILLS. The kit says so, and Rashid asked for it
                        again on 2026-10-10 after seeing a flat-bottomed
                        version.

                        What it costs, so nobody rediscovers it as a bug: once
                        a day's height falls to around the bar width, a full
                        pill reads as a dot sitting on the axis rather than as
                        a bar. Nothing is misreported when that happens, the
                        top of the mark is still at the true value, it just
                        stops looking like a column. It is a deliberate trade
                        for the kit's shape, not an oversight.
                      */
                      className="absolute bottom-0 -translate-x-1/2 rounded-full transition-opacity"
                      style={{
                        left: `${centrePct}%`,
                        /*
                          A SHARE OF THE SLOT, UP TO A CEILING.
                          The share alone is right for a dense range and absurd
                          for a short one: it is a fraction of plot width over
                          day count, so seven days across a 1470px plot gave
                          210px slots and 143px bars. With `rounded-full` on top
                          that is a 71px corner radius, and the chart came out
                          as a row of lozenges rather than bars. The ceiling is
                          in rem, so it follows the reader's text size like
                          everything else, and the share still governs dense
                          ranges where it is the sensible rule.
                        */
                        width: `${wPct}%`,
                        maxWidth: '3.25rem',
                        height: `${(v / model.ceiling) * 100}%`,
                        minHeight: '0.1875rem',
                        /*
                          Dimming keys off `hover`, NOT off `activeIndex`.
                          `activeIndex` falls back to the best day so the
                          tooltip has something to say at rest, and keying the
                          opacity to it meant that at rest every bar except the
                          peak sat at half strength: the whole chart arrived
                          looking washed out and the colours Rashid asked for
                          were unreadable. Bars fade only while a pointer is
                          actually picking one out.
                        */
                        opacity: hover === null || hover === i ? 1 : 0.45,
                        ...ramp,
                      }}
                    />
                  );
                })}
              </div>
            ) : null}

            {/* Round things live in HTML, so the stretched viewBox cannot oval them. */}
            {activeIndex !== null && shape === 'line' ? (
              <span
                aria-hidden
                className="bg-surface-1 border-accent pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                style={{
                  left: `${pct(activeIndex)}%`,
                  top: `${(model.y(model.values[activeIndex] ?? 0) / VB_H) * 100}%`,
                }}
              />
            ) : null}

            {active ? (
              <div
                className={cn(
                  'wx-neo-raised pointer-events-none absolute top-1 z-10 flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 whitespace-nowrap',
                  pct(activeIndex ?? 0) > 60 && '-translate-x-full'
                )}
                style={{ left: `${pct(activeIndex ?? 0)}%` }}
              >
                <span className="text-muted text-[0.6875rem] leading-none font-semibold tracking-[0.08em] uppercase">
                  {shortDate(active.stat_date)}
                </span>
                <span className="wx-numeric text-[0.875rem] leading-none font-semibold">
                  {formatValue(model.values[activeIndex ?? 0] ?? 0)}
                </span>
              </div>
            ) : null}
          </div>

          <div />
          {/*
            EACH DATE SITS UNDER ITS OWN MARK, not spread edge to edge.

            This was a flex row with `justify-between`, which distributes
            labels evenly across the full width regardless of where the marks
            actually are. For a line that happens to be right, because line
            points also run edge to edge. For bars it is wrong: bars are
            centred in slots and inset by half a slot, so on a real account
            "Oct 1" sat at the far left while its bar stood 100px inboard, and
            every label named the wrong column. Positioning from the same `x()`
            the marks use means the two cannot drift apart again.
          */}
          <div className="text-subtle relative mt-1.5 h-4 text-[0.6875rem] leading-none">
            {rows.map((r, i) => {
              if (i % labelEvery !== 0 && i !== rows.length - 1) return null;
              const at = (model.x(i) / VB_W) * 100;
              /* A label centred on an edge mark would hang outside the plot,
                 so the first and last pull in against their own edge. */
              const shift = at < 4 ? '0' : at > 96 ? '-100%' : '-50%';
              return (
                <span
                  key={r.stat_date}
                  className="wx-numeric absolute top-0 whitespace-nowrap"
                  style={{ left: `${at}%`, transform: `translateX(${shift})` }}
                >
                  {shortDate(r.stat_date)}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </figure>
  );
}
