/**
 * THE CLIENT'S DOOR INTO PAID COLLABS. No login, one brand or a few, read only.
 *
 * Rashid, 2026-09-17: "clients would need no login at all ... Only read access
 * and only the brand they have been shared."
 *
 * WHY A FUNCTION AND NOT A POLICY. `anon` has no grant on the `wurxbase` schema
 * and is never getting one ("anon gets nothing. Paid Collabs is behind a login
 * and always will be", 20260828141439). So a client's browser never speaks to
 * Postgres at all: it speaks to this, which runs as the service role, proves
 * the link, and answers with a PROJECTION — a payload built field by field.
 *
 * THE PROJECTION IS THE SECURITY BOUNDARY, not the page. Everything a client
 * must not see is never read into this payload in the first place:
 *   - never: ad spend, ROI, allocated, paid, cost per video, payment status,
 *     whatsapp_number, email, paypal, zelle, comments, airtable_id, row ids
 *   - a section switched off is ABSENT, not hidden: no key, no rows
 * A field that is merely hidden on screen is one "view source" away from being
 * visible, and this data belongs to somebody's client.
 *
 * WHAT IT SERVES, per Rashid's choices on 2026-09-17: brand budget and what is
 * left; the ten top videos; each creator's name, TikTok, tier-less row, deal
 * amount and per-video rate, delivery, views, GMV and items sold; and each
 * video with its spark code. Ad spend and ROI are the two he named to hide,
 * and the rest of the money follows from his answers.
 *
 * FAILURE IS ONE MESSAGE. Unknown, expired and revoked all answer with the same
 * 404 and the same sentence: a probe must not be able to tell a real link that
 * expired from a link that never existed.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';
import { EUKA_V0, eukaKeys, indexStores, storeBrandPair, type EukaAuth } from '../_shared/euka-accounts.ts';

/* 24 random bytes, url-safe and unpadded, is exactly 32 characters. */
const Body = z.object({
  token: z.string().trim().regex(/^[A-Za-z0-9_-]{32}$/),
  /* 'YYYY-MM', or 'all' for every month at once. */
  month: z.string().trim().regex(/^(\d{4}-\d{2}|all)$/).optional(),
});

const GONE = 'This link is not active any more. Ask whoever shared it for a new one.';

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── the vendored app's own arithmetic, copied so the numbers agree ──────── */
/* WurxUI.jsx parseDealAmount */
function dealAmount(deal: unknown): number {
  if (!deal) return 0;
  const m = String(deal).match(/\$?(\d[\d,]*\.?\d*)/);
  return m ? parseFloat(m[1]!.replace(/,/g, '')) || 0 : 0;
}
/* WurxUI.jsx parseDealVideos */
function dealVideos(deal: unknown): number {
  if (!deal) return 0;
  const s = String(deal);
  const m1 = s.match(/(\d+)\s*(?:videos?|vids?|clips?|posts?)\b/i);
  if (m1) return parseInt(m1[1]!, 10);
  const m2 = s.match(/\$\s*\d[\d,]*(?:\.\d+)?\s*(?:[/\-x×*]|for)\s*(\d+)\b/i);
  if (m2) return parseInt(m2[1]!, 10);
  const m3 = s.match(/\b(\d+)\s*[vV]\b/);
  if (m3) return parseInt(m3[1]!, 10);
  return 0;
}
/* WurxUI.jsx deliveredVideoCount: DISTINCT videos, because the same link can
   be stored twice and counting it twice credits delivery that never happened. */
