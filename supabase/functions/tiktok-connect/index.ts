/**
 * tiktok-connect
 * ---------------------------------------------------------------------------
 * Everything an ADMIN does to the TikTok ads connection: start one, re-check
 * it, disconnect it, and map a store to a Wurx brand.
 *
 * The one thing it deliberately does NOT do is finish the OAuth handshake. That
 * lives in `tiktok-callback`, which is public because the person coming back
 * from TikTok may have no session, and keeping the two apart means the public
 * surface is one action instead of five.
 *
 * Same shape as `manage-brand`:
 *   1. Verify the access token with the auth server. Not decode it.
 *   2. Read the caller's role FROM THE PROFILES TABLE, because a JWT claim can
 *      be an hour stale and someone demoted five minutes ago still carries it.
 *   3. Validate with Zod, again, even though the browser already did.
 *   4. Audit anything that changes.
 *
 * ADMIN ONLY, not staff. `ops` can review creators all day; wiring up the ad
 * account that reads a client's live spend is a narrower job than that.
 *
 * The access token itself never leaves this function. Note that no reply below
 * ever contains it, not even to an admin: there are no policies on
 * `tiktok_connections` for exactly the same reason.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';
import { authorizeUrl, currentRegion, TikTokError } from '../_shared/tiktok.ts';
import { syncAccountsAndStores } from '../_shared/tiktok-sync.ts';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect.start') }),
  z.object({ action: z.literal('connection.recheck') }),
  /*
   * A DIAGNOSTIC. TikTok's docs portal is client rendered and unreadable by
   * fetch, and several documented details are wrong, so the only way to learn
   * the true shape of a response is to look at one. This cannot be done from a
   * laptop in Pakistan, because that request would leave from a Pakistani IP and
   * meet the same country block as Mumbai. So the probe has to live in here,
   * where the call goes out from Tokyo.
   *
   * It returns the raw payload for the endpoints we depend on. Admin only, and
   * it never touches the token: it reads it and does not report it.
   */
  z.object({ action: z.literal('connection.probe') }),
  /*
   * A REPORT PROBE, admin only. Same reason as the one above: the shape of a
   * GMV Max report cannot be learned from the docs and cannot be asked from a
   * laptop in Pakistan. This one exists to answer a specific question Rashid
   * raised, whether the item_id filter accepts a BATCH, because the answer is
   * the difference between one API call per creator and one per video.
   */
  z.object({
    action: z.literal('report.probe'),
    advertiserId: z.string().trim().regex(/^[0-9]{6,32}$/),
    storeId: z.string().trim().regex(/^[0-9]{6,32}$/),
    bcId: z.string().trim().regex(/^[0-9]{6,32}$/),
    itemIds: z.array(z.string().trim().regex(/^[0-9]{6,32}$/)).max(50).default([]),
    // Ask about EVERY video the store has, rather than a named list. This is
    // how we find spend on videos we do not hold a link for.
    allVideos: z.boolean().default(false),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // Both parameters so the true metric list and the true version can be found
    // by asking, without a redeploy per guess.
    metrics: z.array(z.string().trim().max(40)).min(1).max(20).optional(),
    apiVersion: z.enum(['v1.3', 'v2.0']).default('v2.0'),
  }),
  /*
   * A GENERIC READ PROBE, admin only.
   *
   * Every specific probe so far had to be written, deployed and then thrown
   * away, and each round trip cost a deploy to learn one fact. This asks any
   * GMV Max read endpoint with any parameters and returns the raw envelope, so
   * a question about the API costs a request rather than a release.
   *
   * DELIBERATELY NARROW. GET only, `/open_api/` only, on TikTok's host alone,
   * and it returns what TikTok said without ever reporting the token it used.
   * It cannot write, and there is no path parameter that would make it able to.
   */
  z.object({
    action: z.literal('raw.probe'),
    path: z.string().trim().startsWith('/open_api/').max(200),
    query: z.record(z.string(), z.string()).default({}),
  }),
  z.object({ action: z.literal('connection.disconnect'), connectionId: z.uuid() }),
  z.object({
    action: z.literal('store.map'),
    /*
     * BOTH IDS, because one store can be authorised to several ad accounts and
     * the numbers belong to the PAIR. Rashid's Penetrex store comes back on
     * both of his accounts; mapping "the store" alone would leave it ambiguous
     * which advertiser we then ask for the spend, and the wrong answer there is
     * another advertiser's money on a creator's video.
     */
    advertiserId: z.string().trim().regex(/^[0-9]{6,32}$/, 'That is not a TikTok ad account id'),
    storeId: z.string().trim().regex(/^[0-9]{6,32}$/, 'That is not a TikTok store id'),
    // null clears the mapping, which is a real thing an admin needs to do after
    // mapping the wrong brand.
    brandId: z.uuid().nullable(),
  }),
]);

/**
 * A raw GET that returns TikTok's WHOLE envelope, code and message included,
 * rather than unwrapping `data` and throwing on a non-zero code. Used only by
 * the probe, where an error IS the answer we are looking for.
 */
