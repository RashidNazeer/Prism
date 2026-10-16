import { cn } from '@/lib/utils';
import {
  allMissing,
  exactMoney,
  maxOf,
  NOT_REPORTED,
  useChartBox,
  useChartHover,
  type ChartPoint,
} from './chart-kit';
import { ChartTip } from './ChartTip';
import { EmptyTrack } from './SparkArea';

/**
 * THIN ROUNDED BARS, NO AXES. Ad spend by day on Home.
 *
 * A MISSING DAY HAS NO BAR; a zero day has a bar one hairline tall. Those are
 * different facts and they look different, which is what §5.3 asks for. A
 * library that treats null as zero would draw them identically.
 *
 * The rounded end is anchored to the baseline: the top corners are round and
 * the bottom two are square, so a bar never looks like it floats above the
 * axis it is measured from.
 */
export function SparkBars({
  data,
  token = '--chart-3',
  currency = null,
  ariaLabel,
  money = true,
  className,
  height = '3.5rem',
}: {
  data: ChartPoint[];
  token?: string;
  currency?: string | null;
  ariaLabel: string;
  money?: boolean;
  className?: string;
  height?: string;
}) {
  const [ref, box] = useChartBox();
  const { at, setAt, svgRef, onMove } = useChartHover(data.length);

  const empty = allMissing(data);
  const max = maxOf(data) || 1;
  const n = Math.max(1, data.length);
  const slot = box.w / n;
  const gap = Math.min(slot * 0.45, 0.25 * box.rem);
  const w = Math.max(1, slot - gap);
  const radius = Math.min(w / 2, 0.125 * box.rem);
  /* A measured zero still gets a visible sliver, or it reads as a missing day. */
  const floor = Math.max(1, 0.0625 * box.rem);
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
            onPointerMove={(e) => onMove(e, slot / 2, box.w - slot / 2)}
            onPointerLeave={() => setAt(null)}
          >
            {data.map((p, i) => {
              if (p.value === null) return null; // no bar at all: we have no figure
              const h = Math.max(floor, (p.value / max) * box.h);
              return (
                <rect
                  key={i}
                  x={i * slot + gap / 2}
                  y={box.h - h}
                  width={w}
                  height={h}
                  rx={radius}
                  style={{
                    fill: `var(${token})`,
                    opacity: at === null || at === i ? 1 : 0.45,
                  }}
                />
              );
            })}
          </svg>
        )
      )}
      {shown && (
        <ChartTip
          x={(at as number) * slot + slot / 2}
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