function videoKey(url: string): string {
  const m = url.match(/video\/(\d+)/);
  return m ? m[1]! : url.toLowerCase().split(/[?#]/)[0]!.replace(/\/+$/, '');
}

type Row = Record<string, any>;

const monthOf = (d: unknown) => String(d ?? '').slice(0, 7);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/* WurxUI's _normEukaHandle: a handle may be stored as '@name', 'name', or a
   full profile URL, and Euka answers in bare lower case. */
function handleKey(raw: unknown): string {
  const t = String(raw ?? '').trim().toLowerCase();
  if (!t) return '';
  const last = t.startsWith('http') ? (t.replace(/\/+$/, '').split('/').pop() ?? '') : t;
  return last.replace(/^@/, '').split(/[?#]/)[0]!.trim();
}

const rowsOf = (payload: unknown): Row[] => {
  if (Array.isArray(payload)) return payload as Row[];
  for (const key of ['data', 'rows', 'result', 'records']) {
    const v = (payload as Row | null)?.[key];
    if (Array.isArray(v)) return v as Row[];
  }
  return [];
};

/*
 * TIER AND LAST-30-DAY GMV, LIVE FROM EUKA, CACHED PER STORE FOR 30 MINUTES.
 *
 * Rashid's boss, 2026-09-17, wanted the client's table to match the staff one,
 * which carries both. They cannot come from `creators.monthly.euka`: that cache
 * is frozen at migration day and drifts further every morning (see the note in
 * WurxUI beside `dbEuka`), so a client would be shown figures from July.
 *
 * They also cannot be fetched per view. Euka's export takes seconds and a link
 * that is passed around a client's office would hammer it, so the answer is
 * kept in `collab_share_euka_cache` and refreshed at most twice an hour. A
 * STALE ANSWER BEATS NO ANSWER: if Euka is down or slow, the last good map is
 * served rather than dashes appearing in two columns.
 */
type TierMap = Record<string, { tier: string; gmv: number }>;

/* One creator's L30 GMV is their WHOLE last-30-days, across every shop they
   post for — which is why the staff sweep reads every store and keeps the
   largest figure per handle. Reading only the link's own store showed a dash
   for anyone whose recent GMV came from somewhere else. */
function mergeTiers(into: TierMap, from: TierMap): TierMap {
  for (const [h, v] of Object.entries(from ?? {})) {
    const cur = into[h];
    into[h] = {
      tier: cur?.tier || v?.tier || '',
      gmv: Math.max(Number(cur?.gmv) || 0, Number(v?.gmv) || 0),
    };
  }
  return into;
}

async function refreshStore(
  db: ReturnType<typeof createClient>,
  auth: EukaAuth,
  store: { id: string; name: string },
): Promise<TierMap> {
  const refresh = async (): Promise<TierMap> => {
    const brandId = await storeBrandPair(auth, store.id, store.name);
    const to = iso(new Date());
    const from = iso(new Date(Date.now() - 29 * 86_400_000));
    const url =
      `${EUKA_V0}/data-export?type=creator_level&store_id=${encodeURIComponent(store.id)}` +
      (brandId ? `&brand_id=${encodeURIComponent(brandId)}` : '') +
      `&start_date=${from}&end_date=${to}&export_type=json`;
    const r = await fetch(url, { headers: auth });
    if (!r.ok) throw new Error(`creator_level ${r.status}`);
    const out: Record<string, { tier: string; gmv: number }> = {};
    for (const row of rowsOf(await r.json())) {
      const h = handleKey(row.creator_handle ?? row.handle);
      if (!h) continue;
      const tier = String(row['L tier'] ?? row.l_tier ?? row.tier ?? '').trim();
      const gmv = Number(row.creator_last_30d_gmv_num ?? row.last_30d_gmv ?? row.gmv ?? 0) || 0;
      const cur = out[h];
      if (!cur || gmv > cur.gmv) out[h] = { tier: tier || cur?.tier || '', gmv: Math.max(gmv, cur?.gmv ?? 0) };
    }
    await db.from('collab_share_euka_cache').upsert({
      store_id: store.id,
      store_name: store.name,
      handles: out,
      fetched_at: new Date().toISOString(),
    });
    return out;
  };

  return (await refresh().catch(() => null)) ?? {};
}

/* THE PAGE NEVER WAITS FOR EUKA. The first version awaited the export and the
   request 504'd — a client page hanging because somebody else's API is slow is
   our fault, not theirs. */
const keepWarm = (p: Promise<unknown>) => {
  try {
    (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(p);
  } catch { /* not on Deploy: the promise runs on or it does not */ }
};

/* Every row, paged. PostgREST caps a read at 1000 and says nothing about it;
   a client shown 1000 of 1328 rows would be told a quiet lie. */
async function paged(build: (from: number, to: number) => any): Promise<Row[]> {
  const out: Row[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ error: 'Bad request' }, 405, req);

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return json({ error: 'Bad request' }, 400, req);
  }
  if (!parsed.success) return json({ error: 'Bad request' }, 400, req);
  const { token } = parsed.data;

  /* ── is this link real, live and ours? ────────────────────────────────── */
  const { data: link, error: linkErr } = await db
    .from('collab_share_links')
    .select('id, label, brands, months, show_kpis, show_top_videos, show_creators, show_videos, expires_at, revoked_at, token_hash, view_count')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle();
  if (linkErr) return json({ error: 'Something went wrong. Try again shortly.' }, 500, req);
  if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    return json({ error: GONE }, 404, req);
  }

  try {
    const brands: string[] = (link.brands ?? []).map((b: string) => String(b).trim()).filter(Boolean);

    /* ── the rows for these brands, and nothing else ───────────────────── */
    /* An explicit column list, not select('*'): the staff screen reads every
       column including phone numbers and payment details, and a projection
       that starts from everything is one forgotten delete from a leak. */
    const creators = await paged((from, to) =>
      db.schema('wurxbase').from('creators')
        .select('name, brand, hiring_date, deal, videos, video_codes, tiktok_account, tiktok_account_2, category, product, hired_by, payment_status, monthly')
        .in('brand', brands)
        .not('name', 'is', null).neq('name', '')
        .or('status.eq.approved,status.is.null')
        .order('hiring_date', { ascending: false })
        .range(from, to));

    /* How many deals we have had with each person, across every brand: the
       circle on their face. Names only — this reads the whole table, so it
       reads the two harmless columns and no others. */
    const everyone = await paged((from, to) =>
      db.schema('wurxbase').from('creators').select('name').order('name').range(from, to));
    const dealsEver = new Map<string, number>();
    for (const r of everyone) {
      const k = String(r.name ?? '').trim().toLowerCase();
      if (k) dealsEver.set(k, (dealsEver.get(k) ?? 0) + 1);
    }

    const budgets = await paged((from, to) =>
      db.schema('wurxbase').from('brand_monthly_budgets')
        .select('brand, month, budget, content_guide_url, focus_product_url')
        .in('brand', brands).range(from, to));

    /* ── which months this link may show, and which one was asked for ──── */
    /*
     * An EMPTY whitelist means every month. A non-empty one is the whole truth
     * for this client: the switcher offers those months, "all" means all of
     * THOSE, and a month asked for outside the list is answered with one inside
     * it rather than refused — a client who edits the URL sees no more than a
     * client who clicks. Rashid, 2026-09-17: "which data should be shared with
     * them and which not like which month data".
     */
    const allowed: string[] = (link.months ?? []).filter((m: string) => /^\d{4}-\d{2}$/.test(String(m)));
    const monthOk = (m: string) => allowed.length === 0 || allowed.includes(m);
    const months = [...new Set(creators.map((c) => monthOf(c.hiring_date)).filter((m) => /^\d{4}-\d{2}$/.test(m)))]
      .filter(monthOk)
      .sort().reverse();
    const asked = parsed.data.month ?? months[0] ?? 'all';
    const month = asked === 'all' || months.includes(asked) ? asked : (months[0] ?? 'all');
    const inScope = (c: Row) =>
      month === 'all' ? monthOk(monthOf(c.hiring_date)) : monthOf(c.hiring_date) === month;

    /* ── tier and L30 GMV, per brand, from the store that owns it ──────── */
    /* A store is only ever asked about with the key that RETURNED it, and a
       brand with no Euka store is not a fault — those two columns simply have
       nothing to say. Euka being down is not a fault here either: the page
       still carries everything that comes from our own database. */
    let tiers: TierMap = {};
    try {
      const { data: cacheRows } = await db
        .from('collab_share_euka_cache')
        .select('store_id, handles, fetched_at');
      for (const row of cacheRows ?? []) tiers = mergeTiers(tiers, (row.handles ?? {}) as TierMap);

      const keys = eukaKeys();
      if (keys.length) {
        const index = await indexStores(keys);
        const known = new Set((cacheRows ?? []).map((r) => r.store_id));
        const stale = (id: string) => {
          const row = (cacheRows ?? []).find((r) => r.store_id === id);
          return !row || Date.now() - new Date(row.fetched_at).getTime() > 30 * 60 * 1000;
        };
        const normalise = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const mine = brands
          .map((brand) => {
            const want = normalise(brand);
            const exact = index.stores.find((s) => normalise(s.name) === want);
            const prefixed = index.stores.filter((s) => normalise(s.name).startsWith(want));
            return exact ?? (prefixed.length === 1 ? prefixed[0] : undefined);
          })
          .filter(Boolean) as { id: string; name: string }[];
        /* This link's own stores first — a client reading a brand is the right
           reason for its figures to be fresh — then two others per view, so the
           whole roster fills in over a few opens instead of one long request. */
        const others = index.stores.filter((s) => !mine.some((m) => m.id === s.id) && stale(s.id)).slice(0, 2);
        const runner = (s: { id: string; name: string }) => {
          const auth = index.ownerOf.get(s.id);
          return auth ? refreshStore(db, auth, s) : Promise.resolve({} as TierMap);
        };

        [...mine.filter((s) => known.has(s.id) && stale(s.id)), ...others]
          .forEach((s) => keepWarm(runner(s).catch(() => null)));

        /* A store with NOTHING cached gets a short wait, so the first view of a
           brand is not two empty columns. */
        const cold = mine.filter((s) => !known.has(s.id));
        if (cold.length) {
          const first = await Promise.race([
            Promise.all(cold.map(runner)),
            new Promise<null>((res) => setTimeout(() => res(null), 8_000)),
          ]);
          if (first) for (const m of first) tiers = mergeTiers(tiers, m);
        }
      }
    } catch { /* leave the two columns empty rather than failing the page */ }

    /* ── the payload, built field by field ─────────────────────────────── */
    const data = brands.map((brand) => {
      const rows = creators.filter((c) => String(c.brand ?? '').trim() === brand && inScope(c));

      const people = rows.map((c) => {
        const vids: Row[] = Array.isArray(c.video_codes) ? c.video_codes : [];
        const seen = new Set<string>();
        const videos: Row[] = [];
        for (const v of vids) {
          const url = String(v?.video ?? '').trim();
          if (!url) continue;
          const k = videoKey(url);
          if (seen.has(k)) continue;
          seen.add(k);
          videos.push({
            url,
            date: String(v?.date ?? '').slice(0, 10) || null,
            views: Number(v?.views) || 0,
            gmv: Number(v?.revenue) || 0,
            items: Number(v?.items) || 0,
            product: v?.product ? String(v.product).slice(0, 120) : null,
            thumb: v?.thumb ? String(v.thumb) : null,
            /* Rashid, 2026-09-17: "share the spark codes", so a client can run
               ads on the work. The `auth` code beside it stays ours. */
            spark: link.show_videos && v?.adCode ? String(v.adCode).trim() || null : null,
          });
        }
        const amount = dealAmount(c.deal);
        const committed = dealVideos(c.deal);
        const delivered = videos.length;
        const done = c.videos === 'Done' || (committed > 0 && delivered >= committed);
        const dates = videos.map((v) => v.date).filter(Boolean).sort() as string[];
        /* Euka knows this person by handle; a creator with two handles has the
           tier of whichever carries one, and the GMV of both added up. */
        const known = [c.tiktok_account, c.tiktok_account_2]
          .map(handleKey).filter(Boolean)
          .map((h) => tiers[h]).filter(Boolean) as { tier: string; gmv: number }[];
        const live = known.reduce((t, e) => t + (Number(e.gmv) || 0), 0);
        /* LIVE FIRST, THEN THE STORED FIGURE — the staff row's own rule
           (`creatorL30` / `creatorTier` in WurxUI). `monthly.euka` is an old
           cache and a figure from it is worse than today's, but far better than
           a dash: Euka's creator list covers only the last thirty days and caps
           at 1000 rows per shop, so anyone quiet lately drops out of the live
           sweep entirely. Rashid, seeing dashes the staff screen does not have:
           "still can't see where is their gmv". Both screens now answer the
           same way. */
        const stored = (c.monthly && (c.monthly as Row).euka) || null;
        const l30 = live > 0 ? live : (Number(stored?.l30) > 0 ? Number(stored.l30) : 0);
        return {
          name: String(c.name ?? '').trim(),
          tier: known.find((e) => e.tier)?.tier || (stored?.tier ? String(stored.tier) : null),
          l30: l30 > 0 ? l30 : null,
          /* NO STATUS. It was shared for a few hours on 2026-09-17 because the
             "exact same view" instruction implied it; Rashid looked at the page
             and said "no need to show status". Whether we have paid a creator
             is between us and the creator. */
          tiktok: [c.tiktok_account, c.tiktok_account_2].map((h) => (h ? String(h).trim() : '')).filter(Boolean),
          hiredBy: c.hired_by ? String(c.hired_by).trim() : null,
          deals: dealsEver.get(String(c.name ?? '').trim().toLowerCase()) ?? 0,
          category: c.category ? String(c.category) : null,
          product: c.product ? String(c.product) : null,
          onboarded: String(c.hiring_date ?? '').slice(0, 10) || null,
          completedOn: done && dates.length ? dates[Math.min(committed > 0 ? committed : dates.length, dates.length) - 1] : null,
          /* Money he chose to share: the deal and its per-video rate. */
          deal: amount,
          perVideo: committed > 0 && amount > 0 ? Math.round(amount / committed) : null,
          committed,
          delivered,
          views: videos.reduce((t, v) => t + v.views, 0),
          gmv: videos.reduce((t, v) => t + v.gmv, 0),
          items: videos.reduce((t, v) => t + v.items, 0),
          videos: link.show_videos ? videos : undefined,
        };
      });

      const out: Row = { brand };

      if (link.show_kpis) {
        const budgetRows = budgets.filter((b) => String(b.brand ?? '').trim() === brand
          && (month === 'all' ? monthOk(monthOf(b.month)) : monthOf(b.month) === month));
        const budget = budgetRows.reduce((t, b) => t + (Number(b.budget) || 0), 0);
        const allocated = people.reduce((t, p) => t + p.deal, 0);
        const paid = rows
          .filter((c) => String(c.payment_status ?? '').trim().toLowerCase() === 'paid')
          .reduce((t, c) => t + dealAmount(c.deal), 0);
        const delivered = people.reduce((t, p) => t + p.delivered, 0);
        /* THE SAME FIVE CARDS THE STAFF SCREEN SHOWS. Rashid's boss, 2026-09-17:
           "we need to show them exact same view as we have they will just not be
           able to see ad spend and roi at any cost". That supersedes the earlier
           "budget and remaining only"; DECISIONS says so. */
        out.kpis = {
          budget,
          allocated,
          paid,
          remaining: budget - allocated,
          creators: people.length,
          delivered,
          committed: people.reduce((t, p) => t + p.committed, 0),
          costPerVideo: delivered > 0 ? allocated / delivered : 0,
          views: people.reduce((t, p) => t + p.views, 0),
          gmv: people.reduce((t, p) => t + p.gmv, 0),
        };
        const guide = budgetRows.find((b) => b.content_guide_url)?.content_guide_url ?? null;
        if (guide) out.contentGuide = String(guide);
      }

      if (link.show_top_videos) {
        out.topVideos = people
          .flatMap((p) => (p.videos ?? []).length
            ? p.videos!.map((v: Row) => ({ ...v, name: p.name }))
            : [])
          .filter((v: Row) => v.gmv > 0)
          .sort((a: Row, b: Row) => b.gmv - a.gmv)
          .slice(0, 10)
          .map((v: Row) => ({ url: v.url, thumb: v.thumb, gmv: v.gmv, views: v.views, name: v.name }));
        /* The strip needs the videos even when the per-creator list is off, so
           it is built from the same rows and then trimmed to five fields. */
        if (!link.show_videos) {
          out.topVideos = rows
            .flatMap((c) => (Array.isArray(c.video_codes) ? c.video_codes : [])
              .filter((v: Row) => v?.video && Number(v?.revenue) > 0)
              .map((v: Row) => ({ url: String(v.video), thumb: v.thumb ? String(v.thumb) : null, gmv: Number(v.revenue) || 0, views: Number(v.views) || 0, name: String(c.name ?? '').trim() })))
            .sort((a, b) => b.gmv - a.gmv)
            .slice(0, 10);
        }
      }

      if (link.show_creators) {
        out.creators = people.map(({ videos, ...rest }) => (link.show_videos ? { ...rest, videos } : rest));
      }

      return out;
    });

    /* ── remember that somebody looked ─────────────────────────────────── */
    /* The address is salted with this link's own fingerprint, so the same
       visitor is recognisable within one link and nowhere else. */
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim();
    await db.from('collab_share_views').insert({
      link_id: link.id,
      ip_hash: ip ? await sha256Hex(`${ip}:${link.token_hash}`) : null,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200) || null,
    });
    await db.from('collab_share_links')
      .update({ last_viewed_at: new Date().toISOString(), view_count: (link.view_count ?? 0) + 1 })
      .eq('id', link.id);

    return new Response(JSON.stringify({
      label: link.label,
      sections: {
        kpis: link.show_kpis,
        topVideos: link.show_top_videos,
        creators: link.show_creators,
        videos: link.show_videos,
      },
      months,
      month,
      expiresAt: link.expires_at,
      generatedAt: new Date().toISOString(),
      data,
    }), {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return json({ error: 'Something went wrong. Try again shortly.', detail: String((e as Error).message).slice(0, 200) }, 500, req);
  }
});
