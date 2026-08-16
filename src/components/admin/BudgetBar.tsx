import { cn } from '@/lib/utils';
import { budgetOf, money, type Brand } from '@/lib/admin/useBrands';

/**
 * How much of a brand's budget is already promised to creators.
 *
 * Staff only, everywhere it appears. The numbers behind it live in
 * `brand_commercials`, which no creator can read, and this component must never
 * find its way onto a creator screen.
 *
 * "Used" means committed, not paid: it is the sum of every offer request an
 * admin has approved for this brand. The moment somebody is approved, that
 * money stops being available to promise to anybody else.
 */
export function BudgetBar({
  brand,
  size = 'sm',
}: {
  brand: Brand;
  /** `lg` is for the brand's own Overview, where it is the main event. */
  size?: 'sm' | 'lg';
}) {
  const { allocated, used, left, percent, over } = budgetOf(brand);

  if (allocated === null) {
    return (
      <p className={cn('text-faint', size === 'lg' ? 'text-[0.875rem]' : 'text-[0.75rem]')}>
        No budget set for this brand yet.
      </p>
    );
  }

  // The bar is capped at 100% so an overspend cannot draw outside its track.
  // The number underneath still says the real figure.
  const width = Math.max(0, Math.min(100, percent ?? 0));

  return (
    <div>
      <div
        role="img"
        aria-label={`${percent ?? 0}% of the budget committed, ${money(left, brand.currency)} left`}
        className={cn(
          'bg-surface-2 w-full overflow-hidden rounded-full',
          size === 'lg' ? 'h-2.5' : 'h-1.5'
        )}
      >
        <div
          style={{ width: `${width}%` }}
          className={cn(
            'ease-brand h-full rounded-full transition-[width] duration-500',
            over ? 'bg-danger' : (percent ?? 0) > 80 ? 'bg-warning' : 'bg-accent'
          )}
        />
      </div>

      <p
        className={cn(
          'mt-1.5 flex flex-wrap items-baseline gap-x-2',
          size === 'lg' ? 'text-[0.8125rem]' : 'text-[0.75rem]'
        )}
      >
        <span className={cn('wx-numeric font-semibold', over ? 'text-danger' : 'text-muted')}>
          {percent ?? 0}% committed
        </span>
        <span className="text-faint">
          {over ? (
            <>
              <span className="wx-numeric">{money(used, brand.currency)}</span> of{' '}
              <span className="wx-numeric">{money(allocated, brand.currency)}</span>, over by{' '}
              <span className="wx-numeric">{money(-(left ?? 0), brand.currency)}</span>
            </>
          ) : (
            <>
              <span className="wx-numeric">{money(used, brand.currency)}</span> used,{' '}
              <span className="wx-numeric">{money(left, brand.currency)}</span> left
            </>
          )}
        </span>
      </p>
    </div>
  );
}
