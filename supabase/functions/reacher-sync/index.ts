/**
 * reacher-sync
 * ---------------------------------------------------------------------------
 * Irwin Naturals, and only Irwin Naturals, from Reacher into Paid Collabs.
 *
 * Rashid, 2026-09-23: "there is one brand we have Irwin Naturals, for that
 * brand we have Reacher api not euka ... we need same operations as we are
 * currently doing with euka api ... Please do not disturb anything, just for
 * Irwin Naturals we are going to do that."
 *
 * WHAT IT DOES, each run:
 *   1. Reads every video Reacher holds for the Irwin shop in the window.
 *   2. Files the ones we do not already have onto the matching Paid Collabs
 *      row, with their views, GMV, items, likes and comments — the same shape
 *      the team types by hand and the same shape Euka brands carry.
 *   3. Reads per-video GMV Max spend and writes it into `euka_ad_video_month`,
 *      so the brand page's Ad spend and ROI columns work with no new query.
 *   4. Writes one row to `reacher_sync_runs` saying what it found and changed.
 *
 * ═══ THE RULES THAT KEEP IT FROM DISTURBING ANYTHING ═══
 *
 *   - IRWIN ONLY. Every write is filtered to `brand = 'Irwin Naturals'`. A
 *     Reacher video whose creator is not on an Irwin row is counted and
 *     skipped, never filed against a creator's other brand.
 *   - ADD, NEVER REPLACE. A video already on a row is left exactly as it is,
 *     including its ad code and its typed figures. The team's own edits win;
 *     this only fills gaps.
 *   - A DASH IS NOT A ZERO. No GMV Max campaign is connected on that shop
 *     today, so no spend row is written and the column shows a dash. Writing
 *     zeros would state "nothing was spent", which we do not know.
 *   - READ ONLY AGAINST REACHER. `_shared/reacher.ts` refuses any path that is
 *     not on its read allow-list; their write endpoints create ad campaigns and
 *     cut creators out of delivery.
 *   - `dryRun: true` does everything except write, and reports what it would
 *     have done. The first live run was taken this way.
 *
 * WHO CAN RUN IT: the scheduler presenting `x-sync-secret`, or an active
 * ops/admin/ads_manager for a manual kick. Same gate as euka-ads-sync.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';
import {
  IRWIN,
  campaignCount,
  findShop,
  handleOf,
  reacherKey,
  videoId,
  videoSpend,
  videos,
  type ReacherVideo,
} from '../_shared/reacher.ts';

/** The brand these figures belong to, on our side. Nothing else is touched. */
const BRAND = 'Irwin Naturals';

const Body = z.object({
  dryRun: z.boolean().optional(),
  /** Defaults to the last 120 days, which covers a brand that started in August. */
  from: z.string().trim().max(20).optional(),
  to: z.string().trim().max(20).optional(),
  budgetMs: z.number().int().min(5_000).max(140_000).optional(),
});

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (day: string) => `${String(day).slice(0, 7)}-01`;

type VideoCode = Record<string, unknown>;

/**
 * One Reacher video in the shape Paid Collabs stores.
 *
 * The keys are theirs, read off real rows on 2026-09-23, so a filed video is
 * indistinguishable from a typed one to every screen that renders it. `src`
 * is ours and additive: it says where the row came from without changing how
 * anything reads it.
 */
function toVideoCode(v: ReacherVideo): VideoCode {
  return {
    video: String(v.video_url || v.tiktok_url || '').trim(),
    date: String(v.posted_date || '').slice(0, 10),
    views: Number(v.views) || 0,
    revenue: Number(v.video_gmv) || 0,
    items: Number(v.units_sold) || 0,
    likes: Number(v.like_count) || 0,
    comments: Number(v.comment_count) || 0,
    secs: 0,
    thumb: '',
    /* Reacher has no spark code outside GMV Max, and an empty string is what
       an un-sparked video carries in their data too. */
    adCode: '',
    auth: false,
    product: String(v.product_name || ''),
    src: 'reacher',
  };
}

