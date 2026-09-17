/**
 * EUKA'S CREATOR TIER AND LAST-30-DAY GMV, PER STORE, KEPT IN OUR DATABASE.
 *
 * Two screens want these: the staff table fetches them in the browser, and the
 * client share page cannot — it has no session, no key, and no business making
 * a third-party call on somebody's behalf.
 *
 * WHY A SCHEDULED REFRESH AND NOT ONE INSIDE THE REQUEST. The first version
 * fetched inside `collab-share`. Each refresh is two multi-thousand-row
 * exports, an Edge Function serves requests from one isolate, and a page that
 * had triggered a refresh left the next request queued behind it: measured on
 * 2026-09-18, two client views in five timed out entirely. The exports now run
 * in `euka-ads-sync`, which is already scheduled every five minutes and is
 * already the place that spends Euka's time, one store per run. The share
 * function only ever READS the table, so a client page is a database read.
 *
 * TWO SOURCES, because one is not enough:
 *   - `creator_level` is the 30-day creator list, and caps at 1000 rows per
 *     shop. Anybody quieter than the top thousand is simply not in it.
 *   - `creator_videos` rows carry the same "L tier" and last-30-day GMV on
 *     every video, and reach everybody who posted. This is the same fallback
 *     the staff app keeps in `getVidProfileMap`.
 * The 30-day list wins where both answer; on the video side the newest posted
 * date wins, because both figures drift.
 */
import { EUKA_V0, storeBrandPair, type EukaAuth } from './euka-accounts.ts';

export type TierEntry = { tier: string; gmv: number };
export type TierMap = Record<string, TierEntry>;

/** A handle as Euka writes it: '@name', 'name' and a profile URL all agree. */
export function handleKey(raw: unknown): string {
  const t = String(raw ?? '').trim().toLowerCase();
  if (!t) return '';
  const last = t.startsWith('http') ? (t.replace(/\/+$/, '').split('/').pop() ?? '') : t;
  return last.replace(/^@/, '').split(/[?#]/)[0]!.trim();
}

export function rowsOf(payload: unknown): Record<string, any>[] {
  if (Array.isArray(payload)) return payload as Record<string, any>[];
  for (const key of ['data', 'rows', 'result', 'records']) {
    const v = (payload as Record<string, any> | null)?.[key];
    if (Array.isArray(v)) return v as Record<string, any>[];
  }
  return [];
}

/** One creator's L30 is their whole last 30 days, so the largest figure wins. */
export function mergeTiers(into: TierMap, from: TierMap): TierMap {
  for (const [h, v] of Object.entries(from ?? {})) {
    const cur = into[h];
    into[h] = {
      tier: cur?.tier || v?.tier || '',
      gmv: Math.max(Number(cur?.gmv) || 0, Number(v?.gmv) || 0),
    };
  }
  return into;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Ask Euka about one store. Throws if neither export answers. */
export async function fetchStoreTiers(auth: EukaAuth, store: { id: string; name: string }): Promise<TierMap> {
  const brandId = await storeBrandPair(auth, store.id, store.name);
  const to = iso(new Date());
  const url = (type: string, from: string) =>
    `${EUKA_V0}/data-export?type=${type}&store_id=${encodeURIComponent(store.id)}` +
    (brandId ? `&brand_id=${encodeURIComponent(brandId)}` : '') +
    `&start_date=${from}&end_date=${to}&export_type=json`;

  const [levelRes, videoRes] = await Promise.all([
    fetch(url('creator_level', iso(new Date(Date.now() - 29 * 86_400_000))), { headers: auth, signal: AbortSignal.timeout(45_000) })
      .catch(() => null),
    fetch(url('creator_videos', iso(new Date(Date.now() - 55 * 86_400_000))), { headers: auth, signal: AbortSignal.timeout(45_000) })
      .catch(() => null),
  ]);
  if (!levelRes?.ok && !videoRes?.ok) {
    throw new Error(`euka ${levelRes?.status ?? 'x'}/${videoRes?.status ?? 'x'}`);
  }

  const out: TierMap = {};
  const seenAt: Record<string, number> = {};
  if (videoRes?.ok) {
    for (const row of rowsOf(await videoRes.json())) {
      const h = handleKey(row.creator_handle ?? row.handle);
      if (!h) continue;
      const tier = String(row['L tier'] ?? row.l_tier ?? '').trim();
      const gmv = Number(row.creator_last_30d_gmv_num) || 0;
      if (!tier && gmv <= 0) continue;
      const at = row.posted_date ? new Date(row.posted_date).getTime() : 0;
      if (out[h] && at < (seenAt[h] ?? 0)) continue;
      seenAt[h] = at;
      out[h] = { tier: tier || out[h]?.tier || '', gmv: gmv > 0 ? gmv : (out[h]?.gmv ?? 0) };
    }
  }
  if (levelRes?.ok) {
    for (const row of rowsOf(await levelRes.json())) {
      const h = handleKey(row.creator_handle ?? row.handle);
      if (!h) continue;
      const tier = String(row['L tier'] ?? row.l_tier ?? row.tier ?? '').trim();
      const gmv = Number(row.creator_last_30d_gmv_num ?? row.last_30d_gmv ?? row.gmv ?? 0) || 0;
      const cur = out[h];
      out[h] = { tier: tier || cur?.tier || '', gmv: gmv > 0 ? gmv : (cur?.gmv ?? 0) };
    }
  }
  return out;
}

/**
 * Refresh the ONE store whose figures are oldest, if it is older than `maxAgeMs`.
 * Returns what it did, for the run's summary. Never throws: a store Euka will
 * not answer for keeps its last good map and waits its turn again.
 */
export async function refreshOneStaleStore(
  db: { from: (t: string) => any },
  stores: { id: string; name: string }[],
  authOf: (id: string) => EukaAuth | undefined,
  maxAgeMs = 30 * 60 * 1000,
): Promise<{ store: string; handles: number } | { store: string; error: string } | null> {
  const { data: rows } = await db.from('collab_share_euka_cache').select('store_id, fetched_at');
  const age = new Map((rows ?? []).map((r: any) => [r.store_id, new Date(r.fetched_at).getTime()]));
  const due = stores
    .filter((s) => Date.now() - (age.get(s.id) ?? 0) > maxAgeMs)
    .sort((a, b) => (age.get(a.id) ?? 0) - (age.get(b.id) ?? 0));
  const store = due[0];
  if (!store) return null;
  const auth = authOf(store.id);
  if (!auth) return null;

  /* Claim it first, so two runs never fetch the same store at once. */
  await db.from('collab_share_euka_cache').upsert({
    store_id: store.id,
    store_name: store.name,
    fetched_at: new Date().toISOString(),
  });
  try {
    const handles = await fetchStoreTiers(auth, store);
    await db.from('collab_share_euka_cache').upsert({
      store_id: store.id,
      store_name: store.name,
      handles,
      fetched_at: new Date().toISOString(),
    });
    return { store: store.name, handles: Object.keys(handles).length };
  } catch (e) {
    return { store: store.name, error: String((e as Error).message).slice(0, 120) };
  }
}