async function rawGet(path: string, token: string, query: Record<string, string>) {
  const u = new URL(`https://business-api.tiktok.com${path}`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), {
    headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
  });
  return await res.json();
}

/** A nonce with enough entropy that guessing it is not a strategy. */
function mintState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI');
  if (!appId || !appSecret || !redirectUri) {
    return reply(
      {
        error:
          'The TikTok app is not configured on this project. TIKTOK_APP_ID, ' +
          'TIKTOK_APP_SECRET and TIKTOK_REDIRECT_URI must all be set as ' +
          'function secrets.',
      },
      500
    );
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return reply({ error: 'Not signed in' }, 401);

  // ---------------------------------------------------------- who is this --
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) return reply({ error: 'Not signed in' }, 401);

  // Service role from here on. Nothing above this line was trusted.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: actor, error: actorErr } = await admin
    .from('profiles')
    .select('id, email, role, is_active')
    .eq('id', userData.user.id)
    .single();

  if (actorErr || !actor) return reply({ error: 'Not allowed' }, 403);

  if (actor.role !== 'admin' || !actor.is_active) {
    await admin.from('audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'tiktok.write_denied',
      subject_type: 'tiktok_connection',
      detail: { reason: actor.is_active ? 'not an admin' : 'account inactive' },
    });
    return reply({ error: 'Not allowed' }, 403);
  }

  // ------------------------------------------------------------ the input --
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reply({ error: 'Expected a JSON body' }, 400);
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return reply({ error: parsed.error.issues[0]?.message ?? 'That request made no sense' }, 400);
  }
  const body = parsed.data;

  const audit = (action: string, detail: Record<string, unknown>, subjectId?: string) =>
    admin.from('audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action,
      subject_type: 'tiktok_connection',
      subject_id: subjectId ?? null,
      detail,
    });

  try {
    /* ------------------------------------------------------------- start -- */
    if (body.action === 'connect.start') {
      const state = mintState();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

      const { error } = await admin.from('tiktok_oauth_states').insert({
        state,
        started_by: actor.id,
        expires_at: expiresAt,
      });
      if (error) return reply({ error: `Could not start: ${error.message}` }, 500);

      /*
       * Tidy up behind us. Nonces are worthless once expired and nobody is ever
       * going to run a cron job for four rows, so the next person to press
       * Connect clears the last person's litter.
       */
      await admin
        .from('tiktok_oauth_states')
        .delete()
        .lt('expires_at', new Date(Date.now() - 60 * 60_000).toISOString());

      await audit('tiktok.connect_started', { redirectUri });

      return reply({ url: authorizeUrl(appId, redirectUri, state), expiresAt });
    }

    /* ----------------------------------------------------------- recheck -- */
    if (body.action === 'connection.recheck') {
      const { data: conn } = await admin
        .from('tiktok_connections')
        .select('id, access_token')
        .is('revoked_at', null)
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conn) return reply({ error: 'There is no live connection to check.' }, 404);

      try {
        const result = await syncAccountsAndStores(
          admin,
          conn.id,
          appId,
          appSecret,
          conn.access_token
        );
        await admin
          .from('tiktok_connections')
          .update({ last_verified_at: new Date().toISOString(), last_error: null })
          .eq('id', conn.id);

        await audit('tiktok.rechecked', { ...result }, conn.id);
        return reply({ ok: true, ...result, region: currentRegion() });
      } catch (e) {
        const message = (e as Error).message;
        // Record the failure ON the connection, so the screen can say the
        // connection is unwell instead of showing stale numbers as if fine.
        await admin
          .from('tiktok_connections')
          .update({ last_error: message.slice(0, 500) })
          .eq('id', conn.id);
        await audit('tiktok.recheck_failed', { message }, conn.id);
        return reply({ error: message, region: currentRegion() }, 502);
      }
    }

    /* ------------------------------------------------------------- probe -- */
    if (body.action === 'connection.probe') {
      const { data: conn } = await admin
        .from('tiktok_connections')
        .select('id, access_token, granted_advertiser_ids')
        .is('revoked_at', null)
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conn) return reply({ error: 'There is no live connection to probe.' }, 404);

      const out: Record<string, unknown> = { region: currentRegion() };

      const raw = async (label: string, fn: () => Promise<unknown>) => {
        try {
          out[label] = await fn();
        } catch (e) {
          out[label] = { failed: (e as Error).message };
        }
      };

      await raw('advertisers', () =>
        rawGet('/open_api/v1.3/oauth2/advertiser/get/', conn.access_token, {
          app_id: appId,
          secret: appSecret,
        })
      );

      for (const advertiserId of conn.granted_advertiser_ids ?? []) {
        await raw(`stores:${advertiserId}`, () =>
          rawGet('/open_api/v1.3/gmv_max/store/list/', conn.access_token, {
            advertiser_id: advertiserId,
          })
        );
        await raw(`info:${advertiserId}`, () =>
          rawGet('/open_api/v1.3/advertiser/info/', conn.access_token, {
            advertiser_ids: JSON.stringify([advertiserId]),
          })
        );
      }

      return reply(out);
    }

    /* ------------------------------------------------------ report probe -- */
    if (body.action === 'report.probe') {
      const { data: conn } = await admin
        .from('tiktok_connections')
        .select('access_token')
        .is('revoked_at', null)
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!conn) return reply({ error: 'There is no live connection to probe.' }, 404);

      /*
       * v2.0, NOT v1.3. At v1.3 this path exists and fails with a useless
       * "ERROR Message.", which is the single fact that blocks everything until
       * somebody knows it.
       *
       * `filter_value` is SINGULAR on this endpoint. `/gmv_max/report/get/`
       * wants `filter_values` plural and rejects item_id anyway.
       */
      const u = new URL(
        `https://business-api.tiktok.com/open_api/${body.apiVersion}/gmv_max/video_list/report/get/`
      );
      u.searchParams.set('advertiser_id', body.advertiserId);
      u.searchParams.set('store_ids', JSON.stringify([body.storeId]));
      u.searchParams.set('store_authorized_bc_id', body.bcId);
      u.searchParams.set('start_date', body.startDate);
      u.searchParams.set('end_date', body.endDate);
      u.searchParams.set('dimensions', JSON.stringify(['item_id']));
      u.searchParams.set(
        'metrics',
        JSON.stringify(body.metrics ?? ['cost', 'gross_revenue', 'roi', 'orders'])
      );
      // Unfiltered when `allVideos`, which is how we see spend on videos we hold
      // no link for. Otherwise scoped to the ids asked about.
      if (!body.allVideos && body.itemIds.length > 0) {
        u.searchParams.set(
          'filtering',
          JSON.stringify([
            { field_name: 'item_id', filter_type: 'IN', filter_value: body.itemIds },
          ])
        );
      }
      u.searchParams.set('sort_field', 'cost');
      u.searchParams.set('sort_type', 'DESC');
      u.searchParams.set('page_size', '100');

      const res = await fetch(u.toString(), {
        headers: { 'Access-Token': conn.access_token, 'Content-Type': 'application/json' },
      });

      return reply({
        region: currentRegion(),
        url: u.toString().replace(/access_token=[^&]*/, 'access_token=REDACTED'),
        payload: await res.json(),
      });
    }

    /* --------------------------------------------------------- raw probe -- */
    if (body.action === 'raw.probe') {
      const { data: conn } = await admin
        .from('tiktok_connections')
        .select('access_token')
        .is('revoked_at', null)
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!conn) return reply({ error: 'There is no live connection to probe.' }, 404);

      return reply({
        region: currentRegion(),
        path: body.path,
        payload: await rawGet(body.path, conn.access_token, body.query),
      });
    }

    /* -------------------------------------------------------- disconnect -- */
    if (body.action === 'connection.disconnect') {
      /*
       * The token is BLANKED, not just flagged. A revoked connection that still
       * holds a working credential is a revoked connection in name only. The row
       * survives so the audit trail and the account rows still resolve.
       */
      const { error } = await admin
        .from('tiktok_connections')
        .update({
          access_token: '',
          revoked_at: new Date().toISOString(),
          revoked_by: actor.id,
        })
        .eq('id', body.connectionId)
        .is('revoked_at', null);

      if (error) return reply({ error: `Could not disconnect: ${error.message}` }, 500);

      await audit('tiktok.disconnected', {}, body.connectionId);
      return reply({ ok: true });
    }

    /* --------------------------------------------------------- store map -- */
    if (body.action === 'store.map') {
      if (body.brandId) {
        const { data: brand } = await admin
          .from('brands')
          .select('id, name')
          .eq('id', body.brandId)
          .maybeSingle();
        if (!brand) return reply({ error: 'That brand does not exist.' }, 400);
      }

      const { data: updated, error } = await admin
        .from('tiktok_stores')
        .update({
          brand_id: body.brandId,
          mapped_by: body.brandId ? actor.id : null,
          mapped_at: body.brandId ? new Date().toISOString() : null,
        })
        .eq('store_id', body.storeId)
        .eq('advertiser_id', body.advertiserId)
        .select('store_id, brand_id')
        .maybeSingle();

      if (error) return reply({ error: `Could not save the mapping: ${error.message}` }, 500);
      if (!updated) return reply({ error: 'That store is not one we know about.' }, 404);

      await audit(body.brandId ? 'tiktok.store_mapped' : 'tiktok.store_unmapped', {
        storeId: body.storeId,
        advertiserId: body.advertiserId,
        brandId: body.brandId,
      });

      return reply({ ok: true });
    }

    return reply({ error: 'Unknown action' }, 400);
  } catch (e) {
    if (e instanceof TikTokError) {
      return reply({ error: e.message, code: e.code, region: currentRegion() }, 502);
    }
    return reply({ error: (e as Error).message }, 500);
  }
});