/** The video keys already on a row, by TikTok id where there is one. */
function keysOn(row: { video_codes?: unknown }): Set<string> {
  const out = new Set<string>();
  const list = Array.isArray(row.video_codes) ? row.video_codes : [];
  for (const v of list as Record<string, unknown>[]) {
    const url = String(v?.video ?? '').trim();
    if (!url) continue;
    out.add(videoId(url) ?? url.toLowerCase().replace(/\/+$/, ''));
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  const started = Date.now();

  const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  /* ── who is asking ───────────────────────────────────────────────────── */
  /* Timing-safe on the scheduler's secret, as euka-ads-sync and tiktok-sync do. */
  const secret = Deno.env.get('REACHER_SYNC_SECRET') ?? '';
  const presented = req.headers.get('x-sync-secret') ?? '';
  let isCron = false;
  if (secret && presented) {
    const a = new TextEncoder().encode(presented);
    const b = new TextEncoder().encode(secret);
    if (a.length === b.length) {
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
      isCron = diff === 0;
    }
  }
  if (!isCron) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not allowed' }, 401, req);
    const { data: who } = await db.auth.getUser(token);
    if (!who?.user) return json({ error: 'Not allowed' }, 401, req);
    const { data: profile } = await db.from('profiles').select('role, is_active').eq('id', who.user.id).single();
    if (!profile?.is_active || !['ops', 'admin', 'ads_manager'].includes(profile.role)) {
      return json({ error: 'Not allowed' }, 403, req);
    }
  }

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    /* an empty body is a scheduled run */
  }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) return json({ error: 'Bad request' }, 400, req);
  const dryRun = parsed.data.dryRun === true;

  if (!reacherKey()) {
    return json({ error: 'REACHER_API_KEY is not set on this project' }, 500, req);
  }

  const to = ISO.test(parsed.data.to ?? '') ? parsed.data.to! : iso(new Date());
  const from = ISO.test(parsed.data.from ?? '')
    ? parsed.data.from!
    : iso(new Date(Date.parse(`${to}T00:00:00Z`) - 120 * 86_400_000));

  const summary = {
    shop: '', shopId: 0, from, to, dryRun,
    videosSeen: 0, videosFiled: 0, creatorsMatched: 0,
    /* Filed videos whose figures moved on this run, and the money that
       appeared with them. Reported because "nothing new" and "nothing changed"
       are different answers, and the second one hid $1,000 for five days. */
    videosRefreshed: 0, gmvAdded: 0,
    unmatchedHandles: [] as string[],
    campaigns: 0, spendRows: 0, spendWritten: 0,
    note: '' as string,
  };

  try {
    const shop = await findShop(IRWIN);
    summary.shop = shop.shop_name;
    summary.shopId = shop.shop_id;

    /* ── 1. every video Reacher holds for this shop ───────────────────── */
    const vids = await videos(shop.shop_id, from, to);
    summary.videosSeen = vids.length;

    /* ── 2. our Irwin rows, and only ours ─────────────────────────────── */
    const rows: { id: number; name: string | null; tiktok_account: string | null; tiktok_account_2: string | null; video_codes: unknown }[] = [];
    for (let page = 0; ; page += 500) {
      const { data, error } = await db.schema('wurxbase').from('creators')
        .select('id, name, tiktok_account, tiktok_account_2, video_codes')
        .eq('brand', BRAND)
        .order('id')
        .range(page, page + 499);
      if (error) throw new Error(`reading ${BRAND} rows: ${error.message}`);
      rows.push(...(data ?? []));
      if ((data ?? []).length < 500) break;
    }

    /* handle → the row that claims it. A creator with two handles claims both. */
    const rowFor = new Map<string, typeof rows[number]>();
    for (const r of rows) {
      for (const h of [handleOf(r.tiktok_account), handleOf(r.tiktok_account_2)]) {
        if (h && !rowFor.has(h)) rowFor.set(h, r);
      }
    }

    /*
     * ═══ THE LATEST FIGURES, BY VIDEO ═══════════════════════════════════
     *
     * ADD-NEVER-REPLACE WAS HALF A RULE, AND THE MISSING HALF COST REAL MONEY.
     * Reacher's own docs say affiliate data is up to three days stale, and GMV
     * lands days after a video is posted — so a video filed on the day it went
     * up is filed with $0, and nothing ever went back for it. On 2026-09-28
     * that was 50 of Irwin's 52 videos: the brand page read $34.63 against
     * Reacher's own $1,036.40 for a single creator.
     *
     * So: still never delete a video, still never touch a row that did not come
     * from Reacher — but REFRESH the figures on the ones that did. Numbers only
     * ever GROW here (`Math.max`), which is the same rule the screens use when
     * two rows disagree, and it means a short or partly-synced Reacher answer
     * can never wipe money that has already been recorded.
     */
    const latest = new Map<string, ReacherVideo>();
    for (const v of vids) {
      const url = String(v.video_url || v.tiktok_url || '').trim();
      if (!url) continue;
      const key = videoId(url) ?? url.toLowerCase().replace(/\/+$/, '');
      const prev = latest.get(key);
      if (!prev || Number(v.video_gmv || 0) > Number(prev.video_gmv || 0)) latest.set(key, v);
    }

    /* Group the videos we can place, by row. */
    const toFile = new Map<number, VideoCode[]>();
    const unmatched = new Set<string>();
    for (const v of vids) {
      const h = handleOf(v.creator_handle);
      const url = String(v.video_url || v.tiktok_url || '').trim();
      if (!h || !url) continue;
      const row = rowFor.get(h);
      if (!row) { unmatched.add(h); continue; }
      const have = keysOn(row);
      const key = videoId(url) ?? url.toLowerCase().replace(/\/+$/, '');
      if (have.has(key)) continue;            /* already filed; refreshed below */
      const list = toFile.get(row.id) ?? [];
      /* Two Reacher rows for one video (it can sit under two products) are one
         video to us; the first wins, as the count-once rule does everywhere. */
      if (list.some((x) => (videoId(String(x.video)) ?? String(x.video)) === key)) continue;
      list.push(toVideoCode(v));
      toFile.set(row.id, list);
    }
    summary.creatorsMatched = toFile.size;
    summary.videosFiled = [...toFile.values()].reduce((s, l) => s + l.length, 0);
    summary.unmatchedHandles = [...unmatched].slice(0, 20);

    /* Refresh what is already filed, row by row, and remember what changed. */
    let refreshed = 0, gmvAdded = 0;
    const refreshedFor = new Map<number, VideoCode[]>();
    for (const row of rows) {
      const existing = Array.isArray(row.video_codes) ? row.video_codes as VideoCode[] : [];
      if (!existing.length) continue;
      let touched = false;
      const next = existing.map((rec) => {
        /* OURS ONLY. A typed row, or one EUKA filed, is not Reacher's to
           correct — that is how one source quietly overwrites another. */
        if (!rec || (rec as Record<string, unknown>).src !== 'reacher') return rec;
        const url = String(rec.video ?? '').trim();
        if (!url) return rec;
        const v = latest.get(videoId(url) ?? url.toLowerCase().replace(/\/+$/, ''));
        if (!v) return rec;
        const grow = (was: unknown, now: unknown) => Math.max(Number(was) || 0, Number(now) || 0);
        const fresh: VideoCode = {
          ...rec,
          views: grow(rec.views, v.views),
          revenue: grow(rec.revenue, v.video_gmv),
          items: grow(rec.items, v.units_sold),
          likes: grow(rec.likes, v.like_count),
          comments: grow(rec.comments, v.comment_count),
          /* A product name only ever fills a blank; it never overwrites one. */
          product: String(rec.product || '') || String(v.product_name || ''),
        };
        if (fresh.revenue !== rec.revenue || fresh.views !== rec.views
          || fresh.items !== rec.items || fresh.likes !== rec.likes || fresh.comments !== rec.comments) {
          touched = true;
          refreshed++;
          gmvAdded += (Number(fresh.revenue) || 0) - (Number(rec.revenue) || 0);
        }
        return fresh;
      });
      if (touched) refreshedFor.set(row.id, next);
    }
    summary.videosRefreshed = refreshed;
    summary.gmvAdded = Math.round(gmvAdded * 100) / 100;

    if (!dryRun) {
      /* One write per row, carrying both the new videos and the refreshed ones,
         so a creator with both does not get written twice. */
      const ids = new Set([...toFile.keys(), ...refreshedFor.keys()]);
      for (const id of ids) {
        const row = rows.find((r) => r.id === id)!;
        const base = refreshedFor.get(id)
          ?? (Array.isArray(row.video_codes) ? row.video_codes as VideoCode[] : []);
        const add = toFile.get(id) ?? [];
        const { error } = await db.schema('wurxbase').from('creators')
          .update({ video_codes: [...base, ...add] })
          .eq('id', id)
          .eq('brand', BRAND);            /* belt and braces: Irwin rows only */
        if (error) throw new Error(`filing videos on row ${id}: ${error.message}`);
      }
    }

    /* ── 3. per-video ad spend, if there is any ───────────────────────── */
    summary.campaigns = await campaignCount(shop.shop_id);
    if (summary.campaigns > 0) {
      const { rows: spend, currency } = await videoSpend(shop.shop_id, from, to);
      summary.spendRows = spend.length;
      const out = spend.map((s) => {
        const id = String(s.video_id ?? '');
        return {
          item_id: id,
          /* The month a video's spend is filed under is the window's month, the
             same convention the Euka side uses for its monthly unit. */
          month: monthStart(to),
          store_id: String(shop.shop_id),
          advertiser_id: 'reacher',
          campaign_id: String(s.campaign_id ?? 'gmv-max'),
          cost: Number(s.spend ?? s.cost ?? 0),
          orders: Number(s.orders ?? 0),
          gross_revenue: Number(s.revenue ?? s.gross_revenue ?? 0),
          currency,
          source: 'reacher',
          synced_at: new Date().toISOString(),
        };
      }).filter((r) => /^[0-9]{6,32}$/.test(r.item_id));
      if (!dryRun && out.length) {
        const { error } = await db.from('euka_ad_video_month')
          .upsert(out, { onConflict: 'item_id,month,advertiser_id,campaign_id' });
        if (error) throw new Error(`writing ad figures: ${error.message}`);
      }
      summary.spendWritten = dryRun ? 0 : out.length;
    } else {
      summary.note = 'No GMV Max campaign is connected on this Reacher shop, so there is no ad spend to read. Ad spend and ROI stay as a dash rather than a zero.';
    }

    if (!dryRun) {
      await db.from('reacher_sync_runs').insert({
        shop_id: shop.shop_id,
        shop_name: shop.shop_name,
        videos_seen: summary.videosSeen,
        videos_filed: summary.videosFiled,
        creators_matched: summary.creatorsMatched,
        spend_rows: summary.spendWritten,
        campaigns_seen: summary.campaigns,
        ok: true,
        note: summary.note || null,
        ms: Date.now() - started,
      });
    }

    return json({ ...summary, ms: Date.now() - started }, 200, req);
  } catch (e) {
    const note = String((e as Error).message).slice(0, 400);
    /* A failed run is RECORDED. An empty log and a broken sync look identical
       otherwise, which is the failure this project keeps meeting. */
    if (!dryRun) {
      await db.from('reacher_sync_runs').insert({
        shop_id: summary.shopId || 0,
        shop_name: summary.shop || IRWIN,
        videos_seen: summary.videosSeen,
        videos_filed: 0,
        creators_matched: 0,
        spend_rows: 0,
        campaigns_seen: summary.campaigns,
        ok: false,
        note,
        ms: Date.now() - started,
      }).then(() => {}, () => {});
    }
    return json({ error: note, ...summary }, 500, req);
  }
});
