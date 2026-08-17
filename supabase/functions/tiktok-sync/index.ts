/**
 * tiktok-sync
 * ---------------------------------------------------------------------------
 * THE ONLY THING IN THE PRODUCT THAT ASKS TIKTOK FOR MONEY FIGURES.
 *
 * It pulls one complete day at a time for each mapped store and writes the
 * result into `tiktok_video_daily`. Creator screens then read that table and
 * never call TikTok at all, which is why a creator's date filter can be free
 * and unlimited: there is no request to ration.
 *
 * ONE CALL COVERS EVERY VIDEO FOR A DAY. Probed 2026-08-18: the `item_id`
 * filter accepts a batch, so the cost of this is one request per store per day,
 * for the whole platform, no matter how many creators are looking.
 *
 * COMPLETE DAYS ONLY, and never today. Today's figures are still accruing and
 * would be wrong within the hour, and worse, would be CACHED wrong. A complete
 * day never changes, so a row written once is correct forever and is never
 * fetched again.
 *
 * WHO CAN RUN IT
 *   - the scheduled job, with the shared secret in `x-sync-secret`
 *   - an admin, with a real session, for a backfill
 * There is no third way in, and a creator's token is refused by both.
 *
 * ONLY MAPPED STORES ARE SYNCED, and that is load bearing rather than tidy.
 * Rashid's Penetrex store is visible from two ad accounts; asking both would
 * store the same video twice and double its spend. The brand mapping is what
 * says which ad account a brand's money actually comes from.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';
import { assertCallableRegion, currentRegion, TikTokError } from '../_shared/tiktok.ts';

const Body = z.object({
  /*
   * How many complete days back to make sure we have. The nightly run only
   * needs 1; a first backfill wants more. Capped, because an unbounded number
   * here is an unbounded number of API calls.
   */
  days: z.number().int().min(1).max(120).default(1),
  /** Refetch days we already have. Off by default: a complete day cannot change. */
  force: z.boolean().default(false),
});

type ReportRow = {
  dimensions?: { item_id?: string };
  metrics?: Record<string, string>;
};

/** The metrics this endpoint actually accepts. `net_cost` is rejected here. */
const METRICS = ['cost', 'gross_revenue', 'orders'];

