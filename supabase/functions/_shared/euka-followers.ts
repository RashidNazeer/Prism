/**
 * A CREATOR'S FOLLOWER COUNT, LOOKED UP BY HANDLE.
 *
 * Euka's shop exports only describe creators active in one of our shops in the
 * last thirty days — 380 of 464 people had no count. Its market intelligence
 * covers TikTok's whole creator population and is searchable by keyword, which
 * is the only way in: `/market-intelligence/tiktok/creator/detail` needs Euka's
 * own creator id, which we do not have.
 *
 * A KEYWORD SEARCH IS NOT A LOOKUP, so this is strict about what it believes.
 * "maddie" would happily answer with a different Maddie. A result counts only
 * when the handle it returns, normalised, EQUALS the handle asked about.
 * Anything else is a miss, and a miss is recorded rather than retried hourly.
 *
 * Euka's own 400s taught this request, not its documentation: region, language,
 * currency, date_range and sort_field are all required, and sort_field is an
 * object ({ field, type }), not a string.
 */
import { EUKA_V1, type EukaAuth } from './euka-accounts.ts';

export type FollowerHit = { handle: string; followers: number; creatorId: string | null };

/** Lower case, no @, no URL, no query string. Both sides normalise to this. */
export function normHandle(raw: unknown): string {
  const t = String(raw ?? '').trim().toLowerCase();
  if (!t) return '';
  const last = t.startsWith('http') ? (t.replace(/\/+$/, '').split('/').pop() ?? '') : t;
  return last.replace(/^@+/, '').split(/[?#]/)[0]!.trim();
}

const rowsOf = (payload: unknown): Record<string, any>[] => {
  if (Array.isArray(payload)) return payload as Record<string, any>[];
  for (const key of ['data', 'rows', 'list', 'records']) {
    const v = (payload as Record<string, any> | null)?.[key];
    if (Array.isArray(v)) return v as Record<string, any>[];
  }
  return [];
};

/**
 * Ask Euka about one handle. `null` means "searched, and nothing that is
 * certainly this person came back" — which is a fact worth storing.
 */
export async function followersForHandle(auth: EukaAuth, rawHandle: string): Promise<FollowerHit | null> {
  const handle = normHandle(rawHandle);
  if (!handle) return null;

  const r = await fetch(`${EUKA_V1}/market-intelligence/tiktok/creator/rank`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: handle,
      region: 'US',
      language: 'en-US',
      currency: 'USD',
      date_range: 'last30Day',
      sort_field: { field: 'revenue', type: 'DESC' },
      page_size: 10,
      page_number: 1,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`creator/rank ${r.status}`);

  for (const row of rowsOf(await r.json().catch(() => null))) {
    const theirs = normHandle(row.creator_handle ?? row.handle ?? row.unique_id ?? row.username);
    if (!theirs || theirs !== handle) continue;   /* a near miss is a miss */
    const followers = Number(row.creator_followers ?? row.followers ?? row.follower_count);
    if (!Number.isFinite(followers) || followers <= 0) continue;
    return { handle, followers: Math.round(followers), creatorId: row.creator_id ? String(row.creator_id) : null };
  }
  return null;
}

/**
 * Fill in the handles we have no answer for, oldest first, until the budget
 * runs out. Returns what it did, for the run's summary.
 *
 * ONE CALL PER HANDLE, AND A HARD STOP. This runs inside the five-minute sync,
 * which must never be the reason a run is cut off mid-unit, so it takes a small
 * batch and watches the clock.
 */
export async function fillFollowers(
  db: { from: (t: string) => any; schema: (s: string) => { from: (t: string) => any } },
  auth: EukaAuth | undefined,
  deadline: number,
  /*
   * FOUR A RUN. Euka rations FRESH market-intelligence lookups: a handle it has
   * answered before comes back at once, while a new one, after a few dozen in
   * an afternoon, gets `503 "Market Intelligence service is unavailable"` —
   * measured 2026-09-18, when @dulcedagda still answered 200 in the same minute
   * that five never-seen handles all got 503. Four a run is roughly 48 an hour
   * when Euka allows it; the stop-after-two-failures below keeps a refused run
   * short. The roster fills over a day or two instead of an afternoon.
   */
  batch = 4,
  maxAgeDays = 30,
): Promise<{ looked: number; found: number; missed: number; failed: number; why?: string[] } | null> {
  if (!auth) return null;

  /* Every handle Paid Collabs knows, paged: PostgREST stops at 1000 without a
     word, and this table passed that long ago. */
  const handles = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.schema('wurxbase').from('creators')
      .select('tiktok_account, tiktok_account_2').order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      for (const h of [r.tiktok_account, r.tiktok_account_2]) {
        const k = normHandle(h);
        if (k) handles.add(k);
      }
    }
    if ((data ?? []).length < 1000) break;
  }

  const { data: known } = await db.from('euka_creator_followers').select('handle, checked_at, found');
  const seen = new Map<string, { at: number; found: boolean }>(
    (known ?? []).map((k: any) => [k.handle, { at: new Date(k.checked_at).getTime(), found: k.found }]),
  );
  const stale = Date.now() - maxAgeDays * 86_400_000;
  /* Never looked up first, then the oldest answers. A miss is re-checked on the
     same schedule as a hit: somebody with no following today may have one in a
     month. */
  const due = [...handles]
    .filter((h) => !seen.has(h) || (seen.get(h)!.at < stale))
    .sort((a, b) => (seen.get(a)?.at ?? 0) - (seen.get(b)?.at ?? 0))
    .slice(0, batch);
  if (!due.length) return null;

  let found = 0, missed = 0, failed = 0, looked = 0, inARow = 0;
  const why = new Set<string>();
  for (const handle of due) {
    if (Date.now() > deadline - 15_000) break;
    looked++;
    try {
      const hit = await followersForHandle(auth, handle);
      await db.from('euka_creator_followers').upsert({
        handle,
        followers: hit?.followers ?? null,
        creator_id: hit?.creatorId ?? null,
        found: Boolean(hit),
        last_error: null,
        checked_at: new Date().toISOString(),
      });
      if (hit) found++; else missed++;
      inARow = 0;
    } catch (e) {
      failed++;
      inARow++;
      const msg = String((e as Error).message).slice(0, 80);
      why.add(`@${handle}: ${msg}`);
      /*
       * RECORDED, AND PUT BACK IN LINE FOR ABOUT A DAY. Leaving a failure
       * unrecorded kept one handle that always makes Euka answer 503 at the
       * FRONT of every run, where it failed and stopped the batch, so nobody
       * behind it was ever looked up. `found` stays false; `last_error` is what
       * separates this from a clean miss.
       */
      await db.from('euka_creator_followers').upsert({
        handle,
        followers: null,
        creator_id: null,
        found: false,
        last_error: msg,
        checked_at: new Date(Date.now() - (maxAgeDays - 1) * 86_400_000).toISOString(),
      });
      /* Two failures in a row is Euka struggling, not two bad handles: stop,
         and let the next run try again. */
      if (inARow >= 2) break;
    }
    /* Paced: fifteen lookups back to back drew 503s from a healthy service. */
    await new Promise((res) => setTimeout(res, 1_200));
  }
  return { looked, found, missed, failed, ...(why.size ? { why: [...why].slice(0, 3) } : {}) };
}
