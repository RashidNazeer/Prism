import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * WHOSE NUMBERS AM I LOOKING AT.
 *
 * Rashid, 2026-10-07: "In the numbers tab I want a drop down to select
 * different brands for whom I want to see the numbers."
 *
 * A NATIVE `<select>`, deliberately. The screen already carries one hand-built
 * popover (the date range), and a second custom listbox beside it would be two
 * bespoke keyboard implementations to keep correct for no gain. A native select
 * gets type-ahead, arrow keys and the platform's own wheel on a phone for free —
 * which matters here, because most creators on this product are on a phone.
 *
 * THE NARROWING IS NOT A SECURITY BOUNDARY AND DOES NOT NEED TO BE. The RPCs
 * behind this screen are `security invoker` and every one of them filters on
 * `creator_id = auth.uid()` underneath, so a brand id typed into the network tab
 * can only ever narrow the caller's own rows. Passing a brand they never worked
 * with returns nothing rather than somebody else's figures.
 */
export function BrandFilter({
  brands,
  value,
  onChange,
}: {
  brands: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  /*
   * SHOWN AS SOON AS THERE IS A BRAND AT ALL, and the first rule here was
   * wrong. It hid the control below two brands, reasoning that a dropdown which
   * can only say one thing reads as broken. The argument is fine; the
   * consequence was not. On dev all fifteen creators with approved videos have
   * them with exactly ONE brand, so the rule hid the feature from every account
   * anybody could sign in as — including the one Rashid tested with, which is
   * how it was found, by him, after it shipped.
   *
   * A control nobody can ever see is worse than a control with one option in
   * it. Production will have creators working across several brands; until
   * then this still says, truthfully, which brand the figures are for.
   */
  if (brands.length === 0) return null;

  return (
    <div className="relative shrink-0">
      <select
        aria-label="Which brand"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          'border-line bg-surface-2 text-muted hover:border-accent hover:text-accent focus:border-accent min-h-8 w-full appearance-none rounded-md border py-1 pr-8 pl-2.5 text-[0.8125rem] font-medium transition-colors',
          value && 'border-accent text-accent'
        )}
      >
        <option value="">All brands</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="text-muted pointer-events-none absolute top-1/2 right-2 -translate-y-1/2"
      />
    </div>
  );
}
