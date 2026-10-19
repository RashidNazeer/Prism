/**
 * WHICH ROW A REACHER VIDEO BELONGS ON.
 *
 * A creator is hired once a month: the Irwin roster has a row per creator per
 * month, and the brand page for October shows October's rows. The sync used to
 * file every video on the FIRST row that claimed the creator's handle, which is
 * the oldest one — so a video posted in October landed on the September row and
 * the October page could not see it. Measured on 2026-10-20: 76 October videos
 * ($570.84) sat on September rows, and 58 of them had an October row for the
 * same creator sitting right there.
 *
 * THE RULE: a video belongs on the creator's row for the month it was posted.
 * If there is none, the latest row hired on or before the posting day; if the
 * video predates every row, the earliest.
 *
 * Pure on purpose (no Deno, no network) so it can be run against real data.
 */

export type RosterRow = {
  id: number;
  hiring_date: string | null;
  tiktok_account: string | null;
  tiktok_account_2: string | null;
  video_codes: unknown;
};

type Rec = Record<string, unknown>;

const day = (s: unknown) => String(s ?? '').slice(0, 10);
const month = (s: unknown) => day(s).slice(0, 7);
const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The row, among one creator's rows, that a video posted on `posted` belongs on. */
export function pickRow<T extends { id: number; hiring_date: string | null }>(
  candidates: T[],
  posted: string,
): T | null {
  if (!candidates.length) return null;
  const p = day(posted);
  const sorted = [...candidates].sort(
    (a, b) => day(a.hiring_date).localeCompare(day(b.hiring_date)) || a.id - b.id,
  );
  if (!validDay(p)) return sorted[0]!;
  const sameMonth = sorted.filter((r) => month(r.hiring_date) === month(p));
  if (sameMonth.length) return sameMonth[sameMonth.length - 1]!;
  const before = sorted.filter((r) => day(r.hiring_date) && day(r.hiring_date) <= p);
  if (before.length) return before[before.length - 1]!;
  return sorted[0]!;
}

/**
 * Move the Reacher videos that sit on the wrong one of a creator's rows onto the
 * right one. MUTATES `row.video_codes` for the rows it changes and says which.
 *
 *  - Only videos the sync itself filed (`src === 'reacher'`) ever move. A typed
 *    video, or one Euka filed, is the team's and stays where it is.
 *  - A video is moved, never copied or dropped: it leaves one list and joins
 *    another with every field intact. If the right row already holds the same
 *    video, the stray copy is simply removed.
 *  - A creator with one row has nowhere to move to and is untouched.
 */
export function placeVideos<T extends RosterRow>(
  rows: T[],
  handleOf: (s: unknown) => string,
  videoId: (u: unknown) => string | null,
): { moved: number; movedGmv: number; touched: Set<number> } {
  const byHandle = new Map<string, T[]>();
  for (const r of rows) {
    for (const h of [handleOf(r.tiktok_account), handleOf(r.tiktok_account_2)]) {
      if (!h) continue;
      const list = byHandle.get(h) ?? [];
      if (!list.includes(r)) list.push(r);
      byHandle.set(h, list);
    }
  }
  const siblingsOf = (r: T): T[] => {
    const seen = new Map<number, T>();
    for (const h of [handleOf(r.tiktok_account), handleOf(r.tiktok_account_2)]) {
      for (const o of byHandle.get(h) ?? []) seen.set(o.id, o);
    }
    return [...seen.values()];
  };
  const keyOf = (rec: Rec) => {
    const url = String(rec.video ?? '').trim();
    return videoId(url) ?? url.toLowerCase().replace(/\/+$/, '');
  };

  const next = new Map<number, Rec[]>();
  const listOf = (r: T): Rec[] => next.get(r.id) ?? (Array.isArray(r.video_codes) ? [...(r.video_codes as Rec[])] : []);
  const touched = new Set<number>();
  let moved = 0;
  let movedGmv = 0;

  for (const row of rows) {
    const siblings = siblingsOf(row);
    if (siblings.length < 2) continue;
    const keep: Rec[] = [];
    let leaving = false;
    for (const rec of listOf(row)) {
      const posted = day(rec?.date);
      if (!rec || rec.src !== 'reacher' || !validDay(posted)) { keep.push(rec); continue; }
      const target = pickRow(siblings, posted);
      if (!target || target.id === row.id) { keep.push(rec); continue; }
      const dest = listOf(target);
      const k = keyOf(rec);
      if (!dest.some((x) => x && keyOf(x) === k)) {
        dest.push(rec);
        moved++;
        movedGmv += Number(rec.revenue) || 0;
      }
      next.set(target.id, dest);
      touched.add(target.id);
      leaving = true;
    }
    if (leaving) {
      next.set(row.id, keep);
      touched.add(row.id);
    }
  }
  for (const r of rows) {
    const list = next.get(r.id);
    if (list) r.video_codes = list;
  }
  return { moved, movedGmv: Math.round(movedGmv * 100) / 100, touched };
}
