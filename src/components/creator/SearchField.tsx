import { Search } from 'lucide-react';
import { Input } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

/**
 * THE ONE SEARCH BOX EVERY CREATOR SCREEN USES.
 *
 * MOVED HERE 2026-10-17 FROM `earn/EarnFilters.tsx`, where it was `EarnSearch`.
 * Rashid had the Offers one corrected and then asked why the other two did not
 * match: "make all three read as one family." They could not, because there
 * were three of them. Offers and Contests shared a component; Leaderboards and
 * My content each hand-rolled an `<input>`, and the three had drifted into:
 *
 *   Offers        2.75rem, 2.25rem above `sm`; `rounded-lg`; 0.8125rem type;
 *                 icon inset 0.875rem; focus drawn as an OUTLINE
 *   Leaderboards  2.5rem at every width; `rounded-md`; 0.875rem type; icon
 *                 inset 0.75rem; focus drawn as a RING
 *   My content    2.25rem at every width; `rounded-md`; 0.8125rem type; icon
 *                 inset 0.75rem; focus drawn as a RING
 *
 * THE RING WAS A BUG, not just a difference. `wx-neo-inset` IS an inset
 * `box-shadow`, and Tailwind's `ring` is a `box-shadow` too, so the ring did
 * not sit on top of the well — it REPLACED it. Measured in the browser on
 * 2026-10-17: at rest both fields computed
 *   `rgba(73,85,104,.17) 0 0 0 1px inset, rgba(0,0,0,.1) 0 2px 6px inset`
 * and on focus that became a single flat `… 0 0 0 2px` ring with no inset at
 * all, so the box went flat under the cursor at the moment you used it.
 * `Input` draws focus as an `outline` for exactly this reason; see the note on
 * `controlBase` in `ui/Field.tsx`. Going through `Input` is what makes it
 * unrepeatable.
 *
 * NO WELL AROUND IT. The wrapper is a plain `relative` box on purpose. The
 * Offers row used to be `wx-neo-inset` with padding, so a field that carries
 * its own well sat inside a second well inside the page's panel — three
 * surfaces for one control, which is the "double layering" Rashid pointed at.
 * The nesting stops at one: the page's panel, then this field.
 *
 * IT DOES NOT TAKE THE WHOLE ROW. `flex-1` with nothing to compete against
 * stretched this to the full width of a desktop panel — a 1,400px box for a
 * word or two. It still grows; it stops at a reading width.
 *
 * Every size is in `rem`. 2.75rem below `sm` and on any coarse pointer, which
 * is the tap floor; 2.25rem above that on a mouse, so the row does not eat the
 * top of the page.
 */
export function CreatorSearch({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('relative min-w-0 flex-1 basis-48 sm:max-w-sm', className)}>
      <Search
        size={15}
        aria-hidden
        className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
      />
      <Input
        type="search"
        name="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-[2.75rem] pl-9 text-[0.8125rem] sm:h-[2.25rem] pointer-coarse:h-[2.75rem]"
      />
    </div>
  );
}
