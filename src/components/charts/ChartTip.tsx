/**
 * THE TOOLTIP, AS A SMALL GLASS TAG.
 *
 * One component for every chart, so a tap on a sparkline and a hover on the
 * full trend line say the same thing in the same shape.
 *
 * IT IS NOT A BLURRED LAYER. The Stitch reference puts tooltips in "Tier 2
 * glass" with its own `backdrop-filter`, and that is exactly what §4.3 forbids
 * here: a page full of widgets each able to raise a blurred tooltip blows the
 * three-layer budget the moment two are open. It uses the small-surface
 * material instead — `wx-neo-raised-sm` — which is the same tint, rim and lift
 * with the blur dropped. Over a panel that is already blurred it reads the
 * same.
 *
 * It flips side near the right edge so it never leaves the widget, and it is
 * `pointer-events-none` so it can never eat the next tap.
 */
export function ChartTip({
  x,
  boxWidth,
  title,
  value,
  second,
}: {
  /** Where the tag points, in pixels from the chart's left edge. */
  x: number;
  boxWidth: number;
  /** The day, usually. */
  title: string;
  /** The exact figure. Never the compact one. */
  value: string;
  /** An optional second line, for a chart carrying two series. */
  second?: string;
}) {
  const flip = x > boxWidth * 0.6;
  return (
    <div
      role="status"
      aria-live="polite"
      className="wx-neo-raised-sm pointer-events-none absolute top-0 z-10 rounded-md px-2 py-1 text-[0.6875rem] whitespace-nowrap tabular-nums"
      style={{
        left: flip ? undefined : Math.max(0, x),
        right: flip ? Math.max(0, boxWidth - x) : undefined,
      }}
    >
      <div className="text-muted">{title}</div>
      <div className="text-text font-semibold">{value}</div>
      {second && <div className="text-muted">{second}</div>}
    </div>
  );
}
