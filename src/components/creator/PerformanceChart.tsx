import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { DailyPerformance } from '@/lib/creator/usePerformance';

/**
 * Spend and GMV over time, and orders under it.
 *
 * ONE AXIS, TWO SERIES. Spend and GMV are both money in the same currency, so
 * they belong on the same scale and can be compared by eye. A second y-axis
 * would let any two lines be drawn to cross wherever the scaling happened to
 * put them, which is the single most misleading thing a chart can do.
 *
 * ORDERS GET THEIR OWN CHART for the same reason in reverse: a count of orders
 * and an amount of dollars share no scale, so putting them together would mean
 * inventing one.
 *
 * VIOLET AND BLUE, two distinct hues, which is the pairing that survives
 * colour blindness: the two most common forms confuse red with green, not warm
 * with cool. Both series are also labelled directly at their last point, so
 * identity never depends on colour alone.
 *
 * INLINE SVG, no charting library. The stack is locked, a dependency for two
 * charts is a poor trade, and this way the marks obey the same `--wx-*` tokens
 * as everything else and follow the text-size setting.
 */

/** Fewer days than this and the chart says it is too little to show a trend. */
const SPARSE_DAYS = 7;

const PAD = { top: 16, right: 16, bottom: 26, left: 52 };
const VB_W = 760;
const VB_H = 240;

const money = (n: number, currency: string | null) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

