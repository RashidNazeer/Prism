/**
 * euka
 * ---------------------------------------------------------------------------
 * The Euka read proxy that Paid Collabs has been missing since it moved here.
 *
 * WHAT BROKE. The vendored WurxBase app asks for its Euka figures from
 * `/.netlify/functions/euka`. That function existed only in the original
 * developer's Netlify deployment; it was never part of the `src/` tree that was
 * vendored in, and `vercel.json` deliberately lets the path 404 rather than
 * answering it with index.html. So on our side EVERY Euka-derived number has
 * been absent since the move: the store list (hence `No EUKA store named
 * "Swisse"`), last-30-day GMV, creator tiers, brand photos, posted videos,
 * per-creator video metrics and the whole Discovery pool. Their code degrades
 * to null on a failed fetch, so nothing errored — the figures were simply
 * missing or stale, which is exactly the "data is different on our platform"
 * report.
 *
 * This is a faithful port of their `netlify/functions/euka.js`, with three
 * deliberate differences, all of them tightenings:
 *
 *   1. THE KEY IS A SECRET, NOT A STRING LITERAL. Theirs is hardcoded in a file
 *      committed to their repository. Ours comes from `EUKA_API_KEY` in the
 *      function's environment and never touches the repo or the browser bundle.
 *
 *   2. THE CALLER IS CHECKED. Theirs answered anybody: `Access-Control-Allow-
 *      Origin: *` with no Authorization at all, so the whole roster — including
 *      the creator emails and phone numbers that `type=discovery` returns — was
 *      readable by anyone who knew the URL. Here the token is verified with the
 *      auth server and the role is read from `profiles`, the same shape every
 *      other privileged function in this project uses.
 *
 *   3. IT TAKES A POST. Theirs read query parameters. `functions.invoke` sends
 *      POST, our shared CORS allows POST, and the session token is attached for
 *      free. The seam in `src/vendor/wurxbase/supabaseClient.js` turns their
 *      call sites into this shape.
 *
 * WHAT IS DELIBERATELY UNCHANGED. The response shape of every mode, key for
 * key, because a dozen call sites in code we do not own read these objects. The
 * split protocol — a fast store list, then one call per store — is also kept,
 * even though it exists to fit Netlify's 10 second budget and we have far more
 * room, because their frontend orchestrates and merges those calls itself.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';

const BASE = 'https://api.euka.ai/v0';

/*
 * Fifteen minutes, matching the CDN cache their Netlify deployment had in front
 * of it. There is no CDN in front of an Edge Function, so this only helps the
 * browser, but a repeated store list within one session is the common case and
 * their frontend already memoises it per session anyway.
 */
const CACHE = 'private, max-age=900';

const Body = z.object({
  /* Absent means "the store list", which is the one mode taking no store. */
  store: z.string().trim().max(64).optional(),
  type: z.enum(['videos', 'cvideos', 'discovery', 'photo']).optional(),
  handle: z.string().trim().max(120).optional(),
  /*
   * DATES ARE NOT REJECTED HERE, THEY ARE DEFAULTED BELOW.
   *
   * A regex on these looks tidier and is the wrong call. The original tests
   * each date itself and silently falls back to a default when it does not
   * match; rejecting instead would turn one malformed date into a 400, which
   * `eukaJson` maps to null, which the callers swallow — and the Discovery
   * sweep would quietly return one window's people instead of seven's, with
   * every check still green. Same silent-shrink shape as the bug this whole
   * function exists to fix. Bounded in length, validated where it is used.
   */
  from: z.string().trim().max(20).optional(),
  to: z.string().trim().max(20).optional(),
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v?: string) => Boolean(v && ISO_DAY.test(v));

const iso = (d: Date) => d.toISOString().slice(0, 10);

/* Their `dateRange()`: today, and thirty days back. */
function dateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: iso(start), end: iso(end) };
}

/*
 * Clamp a requested window to at most 60 days ending at `to`, defaulting to the
 * last 55. Theirs does this inline in three places with the same numbers; the
 * duplication is where a port drifts, so it is one function here.
 *
 * WHY IT MATTERS: Euka's export returns ZERO ROWS, with a 200, for a range
 * wider than about 60 days. A caller that widens the window to "get everything"
 * gets nothing instead, and nothing looks exactly like "this brand has no
 * videos". Callers needing more history sweep several windows.
 */
