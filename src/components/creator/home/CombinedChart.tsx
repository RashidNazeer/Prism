import { TrendLine, type ChartPoint } from '@/components/charts';

/**
 * EVERY METRIC IN ONE PICTURE.
 *
 * Rashid: "Merge the graphs on my numbers page and give an option to creator
 * for separate view." The deep view had three full-height charts stacked, which
 * meant the one question they exist to answer — did the ad spend move the
 * sales? — needed two screens of scrolling and a memory for shapes.
 *
 * WHAT IS MERGED, AND WHAT DELIBERATELY IS NOT.
 *
 * GMV and ad spend ARE merged, because they are the same currency and belong
 * on one axis. That is a real comparison, and the repo's own charting note
 * insists on it: "a second y-axis would let any two lines be drawn to cross
 * wherever the scaling happened to put them, which is the single most
 * misleading thing a chart can do."
 *
 * ORDERS IS NOT ON THIS CHART AT ALL. Orders is a COUNT and the others are
 * AMOUNTS; they share no scale, so merging them would mean inventing one. It
 * was tried as a strip underneath and removed: over a week it drew a nearly
 * flat line that carried no information and made the panel taller for nothing.
 * The orders figure sits in the stat row below the chart, and the exact count
 * for any day is in the chart's own tooltip.
 */
export function CombinedChart({
  gmv,
  spend,
  currency,
  days,
}: {
  gmv: ChartPoint[];
  spend: ChartPoint[];
  currency: string | null;
  days: number;
}) {
  /*
   * WHICH SCALE THE BARS GET IS DECIDED BY THE DATA, not by preference.
   *
   * Shared is the honest default. But ad spend is routinely a fortieth of GMV,
   * and on a shared axis the bars flatten onto the baseline and tell nobody
   * anything. So when spend never reaches a tenth of the GMV peak, the bars
   * move to their own scale — and `TrendLine` then PRINTS that scale's maximum
   * in the caption, so the second axis is stated rather than hidden.
   */
  const peak = (s: ChartPoint[]) => s.reduce((m, p) => Math.max(m, p.value ?? 0), 0);
  const scale = peak(spend) > 0 && peak(spend) < peak(gmv) * 0.1 ? 'own' : 'shared';

  return (
    <div>
      <TrendLine
        data={gmv}
        spend={spend}
        spendScale={scale}
        currency={currency}
        ariaLabel={`GMV each day for the last ${days} days, with ad spend behind it`}
        height="17rem"
      />

    </div>
  );
}
