import { money } from '@/lib/money';

/**
 * The money on an offer, formatted the one way.
 *
 * Lifted out of `OfferCard` so the card, the detail panel and the apply dialog
 * cannot drift into three renderings of one fee — which is exactly what had
 * already happened to the per-video rate before the card was rebuilt.
 */

/**
 * Major units, never cents.
 *
 * A NULL FEE IS NOT A ZERO. An offer the team will scope with a creator is not
 * an offer worth nothing, so the answer is a sentence, never `0`.
 *
 * A null CURRENCY means several currencies in one figure (a derived total), so
 * the bare number is shown with no symbol rather than a guessed dollar sign.
 */
export function formatAmount(value: string | number | null, currency: string | null): string {
  if (value === null || value === '') return 'To confirm';
  if (currency === null) {
    const n = Number(value);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, { maximumFractionDigits: n % 1 === 0 ? 0 : 2 })
      : 'To confirm';
  }
  return money(value, currency);
}

/**
 * The fee split across the videos, or null when it cannot be known.
 *
 * Null rather than the fee itself when there is one video: "£300 per video" on
 * a one-video offer is the same figure twice, and repeating a number is how a
 * creator starts wondering whether it is two payments.
 */
export function perVideoOf(
  amount: string | number | null,
  videoCount: number | null
): number | null {
  if (amount === null || amount === '') return null;
  if (!videoCount || videoCount <= 1) return null;
  const n = Number(amount);
  return Number.isFinite(n) ? n / videoCount : null;
}
