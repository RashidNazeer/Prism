/**
 * REACHER, the affiliate platform Irwin Naturals is on.
 *
 * Not Euka, and not the email-verification service of the same name — that one
 * is `reacher.email` and cost an hour on 2026-09-23. Ours is Reacher for TikTok
 * Shop sellers, `reacherapp.com`.
 *
 * THE SHAPE OF THE API, read off their own spec on 2026-09-23:
 *   base    https://api.reacherapp.com/public/v1
 *   auth    x-api-key: rk_live_…            (NOT Authorization: Bearer — that
 *                                            answers "Invalid token format")
 *   shop    x-shop-id: <id> | "1,2,3" | all (required on every call)
 *   paging  page / page_size, and PAGE_SIZE IS CAPPED AT 100 — 200 is a 422,
 *           not a truncated page.
 * Most reads are POSTs carrying a filter body. A POST here does not imply a
 * write.
 *
 * ═══ THIS MODULE CANNOT WRITE, AND THAT IS ON PURPOSE ═══
 *
 * The key is `can_write: true`, and Reacher's write endpoints move real money
 * and real delivery: `POST /gmv-max/campaigns` creates an ad campaign, `PATCH
 * /gmv-max/campaigns/{id}` changes its budget and target ROAS, and
 * `POST /gmv-max/excluded-creators` cuts a creator out of delivery. There is
 * also a whole messaging surface that can send DMs to creators as Wurx.
 *
 * So the only entry points below are `get` and `read`, both of which refuse any
 * path not on the allow-list. Adding a path to that list is the deliberate act;
 * a typo cannot reach an endpoint that spends money.
 */

export const REACHER_BASE = 'https://api.reacherapp.com/public/v1';

/**
 * Every path this product is allowed to call, and nothing else. All reads.
 * `POST /videos/list` and `POST /gmv-max/videos/summary` are reads with a
 * filter body — their own spec says so, and they take no state-changing field.
 */
const ALLOWED = new Set([
  '/shops',
  '/videos/list',
  '/gmv-max/campaigns',
  '/gmv-max/videos/summary',
]);

export function reacherKey(): string {
  const k = (Deno.env.get('REACHER_API_KEY') ?? '').trim();
  return k;
}

