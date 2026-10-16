import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreatorPeriod } from '@/lib/creator/useCreatorPeriod';

/**
 * ONE CHIP THAT SAYS "ALL BRANDS", opening the list.
 *
 * A chip rather than a row of brand pills: a creator with eleven brands would
 * otherwise get eleven controls across the top of her dashboard, and the
 * answer she wants most of the time is the default.
 *
 * The list is a plain popover, not a modal. It is small, it is a filter, and a
 * modal for a filter means a dimmed screen and a third blurred layer for the
 * sake of choosing a brand.
 */
export function BrandChip({
  period,
  brands,
}: {
  period: CreatorPeriod;
  brands: { label: string; value: number; id?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const current = brands.find((b) => b.id === period.brandId);

  return (
    <div className="relative">
      {/*
        THE SAME HEIGHT AS THE CHIPS BESIDE IT, AT EVERY WIDTH.

        This was `min-h-11` with no `sm:` override while `PeriodChips` and the
        `DateRangePicker` trigger next to it both carry `sm:min-h-9`, so from
        640px up the chip stood 44px tall in a row of 36px controls -- measured
        at 768 and 1280 on /dev/home. Five controls doing one job with one of
        them taller is what read as broken in Rashid's screenshot of the period
        row. The 44px tap floor still holds below `sm`, where a thumb is the
        pointer; above it the whole row is 36px, which is the size the date
        trigger's own note settled on.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="wx-neo-raised-sm text-text flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium sm:min-h-9"
      >
        {current?.label ?? 'All brands'}
        <ChevronDown aria-hidden className="text-muted size-3.5" />
      </button>

      {open && (
        <>
          {/* A bare backdrop to catch the dismissing tap. No fill, no blur. */}
          <button
            type="button"
            aria-label="Close brand filter"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            className="wx-neo-raised absolute end-0 z-30 mt-1 max-h-72 w-56 overflow-auto rounded-lg p-1"
          >
            <Option
              label="All brands"
              selected={!period.brandId}
              onPick={() => {
                period.setBrand(null);
                setOpen(false);
              }}
            />
            {brands
              .filter((b) => b.id)
              .map((b) => (
                <Option
                  key={b.id}
                  label={b.label}
                  selected={period.brandId === b.id}
                  onPick={() => {
                    period.setBrand(b.id ?? null);
                    setOpen(false);
                  }}
                />
              ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Option({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onPick}
        className={cn(
          'hover:bg-surface-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 text-start text-xs',
          selected ? 'text-text font-semibold' : 'text-muted'
        )}
      >
        <span className="truncate">{label}</span>
        {selected && <Check aria-hidden className="size-3.5 shrink-0" />}
      </button>
    </li>
  );
}
