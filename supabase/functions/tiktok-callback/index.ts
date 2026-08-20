/**
 * tiktok-callback
 * ---------------------------------------------------------------------------
 * The ONE public action in the TikTok integration: trade the `auth_code` TikTok
 * sent us for an access token.
 *
 * WHY IT IS PUBLIC. TikTok redirects the browser to our callback page, and the
 * person landing there may have no hub session, or a different one, or have
 * come back in another tab. Requiring a signed-in caller would fail the flow at
 * the last step for reasons that look random.
 *
 * WHAT MAKES THAT SAFE is the `state` nonce, and nothing else, so it is worth
 * being precise about what it does:
 *
 *   - It was minted by `tiktok-connect`, which only an ADMIN can call, so the
 *     flow provably began with an admin.
 *   - It is 32 random bytes, so it cannot be guessed.
 *   - It expires in ten minutes.
 *   - It is BURNED in a conditional update, so a replayed callback loses the
 *     race and gets nothing. Two simultaneous callbacks cannot both win.
 *
 * An `auth_code` on its own is therefore worth nothing to anybody.
 *
 * KEPT DELIBERATELY SMALL. It takes two strings and returns a summary. It has
 * no other actions, and it never returns the token or the app secret.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';
import { currentRegion, exchangeAuthCode, TikTokError } from '../_shared/tiktok.ts';
import { syncAccountsAndStores } from '../_shared/tiktok-sync.ts';

const Body = z.object({
  authCode: z.string().trim().min(8).max(512),
  state: z.string().trim().min(32).max(128),
});

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appId = Deno.env.get('TIKTOK_APP_ID');
  const appSecret = Deno.env.get('TIKTOK_APP_SECRET');

  if (!appId || !appSecret) {
    return reply({ error: 'The TikTok app is not configured on this project.' }, 500);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reply({ error: 'Expected a JSON body' }, 400);
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return reply({ error: 'That callback was not something we sent you here for.' }, 400);
  }
  const { authCode, state } = parsed.data;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /*
   * BURN THE NONCE FIRST, and do it as a conditional UPDATE rather than a read
   * followed by a write. `used_at is null` inside the statement means the
   * database decides the winner, so two callbacks arriving together cannot both
   * be honoured. A read-then-write here would be a genuine race.
   */
  const nowIso = new Date().toISOString();
  const { data: burned, error: burnErr } = await admin
    .from('tiktok_oauth_states')
    .update({ used_at: nowIso })
    .eq('state', state)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .select('state, started_by')
    .maybeSingle();

  if (burnErr) return reply({ error: 'Could not verify that request.' }, 500);

  if (!burned) {
    /*
     * One message for every reason: unknown, already used, or expired. Telling
     * the caller WHICH would let somebody probe for live nonces, and an admin
     * has the same next step in all three cases anyway.
     */
    return reply(
      {
        error:
          'That connection attempt is no longer valid. It may have already been ' +
          'used, or taken more than ten minutes. Start again from the TikTok screen.',
      },
      400
    );
  }

  try {
    const grant = await exchangeAuthCode(appId, appSecret, authCode);

    if (!grant?.access_token) {
      throw new TikTokError('TikTok said yes but sent no access token.');
    }

    const advertiserIds = (grant.advertiser_ids ?? []).map(String);

    /*
     * RETIRE ONLY WHAT THIS GRANT REPLACES, changed 2026-08-20.
     *
     * This used to revoke EVERY live connection before saving the new one, on
     * the reasoning that two live tokens make "which one do we report with" a
     * coin toss. That reasoning was right while one Business Center held every
     * ad account. It is wrong under Rashid's plan: "each brand will have it's
     * own Business center connection".
     *
     * With the old behaviour, connecting brand B silently killed brand A. No
     * error, no warning: A's creators' numbers simply froze at yesterday and
     * stayed there until somebody asked why. On a money screen that is the
     * worst failure shape available.
     *
     * The coin toss is answered properly now instead. `tiktok_sync` resolves a
     * token PER STORE, through that store's advertiser to the connection that
     * granted it, so two live connections are not ambiguous — they are two
     * Business Centers, which is the actual situation.
     *
     * What still gets retired is a connection this grant genuinely supersedes:
     * one covering an advertiser the new grant also covers. Re-authorising the
     * same Business Center replaces its token, as it always did, and leaves
     * every other brand alone.
     */
    if (advertiserIds.length > 0) {
      const { data: superseded } = await admin
        .from('tiktok_ad_accounts')
        .select('connection_id')
        .in('advertiser_id', advertiserIds);

      const ids = [...new Set((superseded ?? []).map((a) => a.connection_id).filter(Boolean))];
      if (ids.length > 0) {
        await admin
          .from('tiktok_connections')
          .update({ access_token: '', revoked_at: nowIso })
          .in('id', ids)
          .is('revoked_at', null);
      }
    }

    const { data: conn, error: connErr } = await admin
      .from('tiktok_connections')
      .insert({
        access_token: grant.access_token,
        scope: typeof grant.scope === 'string' ? grant.scope : JSON.stringify(grant.scope ?? null),
        granted_advertiser_ids: advertiserIds,
        connected_by: burned.started_by,
        last_verified_at: nowIso,
      })
      .select('id')
      .single();

    if (connErr || !conn) {
      return reply({ error: `Could not save the connection: ${connErr?.message}` }, 500);
    }

    // Failing to list the accounts does NOT fail the connection: the token is
    // good and saved, and Re-check exists precisely for this.
    let summary = { accounts: 0, stores: 0, storeFailures: [] as unknown[] };
    let warning: string | null = null;
    try {
      summary = await syncAccountsAndStores(admin, conn.id, appId, appSecret, grant.access_token);
    } catch (e) {
      warning = (e as Error).message;
      await admin
        .from('tiktok_connections')
        .update({ last_error: warning.slice(0, 500) })
        .eq('id', conn.id);
    }

    await admin.from('audit_log').insert({
      actor_id: burned.started_by,
      action: 'tiktok.connected',
      subject_type: 'tiktok_connection',
      subject_id: conn.id,
      detail: {
        advertisers: advertiserIds.length,
        accounts: summary.accounts,
        stores: summary.stores,
        region: currentRegion(),
        warning,
      },
    });

    return reply({
      ok: true,
      accounts: summary.accounts,
      stores: summary.stores,
      warning,
      region: currentRegion(),
    });
  } catch (e) {
    if (e instanceof TikTokError) {
      return reply({ error: e.message, code: e.code, region: currentRegion() }, 502);
    }
    return reply({ error: (e as Error).message }, 500);
  }
});
