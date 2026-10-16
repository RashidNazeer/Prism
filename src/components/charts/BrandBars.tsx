import { cn } from '@/lib/utils';
import { exactMoney } from './chart-kit';

/**
 * GMV BY BRAND AS HORIZONTAL BARS, sorted high to low.
 *
 * BARS RATHER THAN THE DONUT, deliberately, and §6 gives the reason: at this
 * depth the question changes. Home's donut answers "how is my work spread
 * across brands" — a question about proportion, which a ring shows well. The
 * deep view answers "which brand is doing better than which", which is a
 * comparison of lengths, and the eye compares lengths far better than it
 * compares angles.
 *
 * ONE COLOUR, NOT FOUR. These bars are the same measure for different brands,
 * so colour has no work to do: every bar is the accent, and the NAME beside
 * each tells them apart. Giving each brand its own hue here would be colour
 * carrying no information, and it would also break when a creator has nine
 * brands and the palette has four.
 *
 * Every row is a 2.75rem (44px) tap target that opens that brand's hub.
 */
export function BrandBars({
  brands,
  currency = null,
  onPick,
  className,
}: {
  brands: { label: string; value: number; id?: string }[];
  currency?: string | null;
  onPick?: (brand: { label: string; value: number; id?: string }) => void;
  className?: string;
}) {
  const sorted = [...brands].filter((b) => b.value > 0).sort((a, b) => b.value - a.value);
  const max = sorted[0]?.value ?? 0;

  if (sorted.length === 0) {
    return <p className="text-muted text-sm">No brand has measured GMV in this period.</p>;
  }

  return (
    <ul className={cn('space-y-1', className)}>
      {sorted.map((b) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-text min-w-0 truncate text-xs font-medium">{b.label}</span>
              <span className="text-text shrink-0 text-xs font-semibold tabular-nums">
                {exactMoney(b.value, currency)}
              </span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--chart-grid)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${max > 0 ? (b.value / max) * 100 : 0}%`,
                  backgroundColor: 'var(--chart-1)',
                }}
              />
            </div>
          </>
        );

        return (
          <li key={b.id ?? b.label}>
            {onPick && b.id ? (
              <button
                type="button"
                onClick={() => onPick(b)}
                className="hover:bg-surface-2 flex min-h-11 w-full flex-col justify-center rounded-md px-2 text-start"
              >
                {body}
              </button>
            ) : (
              <div className="flex min-h-11 flex-col justify-center px-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
