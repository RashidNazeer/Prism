import { NOT_REPORTED, exactMoney } from '@/components/charts';
import { cn } from '@/lib/utils';

/**
 * AD SPEND AND GMV, TWO BARS SIDE BY SIDE, ON ONE SCALE.
 *
 * §9 asks the video sheet for exactly this. The chart family has no component
 * for it — `StackedBar` is one bar in two PARTS, and spend and GMV are not two
 * parts of one whole; drawing them that way would claim the spend came out of
 * the sales. So this is a new mark rather than a misused one, and it is built
 * from two divs rather than from SVG: the family's rule is "no hand-rolled
 * SVG", and `StackedBar` itself is divs for the same reason.
 *
 * ONE SCALE, ALWAYS, and that is the entire point of the picture. Spend is
 * routinely a fortieth of GMV, so a second scale would let the two bars be
 * drawn to any relative height the scaling happened to produce — the single
 * most misleading thing a chart can do. Here the shorter bar being nearly
 * invisible IS the finding.
 *
 * Both bars are named and carry their exact figure underneath, so the
 * comparison survives with no colour at all; the `--chart-*` tokens only
 * reinforce what the labels already say.
 *
 * A null is not a zero here either: a missing figure draws no bar and says so.
 * A measured zero draws a hairline, which is a different thing to look at.
 */
export function SpendVsGmv({
  spend,
  gmv,
  currency,
  className,
}: {
  spend: number | null;
  gmv: number | null;
  currency: string | null;
  className?: string;
}) {
  const bars = [
    { key: 'spend', label: 'Ad spend', value: spend, token: '--chart-3' },
    { key: 'gmv', label: 'GMV', value: gmv, token: '--chart-1' },
  ] as const;

  const max = Math.max(0, spend ?? 0, gmv ?? 0) || 1;

  return (
    <div
      className={cn('flex items-end gap-3', className)}
      role="img"
      aria-label={`Ad spend ${spend === null ? NOT_REPORTED : exactMoney(spend, currency)} against GMV ${
        gmv === null ? NOT_REPORTED : exactMoney(gmv, currency)
      }, drawn on one scale`}
    >
      {bars.map((b) => (
        <div key={b.key} className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="relative h-[7rem] w-full">
            {b.value === null ? (
              <div
                className="absolute inset-x-0 bottom-0 h-0 border-t border-dashed"
                style={{ borderColor: 'var(--chart-grid)' }}
              />
            ) : (
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-sm"
                style={{
                  /* A measured zero still gets a sliver, or it reads as a day
                     nobody counted. `min` keeps it honest at the top end. */
                  height: `max(0.125rem, ${(Math.max(0, b.value) / max) * 100}%)`,
                  backgroundColor: `var(${b.token})`,
                }}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-muted flex items-center gap-1.5 text-[0.6875rem]">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: `var(${b.token})` }}
              />
              {b.label}
            </span>
            {b.value === null ? (
              <span className="text-muted truncate text-[0.75rem] italic">{NOT_REPORTED}</span>
            ) : (
              <span className="wx-numeric text-text truncate font-mono text-[0.8125rem] font-bold">
                {exactMoney(b.value, currency)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