function window55(fromRaw?: string, toRaw?: string) {
  const to = isDay(toRaw) ? (toRaw as string) : iso(new Date());
  const back = () => {
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 55);
    return iso(d);
  };
  let from = isDay(fromRaw) ? (fromRaw as string) : back();
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (!(span >= 0) || span > 60) from = back();
  return { from, to };
}

type Auth = { Authorization: string };

/*
 * Euka's data-export requires BOTH store_id and brand_id, though their public
 * spec documents store_id alone. There is no id-to-id link exposed, so the
 * brand is found by matching its name to the store's, normalised. A store with
 * no matching brand yields an empty brandId and the export is attempted without
 * it — which is what theirs does, and is better than refusing outright.
 */
async function storeBrandPair(auth: Auth, storeId: string): Promise<string> {
  const [stores, brands] = await Promise.all([
    fetch(`${BASE}/stores`, { headers: auth }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch(`${BASE}/brands`, { headers: auth }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const store = (Array.isArray(stores) ? stores : []).find((s: any) => s.id === storeId);
  if (!store) return '';
  const brand = (Array.isArray(brands) ? brands : []).find((b: any) => norm(b.name) === norm(store.name));
  return brand ? String(brand.id) : '';
}

/* Their exports answer either a bare array or `{ data: [...] }`. */
function rowsOf(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  const d = (payload as any)?.data;
  return Array.isArray(d) ? d : [];
}

function exportUrl(
  type: string,
  storeId: string,
  brandId: string,
  from: string,
  to: string,
  extra = '',
) {
  return (
    `${BASE}/data-export?type=${type}&store_id=${encodeURIComponent(storeId)}` +
    (brandId ? `&brand_id=${encodeURIComponent(brandId)}` : '') +
    extra +
    `&start_date=${from}&end_date=${to}&export_type=json`
  );
}

/*
 * The dashboard's top videos, which is where thumbnails, profile pictures,
 * Spark codes and item counts come from.
 *
 * `brandId` IS REQUIRED AND THE ORIGINAL DOES NOT SEND IT. Euka tightened this
 * endpoint's validator at some point after that code was written: the original
 * body — `{storeId, filter:{postedDateRange, limit}}` — now answers
 * `400 BAD_REQUEST "Input validation failed"`, verified live on 2026-08-29
 * against Swisse. The original swallows a non-2xx here (`.then(r => r.ok ?
 * ... : null)`), so `dd` is null, `richById` is empty, and every video comes
 * back with no thumbnail, no Spark code, no avatar and `items: 0` — silently,
 * on their deployment as much as ours. Adding brandId is the whole fix;
 * `storeId` and `limit` are still accepted alongside it.
 *
 * `limit` IS IGNORED. Ask for 50 and the response says `pageSize: 5` and
 * carries five rows. The enrichment join is therefore five videos wide, not
 * fifty, whatever this asks for. Left in place because it is harmless and
 * removing it would be a second change to test.
 */
async function topVideos(
  auth: Auth,
  storeId: string,
  brandId: string,
  start: string,
  end: string,
  limit: number,
) {
  return await fetch(`${BASE}/dashboard/top-videos-by-revenue`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, brandId, filter: { postedDateRange: { start, end }, limit } }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req);

  const EUKA_KEY = Deno.env.get('EUKA_API_KEY');
  if (!EUKA_KEY) {
    /* Loud, not silent. A missing secret used to look exactly like "this brand
       has no Euka data", which is the failure mode this whole function exists
       to end. */
    return json({ error: 'EUKA_API_KEY is not set on this function' }, 500, req);
  }

  /* ── who is asking ────────────────────────────────────────────────────── */
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return json({ error: 'Not signed in' }, 401, req);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401, req);

  /*
   * THE ROLE COMES FROM THE TABLE, NOT THE TOKEN. A JWT claim can be an hour
   * stale, so somebody demoted five minutes ago still carries the old claim.
   * Every other privileged function here reads `profiles` for the same reason.
   *
   * Staff only, and that is not a formality: `type=discovery` returns creator
   * email addresses and phone numbers. Theirs served that to anyone with the
   * URL.
   */
  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .single();

  if (!profile?.is_active || (profile.role !== 'admin' && profile.role !== 'ops')) {
    return json({ error: 'Not allowed' }, 403, req);
  }

  /* ── what are they asking for ─────────────────────────────────────────── */
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return json({ error: 'Bad request', detail: String((e as Error).message).slice(0, 300) }, 400, req);
  }

  const auth: Auth = { Authorization: `Bearer ${EUKA_KEY}` };
  const range = dateRange();
  const storeId = body.store;

  const ok = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': CACHE },
    });

  try {
    /* ── mode 1 · the store list (fast) ─────────────────────────────────── */
    if (!storeId) {
      const r = await fetch(`${BASE}/stores`, { headers: auth });
      if (!r.ok) throw new Error(`EUKA /stores ${r.status}`);
      const stores = await r.json();
      const list = (Array.isArray(stores) ? stores : []).map((s: any) => ({ id: s.id, name: s.name }));

      /*
       * AN EMPTY STORE LIST IS NEVER LEGITIMATE, so it is an error rather than
       * an empty success.
       *
       * The original answers `200 {stores: []}` for anything that is not an
       * array, and every consumer reads an empty array as "no stores" — which
       * is indistinguishable from "no match for this brand". That is precisely
       * how the bug being fixed here stayed invisible for eleven days. It is
       * not hypothetical either: `/v0/stores` returns a BARE ARRAY while every
       * other Euka export returns `{message, data, count, ...}`, so the day
       * Euka aligns those two shapes, this silently starts reporting
       * `No EUKA store named "Swisse"` again with a 200 and nothing logged.
       */
      if (list.length === 0) {
        throw new Error('EUKA /stores returned no stores — the shape or the key changed');
      }

      return ok({ range, stores: list });
    }

    /* ── mode 3 · one store's posted videos ─────────────────────────────── */
    if (body.type === 'videos') {
      const { from, to } = window55(body.from, body.to);
      const brandId = await storeBrandPair(auth, storeId);

      /*
       * Two sources in parallel. The creator_videos export carries the rows;
       * the dashboard's top 50 carries thumbnails, profile pictures, item
       * counts and Spark codes. The bulk spark-code export takes about eighty
       * seconds upstream, which is why codes come from the dashboard here.
       */
      const [vr, dd] = await Promise.all([
        fetch(exportUrl('creator_videos', storeId, brandId, from, to), { headers: auth }),
        topVideos(auth, storeId, brandId, from, to, 50),
      ]);
      if (!vr.ok) throw new Error(`EUKA videos export ${vr.status}`);
      const vRows = rowsOf(await vr.json());

      const richById: Record<string, { items: number; thumb: string; spark: string }> = {};
      const avatars: Record<string, string> = {};
      let brandPhoto = '';
      ((dd && (dd as any).videos) || []).forEach((v: any) => {
        const id = String(v.videoId || '');
        if (!id) return;
        richById[id] = {
          /* itemsSoldCount, NOT gmvOrders. The original reads gmvOrders — a
             count of ORDERS — into the field the table labels 'Items sold'.
             Live on Swisse the same video reports gmvOrders 59 and
             itemsSoldCount 55, and 55 is what the creator_video_level export
             says, so mode 3 and mode 4 disagreed about the same video. */
          items: Number(v.itemsSoldCount) || 0,
          thumb: v.creatorVideoPhotoUrl || '',
          spark: String((Array.isArray(v.sparkCodes) && v.sparkCodes[0]) || '').trim(),
        };
        const h = String(v.creatorHandle || '').toLowerCase().trim();
        if (h && v.creatorProfilePicUrl && !avatars[h]) avatars[h] = v.creatorProfilePicUrl;
        if (!brandPhoto && v.productPhotoUrl) brandPhoto = v.productPhotoUrl;
      });

      /*
       * creator_videos rows carry the same "L tier" and overall last-30d GMV
       * that creator_level exposes, but creator_level is locked to a fixed
       * window ending today, so a creator who has not posted recently silently
       * drops out of it. This export is swept across wide historical windows
       * anyway, so tier and GMV are harvested here too — keyed by the video's
       * own posted date, NEWEST WINS, because both drift over time.
       */
      const tiers: Record<string, { tier: string; gmv: number; _at?: number }> = {};
      const videos: Record<string, any[]> = {};
      const seen = new Set<string>();

      vRows.forEach((row: any) => {
        const h = String(row.creator_handle || '').toLowerCase().trim();
        const link = String(row.video_link || '').trim();
        if (!h) return;

        const tier = String(row['L tier'] || '').trim();
        const gmv = Number(row.creator_last_30d_gmv_num);
        if (tier || gmv > 0) {
          const postedAt = row.posted_date ? new Date(row.posted_date).getTime() : 0;
          const cur = tiers[h];
          if (!cur || postedAt >= (cur._at ?? 0)) {
            tiers[h] = {
              tier: tier || cur?.tier || '',
              gmv: gmv > 0 ? gmv : (cur?.gmv ?? 0),
              _at: postedAt,
            };
          }
        }

        if (!link) return;
        const id = String(row.video_id || link);
        if (seen.has(`${h}|${id}`)) return;
        seen.add(`${h}|${id}`);
        const rich = richById[id] || ({} as any);
        (videos[h] = videos[h] || []).push({
          id,
          video: link,
          adCode: String(row.spark_code || '').trim() || rich.spark || '',
          date: row.posted_date || null,
          views: Number(row.views_count) || 0,
          revenue: Math.round((Number(row.revenue) || 0) * 100) / 100,
          items: rich.items || 0,
          product: String(row.product_name || '').trim(),
          thumb: rich.thumb || '',
        });
      });
      Object.values(tiers).forEach((t) => { delete t._at; });

      return ok({ range: { start: from, end: to }, videos, avatars, brandPhoto, tiers });
    }

    /* ── mode 4 · one creator's full video-level metrics ────────────────── */
    if (body.type === 'cvideos') {
      const handle = String(body.handle || '').toLowerCase().trim();
      if (!handle) return json({ error: 'handle required' }, 400, req);
      const { from, to } = window55(body.from, body.to);
      const brandId = await storeBrandPair(auth, storeId);

      const cr = await fetch(
        exportUrl(
          'creator_video_level',
          storeId,
          brandId,
          from,
          to,
          `&creator_handle=${encodeURIComponent(handle)}`,
        ),
        { headers: auth },
      );
      if (!cr.ok) throw new Error(`EUKA cvideos export ${cr.status}`);
      const cRows = rowsOf(await cr.json());

      const rows: any[] = [];
      const cSeen = new Set<string>();
      cRows.forEach((row: any) => {
        const link = String(row.video_url || row.video_link || '').trim();
        const id = String(row.video_id || link);
        if (!id || cSeen.has(id)) return;
        cSeen.add(id);
        rows.push({
          id,
          video: link || `https://www.tiktok.com/@${handle}/video/${id}`,
          adCode: '',
          date: row.posted_date || null,
          views: Number(row.views_count) || 0,
          revenue: Math.round((Number(row.revenue) || 0) * 100) / 100,
          items: Number(row.items_sold_count) || 0,
          product: String(row.product_name || '').trim(),
          thumb: String(row.thumbnail_url || '').trim(),
          /* creator_video_level is the ONLY export carrying engagement. */
          likes: Number(row.likes_count) || 0,
          comments: Number(row.comments_count) || 0,
          secs: Math.round((Number(row.duration) || 0) / 1000) || 0,
        });
      });

      return ok({ range: { start: from, end: to }, videos: { [handle]: rows } });
    }

    /* ── mode 6 · the Discovery sourcing pool ───────────────────────────── */
    if (body.type === 'discovery') {
      /*
       * creator_level hard-caps at 1000 rows and ignores every pagination
       * parameter. Different DATE WINDOWS do return different people, so the
       * caller sweeps several windows and unions them.
       */
      /* NOT clamped to 55 days, unlike every other dated mode — this one is
         swept in 60-day windows on purpose, and clamping it here would shrink
         the pool by six sevenths without anything reporting a problem. */
      const to = isDay(body.to) ? (body.to as string) : range.end;
      const from = isDay(body.from) ? (body.from as string) : range.start;
      const brandId = await storeBrandPair(auth, storeId);

      const r = await fetch(exportUrl('creator_level', storeId, brandId, from, to), { headers: auth });
      if (!r.ok) throw new Error(`EUKA discovery export ${r.status}`);
      const rows = rowsOf(await r.json());

      const people: Record<string, unknown> = {};
      rows.forEach((row: any) => {
        const h = String(row.creator_handle || '').toLowerCase().trim();
        if (!h) return;
        const email = String(row.email || '').trim();
        const phone = String(row.phone || '').trim();
        /* Sourcing is pointless without a way to reach them. */
        if (!email && !phone) return;
        people[h] = {
          tier: String(row['L tier'] || '').trim(),
          gmv: Number(row.last_30d_gmv) || 0,
          followers: Number(row.follower_count) || 0,
          avgViews: Number(row.avg_video_views_30d) || 0,
          postRate:
            row.estimated_post_rate != null && row.estimated_post_rate !== ''
              ? Number(row.estimated_post_rate)
              : null,
          email,
          phone,
          gender: String(row.gender || '').trim(),
          lang: String(row.language || '').trim(),
          sampled: !!row.has_sample_request,
          posted: !!row.has_video_post,
        };
      });

      return ok({ range: { start: from, end: to }, people });
    }

    /* ── mode 5 · one store's brand photo ───────────────────────────────── */
    if (body.type === 'photo') {
      const end = iso(new Date());
      const startD = new Date();
      startD.setUTCDate(startD.getUTCDate() - 55);
      const start = iso(startD);

      /* The brand is resolved up front here, not only in the fallback below:
         without it the dashboard call 400s and the fallback was doing ALL the
         work. That is why their brand faces come from a sample request rather
         than from the top product. */
      const photoBrandId = await storeBrandPair(auth, storeId);
      const dd = await topVideos(auth, storeId, photoBrandId, start, end, 5);
      let photo = '';
      const hit = ((dd as any)?.videos || []).find((v: any) => v.productPhotoUrl);
      if (hit) photo = hit.productPhotoUrl;

      /*
       * A newly onboarded brand has no posted videos, so the dashboard returns
       * nothing and the tile falls back to a plain initial. Sample requests
       * exist from day one and their product_id maps onto the same public
       * bucket, so the URL is built from there rather than leaving the brand
       * faceless.
       */
      if (!photo) {
        try {
          const sr = await fetch(exportUrl('sample_requests', storeId, photoBrandId, start, end), {
            headers: auth,
          });
          if (sr.ok) {
            const pid = (rowsOf(await sr.json()).find((r: any) => r && r.product_id) || {}).product_id;
            if (pid) {
              photo = `https://database.euka.ai/storage/v1/object/public/seller_products_photos/${pid}.jpg`;
            }
          }
        } catch {
          /* A photo is decorative. Never fail the request for it. */
        }
      }

      return ok({ photo });
    }

    /* ── mode 2 · one store's creator_level export ──────────────────────── */
    const brandId = await storeBrandPair(auth, storeId);
    const r = await fetch(exportUrl('creator_level', storeId, brandId, range.start, range.end), {
      headers: auth,
    });
    if (!r.ok) throw new Error(`EUKA export ${r.status}`);
    const rows = rowsOf(await r.json());

    const handles: Record<string, number> = {};
    const profiles: Record<string, Record<string, unknown>> = {};
    /* handle -> last-30d GMV generated FOR THIS STORE, as opposed to overall. */
    const shop: Record<string, number> = {};

    rows.forEach((row: any) => {
      const h = String(row.creator_handle || '').toLowerCase().trim();
      if (!h) return;

      const gmv = Number(row.last_30d_gmv) || 0;
      if (handles[h] == null || gmv > handles[h]) handles[h] = gmv;

      const sg = Number(row.last_30d_gmv_our_shop) || 0;
      if (sg > 0 && (shop[h] == null || sg > shop[h])) shop[h] = sg;

      const email = String(row.email || '').trim();
      const phone = String(row.phone || '').trim();
      const followers = Number(row.follower_count) || 0;
      const postRate =
        row.estimated_post_rate != null && row.estimated_post_rate !== ''
          ? Number(row.estimated_post_rate)
          : null;
      const tier = String(row['L tier'] || '').trim();
      const avgViews = Number(row.avg_video_views_30d) || 0;

      if (email || phone || followers || postRate != null || tier || avgViews) {
        const p = profiles[h] || {};
        /* First non-empty wins, per field. */
        if (email && !p.email) p.email = email;
        if (phone && !p.phone) p.phone = phone;
        if (followers && !p.followers) p.followers = followers;
        if (postRate != null && p.postRate == null && isFinite(postRate)) p.postRate = postRate;
        if (tier && !p.tier) p.tier = tier;
        if (avgViews && !p.avgViews) p.avgViews = avgViews;
        profiles[h] = p;
      }
    });

    return ok({ range, handles, profiles, shop });
  } catch (e) {
    /* 502: the failure is upstream, not in the request we were given. */
    return json({ error: String((e as Error).message).slice(0, 300) }, 502, req);
  }
});