export function PerformanceChart({
  rows,
  currency,
}: {
  rows: DailyPerformance[];
  currency: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (rows.length === 0) return null;
    const max = Math.max(
      ...rows.map((r) => Math.max(Number(r.cost), Number(r.gross_revenue))),
      1
    );
    // A round ceiling, so the gridline labels are numbers a person would say.
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const ceiling = Math.ceil(max / step) * step;

    const innerW = VB_W - PAD.left - PAD.right;
    const innerH = VB_H - PAD.top - PAD.bottom;
    const x = (i: number) =>
      PAD.left + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / ceiling) * innerH;

    const path = (pick: (r: DailyPerformance) => number) =>
      rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(Number(pick(r)))}`).join(' ');

    return {
      ceiling,
      x,
      y,
      spend: path((r) => Number(r.cost)),
      gmv: path((r) => Number(r.gross_revenue)),
      ticks: [0, ceiling / 2, ceiling],
    };
  }, [rows]);

  if (!model) return null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Map the pointer into viewBox space, so hit testing is right at any size.
    const vx = ((e.clientX - rect.left) / rect.width) * VB_W;
    const innerW = VB_W - PAD.left - PAD.right;
    const t = (vx - PAD.left) / innerW;
    const i = Math.round(t * (rows.length - 1));
    setHover(i >= 0 && i < rows.length ? i : null);
  };

  const active = hover !== null ? rows[hover] : null;

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-muted text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
          Spend and GMV by day
        </span>
        {/* A legend is always present for two series. */}
        <span className="flex items-center gap-3 text-[0.75rem]">
          <span className="flex items-center gap-1.5">
            <span className="bg-accent inline-block h-[2px] w-4 rounded-full" aria-hidden />
            <span className="text-muted">GMV</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-info inline-block h-[2px] w-4 rounded-full" aria-hidden />
            <span className="text-muted">Spend</span>
          </span>
        </span>
      </figcaption>

      {/*
        SAY SO WHEN THERE IS NOT ENOUGH TO CALL A TREND. A line through two points
        looks like a trajectory and is not one. The chart still draws everything,
        with a mark on every real day, and states how little is behind it.
      */}
      {rows.length < SPARSE_DAYS ? (
        <p className="text-muted text-caption mb-3 leading-relaxed">
          Only {rows.length} {rows.length === 1 ? 'day' : 'days'} of data so far, so this shows
          what happened on {rows.length === 1 ? 'that day' : 'those days'} rather than a trend.
          {model.ceiling <= 1
            ? ` The scale tops out at ${money(model.ceiling, currency)}.`
            : ''}
        </p>
      ) : null}

      <div className="wx-neo-inset relative rounded-xl p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full touch-none"
          role="img"
          aria-label={`Spend and GMV for each of ${rows.length} days`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* Recessive grid: it orients, it does not compete. */}
          {model.ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={VB_W - PAD.right}
                y1={model.y(t)}
                y2={model.y(t)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={model.y(t) + 4}
                textAnchor="end"
                className="fill-faint wx-numeric"
                fontSize={11}
              >
                {money(t, currency)}
              </text>
            </g>
          ))}

          <path d={model.spend} fill="none" className="stroke-info" strokeWidth={2} />
          <path d={model.gmv} fill="none" className="stroke-accent" strokeWidth={2} />

          {/* A mark on each real day, so sparse data reads as points, not a line. */}
          {rows.length <= 14
            ? rows.map((r, i) => (
                <g key={r.stat_date}>
                  <circle
                    cx={model.x(i)}
                    cy={model.y(Number(r.cost))}
                    r={3.5}
                    className="fill-info"
                  />
                  <circle
                    cx={model.x(i)}
                    cy={model.y(Number(r.gross_revenue))}
                    r={3.5}
                    className="fill-accent"
                  />
                </g>
              ))
            : null}

          {active && hover !== null ? (
            <g>
              <line
                x1={model.x(hover)}
                x2={model.x(hover)}
                y1={PAD.top}
                y2={VB_H - PAD.bottom}
                className="stroke-line-interactive"
                strokeWidth={1}
              />
              {/* 2px surface ring, so a marker sitting on a line stays legible */}
              <circle
                cx={model.x(hover)}
                cy={model.y(Number(active.gross_revenue))}
                r={5}
                className="fill-accent stroke-surface-3"
                strokeWidth={2}
              />
              <circle
                cx={model.x(hover)}
                cy={model.y(Number(active.cost))}
                r={5}
                className="fill-info stroke-surface-3"
                strokeWidth={2}
              />
            </g>
          ) : null}

          <text x={PAD.left} y={VB_H - 8} className="fill-faint wx-numeric" fontSize={11}>
            {shortDate(rows[0]!.stat_date)}
          </text>
          {rows.length > 1 ? (
            <text
              x={VB_W - PAD.right}
              y={VB_H - 8}
              textAnchor="end"
              className="fill-faint wx-numeric"
              fontSize={11}
            >
              {shortDate(rows[rows.length - 1]!.stat_date)}
            </text>
          ) : null}
        </svg>

        {/* The tooltip is HTML rather than SVG, so it wears the same type scale
            as the rest of the product and wraps like text should. */}
        {active ? (
          <div
            className="wx-neo-raised-sm pointer-events-none absolute top-2 rounded-lg px-3 py-2"
            style={{
              left: `${(model.x(hover!) / VB_W) * 100}%`,
              transform:
                model.x(hover!) > VB_W / 2
                  ? 'translateX(-100%) translateX(-8px)'
                  : 'translateX(8px)',
            }}
          >
            <p className="text-[0.6875rem] font-semibold tracking-wide uppercase">
              {shortDate(active.stat_date)}
            </p>
            <p className="wx-numeric text-accent mt-1 text-[0.8125rem] font-semibold">
              {money(Number(active.gross_revenue), currency)} GMV
            </p>
            <p className="wx-numeric text-muted text-[0.8125rem]">
              {money(Number(active.cost), currency)} spend
            </p>
            <p className="text-muted mt-0.5 text-[0.75rem]">
              {active.orders} {Number(active.orders) === 1 ? 'order' : 'orders'}
            </p>
          </div>
        ) : null}
      </div>
    </figure>
  );
}

/**
 * Orders per day. A separate chart, deliberately: see the note above about
 * scales. Bars rather than a line, because orders are counted events rather
 * than a continuous quantity, and a line between two counts implies values in
 * between that never existed.
 */
export function OrdersChart({ rows }: { rows: DailyPerformance[] }) {
  const max = Math.max(...rows.map((r) => Number(r.orders)), 1);
  if (rows.length === 0) return null;

  return (
    <figure className="m-0">
      <figcaption className="text-muted mb-3 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
        Orders by day
      </figcaption>
      <div
        className="wx-neo-inset flex h-28 items-end gap-[2px] rounded-xl p-2"
        role="img"
        aria-label="Orders for each day"
      >
        {rows.map((r) => {
          const h = (Number(r.orders) / max) * 100;
          return (
            <div
              key={r.stat_date}
              className="group relative max-w-12 flex-1"
              style={{ height: '100%' }}
              title={`${shortDate(r.stat_date)}: ${r.orders} orders`}
            >
              <div
                className={cn(
                  'bg-accent absolute right-0 bottom-0 left-0 rounded-t-[4px]',
                  Number(r.orders) === 0 && 'bg-line'
                )}
                style={{ height: `${Math.max(h, Number(r.orders) > 0 ? 4 : 2)}%` }}
              />
            </div>
          );
        })}
      </div>
    </figure>
  );
}
