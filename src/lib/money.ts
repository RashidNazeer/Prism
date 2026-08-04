/**
 * Formatting money and percentages, for both sides of the product.
 *
 * This used to live in `src/lib/admin/useBrands.ts`, which meant every creator
 * screen showing a price imported from the admin library. Nothing leaked,
 * because these are pure formatters, but it blurred a line this project keeps
 * deliberately sharp: creator code should have no reason to reach into admin
 * code at all.
 */

/**
 * numeric arrives from PostgREST as a JSON number and from an Edge Function as
 * a string, so this takes either. Parse only at the point of display, never to
 * store or send back, or a penny goes missing on the way.
 */
export const money = (value: string | number | null, currency = 'USD'): string => {
  if (value === null || value === '') return 'Not set';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 'Not set';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    // An unknown currency code should not blank the screen.
    return `${currency} ${n.toLocaleString()}`;
  }
};

/** "25%", from whatever numeric shape arrived. Empty string when unset. */
export const percent = (value: string | number | null): string => {
  if (value === null || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n % 1 === 0 ? n : n.toFixed(2).replace(/0$/, '')}%`;
};
