import { cn } from '@/lib/utils';
import { ListboxSelect } from '@/components/ui/Select';

/**
 * WHOSE NUMBERS AM I LOOKING AT.
 *
 * Rashid, 2026-10-07: "In the numbers tab I want a drop down to select
 * different brands for whom I want to see the numbers."
 *
 * WAS A NATIVE `<select>`, deliberately, until 2026-10-09. Its open list is drawn
 * by the OS, so on a dark app it came up as a white panel with a blue bar, and
 * Rashid asked for every dropdown to follow the app's own theme. It is now the
 * shared themed listbox (`ui/Select.tsx`), which carries the keyboard contract
 * the native one gave for free: arrows, Home/End, type-ahead, Enter, Escape.
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
    <ListboxSelect
      aria-label="Which brand"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(
        'wx-neo-raised-sm wx-neo-press text-muted hover:text-accent min-h-11 max-w-full shrink-0 rounded-md py-1 pr-2 pl-2.5 text-[0.8125rem] font-medium sm:min-h-8',
        value && 'text-accent'
      )}
    >
      <option value="">All brands</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </ListboxSelect>
  );
}
