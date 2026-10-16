import { cn } from '@/lib/utils';
import {
  allMissing,
  areaPaths,
  exactMoney,
  linePaths,
  maxOf,
  NOT_REPORTED,
  scale,
  useChartBox,
  useChartHover,
  type ChartPoint,
} from './chart-kit';
import { ChartTip } from './ChartTip';

/**
 * A TREND, WITH NO AXES AND NO GRID. The widget title is the legend.
 *
 * Used for GMV on Home and for the fourth metric. The gradient under the line
 * decays from 15% of the series colour at the apex to nothing at the baseline,
 * which is the Stitch reference's own figure.
 *
 * The line BREAKS over days we have no figure for — see `linePaths`. That is
 * the whole reason these charts are hand-drawn: a library would join across
 * the gap and quietly claim a measurement we never took.
 */
export function SparkArea({
  data,
  token = '--chart-1',
  currency = null,
  ariaLabel,
  money = true,
  className,
  height = '3.5rem',
}: {
  data: ChartPoint[];
  /** Which chart slot this series wears. Read live, so themes switch cleanly. */
  token?: string;
  currency?: string | null;
  /** Says what the chart shows IN WORDS, e.g. "GMV over 30 days, up 12%". */
  ariaLabel: string;
  /** False for counts (views, orders) so the tooltip does not invent a currency. */
  money?: boolean;
  className?: string;
  height?: string;
}) {
  const [ref, box] = useChartBox();
  const { at, setAt, svgRef, onMove } = useChartHover(data.length);

  const empty = allMissing(data);
  const stroke = Math.max(1, 0.1375 * box.rem); // 2.2px at a 16px root
  const pad = stroke; // keep the cap inside the box at both ends
  const max = maxOf(data);
  const x = scale([0, Math.max(1, data.length - 1)], [pad, Math.max(pad, box.w - pad)]);
  const y = scale([0, max || 1], [box.h - pad, pad]);

  const pts = data.map((p, i) => ({ x: x(i), y: p.value === null ? null : y(p.value) }));
  const id = `sa-${token.replace(/[^a-z0-9]/gi, '')}`;
  const shown = at === null ? null : data[at];

  return (
    <div ref={ref} className={cn('relative w-full', className)} style={{ height }}>
      {empty ? (
        <EmptyTrack />
      ) : (
        box.w > 0 && (
          <svg
            ref={svgRef}
            width={box.w}
            height={box.h}
            role="img"
            aria-label={ariaLabel}
            className="block touch-pan-y"
            onPointerMove={(e) => onMove(e, pad, box.w - pad)}
            onPointerLeave={() => setAt(null)}
          >
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: `var(${token})`, stopOpacity: 0.15 }} />
                <stop offset="100%" style={{ stopColor: `var(${token})`, stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {areaPaths(pts, box.h - pad).map((d, i) => (
              <path key={`a${i}`} d={d} fill={`url(#${id})`} />
            ))}
            {linePaths(pts).map((d, i) => (
              <path
                key={`l${i}`}
                d={d}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ stroke: `var(${token})` }}
              />
            ))}
            {at !== null && shown != null && shown.value !== null && (
              <circle
                cx={x(at)}
                cy={y(shown.value)}
                r={stroke * 1.6}
                style={{ fill: `var(${token})` }}
              />
            )}
          </svg>
        )
      )}
      {shown && (
        <ChartTip
          x={x(at as number)}
          boxWidth={box.w}
          title={shown.label}
          value={
            shown.value === null
              ? NOT_REPORTED
              : money
                ? exactMoney(shown.value, currency)
                : shown.value.toLocaleString()
          }
        />
      )}
    </div>
  );
}

/**
 * NOTHING TO DRAW IS NOT A FLAT LINE AT ZERO.
 *
 * A flat line says "measured, and it was nothing". A dashed rule with the words
 * says "we have no figures for this". The difference is visible without colour
 * and in both themes, which §5.3 requires.
 */
export function EmptyTrack() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="h-0 w-full border-t border-dashed"
        style={{ borderColor: 'var(--chart-grid)' }}
      />
      <span className="text-faint absolute text-[0.6875rem]">{NOT_REPORTED}</span>
    </div>
  );
}