const num = (v: string | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The day in the AD ACCOUNT'S timezone, offset by `back` days.
 *
 * TikTok knows one day boundary and it is the account's, ours is Etc/GMT+5, and
 * Wurx is in Pakistan. Using the server's date would file a figure under the
 * wrong day near midnight, every time.
 */
function dayInZone(timeZone: string, back: number): string {
  const now = new Date(Date.now() - back * 86_400_000);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
}

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appId = Deno.env.get('TIKTOK_APP_ID');
  const appSecret = Deno.env.get('TIKTOK_APP_SECRET');
  const syncSecret = Deno.env.get('TIKTOK_SYNC_SECRET');

  if (!appId || !appSecret) {
    return reply({ error: 'The TikTok app is not configured on this project.' }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* ------------------------------------------------------------ who is it -- */

  /*
   * TIMING SAFE COMPARISON on the scheduler's secret. A plain `===` on a secret
   * leaks its length and, in principle, its content through how long the
   * comparison takes. It costs one function to not have that conversation.
   */
  const presented = req.headers.get('x-sync-secret') ?? '';
  let isCron = false;
  if (syncSecret && presented) {
    const a = new TextEncoder().encode(presented);
    const b = new TextEncoder().encode(syncSecret);
    if (a.length === b.length) {
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
      isCron = diff === 0;
    }
  }

  let actorId: string | null = null;
  if (!isCron) {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return reply({ error: 'Not allowed' }, 401);

    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await asCaller.auth.getUser();
    if (!userData?.user) return reply({ error: 'Not allowed' }, 401);

    const { data: actor } = await admin
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', userData.user.id)
      .single();

    if (!actor || actor.role !== 'admin' || !actor.is_active) {
      return reply({ error: 'Not allowed' }, 403);
    }
    actorId = actor.id;
  }

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    /* an empty body is a valid nightly run */
  }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) return reply({ error: 'That request made no sense' }, 400);
  const { days, force } = parsed.data;

  try {
    assertCallableRegion();
  } catch (e) {
    return reply({ error: (e as TikTokError).message, region: currentRegion() }, 502);
  }

  /* --------------------------------------------------------- the token ---- */
  const { data: conn } = await admin
    .from('tiktok_connections')
    .select('id, access_token')
    .is('revoked_at', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conn?.access_token) return reply({ error: 'TikTok is not connected.' }, 409);

  /* ------------------------------------------- the stores worth asking about */
  const { data: stores } = await admin
    .from('tiktok_stores')
    .select('store_id, advertiser_id, store_authorized_bc_id, brand_id')
    .not('brand_id', 'is', null);

  if (!stores || stores.length === 0) {
    return reply({
      ok: true,
      note: 'No TikTok store is matched to a brand yet, so there is nothing to pull.',
      stores: 0,
    });
  }

  const { data: accounts } = await admin
    .from('tiktok_ad_accounts')
    .select('advertiser_id, timezone');
  const zoneOf = new Map((accounts ?? []).map((a) => [a.advertiser_id, a.timezone ?? 'UTC']));

  const summary = {
    region: currentRegion(),
    stores: stores.length,
    calls: 0,
    rowsWritten: 0,
    daysSkipped: 0,
    failures: [] as { store: string; date: string; reason: string }[],
  };

  for (const store of stores) {
    if (!store.store_authorized_bc_id) {
      summary.failures.push({
        store: store.store_id,
        date: '-',
        reason: 'no store_authorized_bc_id, which every report call requires',
      });
      continue;
    }

    /*
     * The videos to ask about: this brand's, authorised, with an id we can use.
     * NOT "every video we know", because a report call is scoped to one store
     * and asking it about another brand's videos would return nothing while
     * still costing the call.
     */
    const { data: videos } = await admin
      .from('content_submissions')
      .select('embed_id')
      .eq('brand_id', store.brand_id)
      .eq('ad_authorized', true)
      .not('embed_id', 'is', null)
      .limit(1000);

    const itemIds = [...new Set((videos ?? []).map((v) => v.embed_id).filter(Boolean))] as string[];
    if (itemIds.length === 0) continue;

    const zone = zoneOf.get(store.advertiser_id) ?? 'UTC';

    // `back` starts at 1: yesterday is the most recent COMPLETE day.
    for (let back = 1; back <= days; back++) {
      const statDate = dayInZone(zone, back);

      if (!force) {
        const { count } = await admin
          .from('tiktok_sync_runs')
          .select('*', { count: 'exact', head: true })
          .eq('advertiser_id', store.advertiser_id)
          .eq('store_id', store.store_id)
          .eq('stat_date', statDate)
          .not('finished_at', 'is', null)
          .is('error', null);
        if ((count ?? 0) > 0) {
          summary.daysSkipped++;
          continue;
        }
      }

      const { data: run } = await admin
        .from('tiktok_sync_runs')
        .insert({
          advertiser_id: store.advertiser_id,
          store_id: store.store_id,
          stat_date: statDate,
          videos_asked: itemIds.length,
          trigger: isCron ? 'cron' : 'admin',
        })
        .select('id')
        .single();

      try {
        /*
         * v2.0, NOT v1.3. At v1.3 this path exists and fails with a useless
         * "ERROR Message.". `filter_value` is SINGULAR on this endpoint, unlike
         * every other filter on the API.
         */
        const u = new URL(
          'https://business-api.tiktok.com/open_api/v2.0/gmv_max/video_list/report/get/'
        );
        u.searchParams.set('advertiser_id', store.advertiser_id);
        u.searchParams.set('store_ids', JSON.stringify([store.store_id]));
        u.searchParams.set('store_authorized_bc_id', store.store_authorized_bc_id);
        u.searchParams.set('start_date', statDate);
        u.searchParams.set('end_date', statDate);
        u.searchParams.set('dimensions', JSON.stringify(['item_id']));
        u.searchParams.set('metrics', JSON.stringify(METRICS));
        u.searchParams.set(
          'filtering',
          JSON.stringify([{ field_name: 'item_id', filter_type: 'IN', filter_value: itemIds }])
        );
        // sort_field, not order_field: order_field is SILENTLY IGNORED and
        // returns zero-spend rows first, which looks exactly like no data.
        u.searchParams.set('sort_field', 'cost');
        u.searchParams.set('sort_type', 'DESC');
        u.searchParams.set('page_size', '1000');

        const res = await fetch(u.toString(), {
          headers: { 'Access-Token': conn.access_token, 'Content-Type': 'application/json' },
        });
        summary.calls++;

        // 200 on failure is their normal. The verdict is the code field.
        const payload = await res.json();
        if (payload?.code !== 0) {
          throw new Error(`${payload?.message ?? 'refused'} (code ${payload?.code})`);
        }

        const rows: ReportRow[] = payload?.data?.list ?? [];
        const toWrite = rows
          .filter((r) => r.dimensions?.item_id)
          .map((r) => ({
            item_id: String(r.dimensions!.item_id),
            stat_date: statDate,
            advertiser_id: store.advertiser_id,
            cost: num(r.metrics?.cost),
            gross_revenue: num(r.metrics?.gross_revenue),
            orders: Math.round(num(r.metrics?.orders)),
            currency: r.metrics?.currency ?? null,
            fetched_at: new Date().toISOString(),
          }));

        if (toWrite.length > 0) {
          const { error } = await admin
            .from('tiktok_video_daily')
            .upsert(toWrite, { onConflict: 'item_id,stat_date' });
          if (error) throw new Error(error.message);
          summary.rowsWritten += toWrite.length;
        }

        await admin
          .from('tiktok_sync_runs')
          .update({ finished_at: new Date().toISOString(), rows_written: toWrite.length })
          .eq('id', run!.id);
      } catch (e) {
        const reason = (e as Error).message;
        summary.failures.push({ store: store.store_id, date: statDate, reason });
        await admin
          .from('tiktok_sync_runs')
          .update({ finished_at: new Date().toISOString(), error: reason.slice(0, 500) })
          .eq('id', run!.id);
      }
    }
  }

  if (actorId) {
    await admin.from('audit_log').insert({
      actor_id: actorId,
      action: 'tiktok.synced',
      subject_type: 'tiktok_connection',
      subject_id: conn.id,
      detail: { ...summary, days, force },
    });
  }

  return reply({ ok: true, ...summary });
});
