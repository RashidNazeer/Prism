/**
 * Deadlines, in the timezone they were SET in.
 *
 * This is the first date formatter in the product and it exists because of one
 * failure: a creator in California reads "closes today" at 16:00 their time,
 * taps Enter, and is refused because the instant was 23:59 in London. There is
 * nothing anyone can point at on a support call.
 *
 * So rule L6: every creator facing deadline names its zone, and the zone it
 * names is the one an admin chose, not the one the reader happens to be in. A
 * timestamptz does not remember the offset it was written with, which is why
 * `contests.expires_at_timezone` exists as a column beside it.
 */

/**
 * "31 Aug 2026, 11:59pm BST".
 *
 * The abbreviation comes from Intl rather than a lookup table, so it follows a
 * clock change on its own. Europe/London prints BST in July and GMT in January
 * without anybody editing anything.
 */
export function formatDeadline(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  try {
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);

    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(d)
      // "11:59 pm" reads better as "11:59pm" beside a date.
      .replace(/\s(am|pm)$/i, (_m, p: string) => p.toLowerCase());

    const zone =
      new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
        .formatToParts(d)
        .find((p) => p.type === 'timeZoneName')?.value ?? '';

    return zone ? `${date}, ${time} ${zone}` : `${date}, ${time}`;
  } catch {
    // An unknown zone should be impossible, since save_contest checks the value
    // against pg_timezone_names before it stores it. Falling back to the raw
    // instant is still better than a blank space where a deadline should be.
    return d.toISOString().slice(0, 16).replace('T', ', ');
  }
}

/** How long is left, as one short phrase. Rule L15. */
export function timeLeft(iso: string, now: number = Date.now()): string {
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return 'Closed';

  const hours = ms / 3_600_000;

  // Under two days it counts in hours, because "1 day left" at 23:00 and
  // "1 day left" at 01:00 are twenty two hours apart and only one of them is
  // worth dropping everything for.
  if (hours < 48) {
    const h = Math.max(1, Math.ceil(hours));
    return h === 1 ? 'Closes within the hour' : `Closes in ${h} hours`;
  }

  // Ceil, so the last full day reads "2 days left" rather than "1", and so
  // nothing ever prints "0 days left", which is a zero standing in for
  // something we actually know.
  return `${Math.ceil(hours / 24)} days left`;
}

/** True once the deadline has passed. The one definition, used everywhere. */
export const hasClosed = (iso: string, now: number = Date.now()) => Date.parse(iso) <= now;