function headers(shopId: string | number): Record<string, string> {
  return {
    'x-api-key': reacherKey(),
    'x-shop-id': String(shopId),
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

function guard(path: string) {
  if (!ALLOWED.has(path)) {
    /* Loud, not silent: a path that is not on the list is a programming
       mistake, and the ones next door spend money. */
    throw new Error(`reacher: ${path} is not on the read allow-list`);
  }
}

/** A read with no body. */
export async function get(path: string, shopId: string | number, timeoutMs = 30_000): Promise<unknown> {
  guard(path);
  const r = await fetch(`${REACHER_BASE}${path}`, {
    method: 'GET',
    headers: headers(shopId),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`reacher GET ${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** A read that carries a filter body. */
export async function read(path: string, shopId: string | number, body: Record<string, unknown>, timeoutMs = 45_000): Promise<Record<string, unknown>> {
  guard(path);
  const r = await fetch(`${REACHER_BASE}${path}`, {
    method: 'POST',
    headers: headers(shopId),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`reacher POST ${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json() as Record<string, unknown>;
}

export type ReacherShop = { shop_id: number; shop_name: string; region?: string; currency?: string; status?: string };

/** Every shop this key can see. */
export async function shops(): Promise<ReacherShop[]> {
  const j = await get('/shops', 'all') as { data?: ReacherShop[] };
  return j?.data ?? [];
}

/**
 * The shop we sync, found BY NAME rather than hardcoded to 12832.
 *
 * A number in a file is a number nobody can check, and Reacher's ids are
 * theirs to change when a shop is re-connected. The name is what Rashid and
 * the team say out loud, and a rename is a loud failure here rather than a
 * silent sync of the wrong shop's videos into his brand.
 */
export const IRWIN = 'Irwin Naturals';

export async function findShop(name: string): Promise<ReacherShop> {
  const all = await shops();
  const hit = all.find((s) => String(s.shop_name || '').trim().toLowerCase() === name.trim().toLowerCase());
  if (!hit) {
    throw new Error(`reacher: no shop called "${name}" (this key sees: ${all.map((s) => s.shop_name).join(', ') || 'none'})`);
  }
  return hit;
}

export type ReacherVideo = {
  video_id?: string;
  video_url?: string;
  tiktok_url?: string;
  creator_handle?: string;
  product_name?: string;
  views?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  units_sold?: number;
  video_gmv?: number;
  posted_date?: string;
};

/**
 * Every video Reacher holds for a shop in a window, paged.
 *
 * PAGE SIZE 100 IS THEIR CEILING. Asking for 200 is a 422 with a clear message,
 * which is the good kind of refusal; asking for a page past the end returns an
 * empty page rather than an error, so the loop stops on `total_pages`.
 */
export async function videos(shopId: number, from: string, to: string, cap = 2000): Promise<ReacherVideo[]> {
  const out: ReacherVideo[] = [];
  for (let page = 1; page <= 50; page++) {
    const j = await read('/videos/list', shopId, { page, page_size: 100, start_date: from, end_date: to });
    const rows = (j.data ?? []) as ReacherVideo[];
    out.push(...rows);
    const pag = (j.pagination ?? {}) as { total_pages?: number };
    if (out.length >= cap || !pag.total_pages || page >= pag.total_pages) break;
  }
  return out;
}

export type ReacherSpend = {
  video_id?: string;
  campaign_id?: string;
  spend?: number;
  cost?: number;
  revenue?: number;
  gross_revenue?: number;
  orders?: number;
  currency?: string;
};

/**
 * Per-video GMV Max spend for a window.
 *
 * EMPTY IS THE EXPECTED ANSWER TODAY, and it is not a fault: Irwin's shop has
 * no GMV Max campaign connected, so every ad endpoint there is empty. That is
 * why the campaign count is recorded on every run — an empty spend list beside
 * "0 campaigns" means nothing is connected, while an empty list beside "3
 * campaigns" would mean something is wrong and worth looking at.
 */
export async function videoSpend(shopId: number, from: string, to: string): Promise<{ rows: ReacherSpend[]; currency: string }> {
  const out: ReacherSpend[] = [];
  let currency = 'USD';
  for (let page = 1; page <= 50; page++) {
    const j = await read('/gmv-max/videos/summary', shopId, { page, page_size: 100, start_date: from, end_date: to });
    currency = String(j.currency ?? currency);
    const rows = (j.data ?? []) as ReacherSpend[];
    out.push(...rows);
    const pag = (j.pagination ?? {}) as { total_pages?: number };
    if (!pag.total_pages || page >= pag.total_pages) break;
  }
  return { rows: out, currency };
}

export async function campaignCount(shopId: number): Promise<number> {
  const j = await get('/gmv-max/campaigns', shopId) as { pagination?: { total_count?: number }; data?: unknown[] };
  return j?.pagination?.total_count ?? (j?.data?.length ?? 0);
}

/**
 * A TikTok handle, however it was stored.
 *
 * `wurxbase.creators.tiktok_account` holds a FULL URL, not a handle, and
 * comparing that to Reacher's `creator_handle` silently matches nothing — it
 * reported "Reacher knows 1 of our 19" once when the real answer was 16.
 * Every join to an external creator source goes through this.
 */
export function handleOf(raw: unknown): string {
  const t = String(raw ?? '').trim().toLowerCase();
  if (!t) return '';
  const last = t.startsWith('http') ? (t.replace(/\/+$/, '').split('/').pop() ?? '') : t;
  return last.replace(/^@+/, '').split(/[?#]/)[0]!.trim();
}

/** TikTok's numeric video id out of a link, the same rule the rest of the app uses. */
export function videoId(url: unknown): string | null {
  const m = String(url ?? '').match(/\/video\/(\d+)/);
  return m ? (m[1] ?? null) : null;
}
