/**
 * tiktok-creator-callback
 * ---------------------------------------------------------------------------
 * The other half of the creator's OAuth round trip, and the only PUBLIC part of
 * it.
 *
 * WHY PUBLIC. The browser arrives here straight from tiktok.com and may carry
 * no Wurx session in that tab: a creator who started on their phone, approved in
 * TikTok's in-app browser, and came back has no cookie to show us. Demanding one
 * would break the flow for exactly the people it is built for.
 *
 * WHAT MAKES IT SAFE IS NOT OBSCURITY. It is the `state` nonce:
 *
 *   - minted by `tiktok-creator` for ONE signed-in creator, from the platform
 *     CSPRNG, and stored server side
 *   - looked up here, so the creator is read from OUR row and never from the
 *     request
 *   - BURNED on first use, in a conditional update, so a replayed callback
 *     finds nothing
 *   - expired after fifteen minutes regardless
 *
 * A `creator_id` is never accepted from the caller. There is no parameter for
 * one and adding it would hand anybody the ability to attach their TikTok
 * account to somebody else's profile.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';
import { displayCreds, exchangeCode, fetchUser } from '../_shared/tiktok-display.ts';

const Body = z.object({
  /* TikTok's authorisation code. Opaque, so only length and shape are checked. */
  code: z.string().trim().min(8).max(2048),
  /* Our own nonce: 32 random bytes as hex, exactly as minted. */
  state: z.string().trim().regex(/^[0-9a-f]{64}$/, 'That sign-in link is not valid'),
});

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let creds;
  try {
    creds = displayCreds();
  } catch (e) {
    return reply({ error: (e as Error).message }, 500);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reply({ error: 'Send JSON' }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return reply({ error: parsed.error.issues[0]?.message ?? 'That request is not valid' }, 400);
  }
  const { code, state } = parsed.data;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /*
   * BURN THE NONCE IN ONE STATEMENT, and read the creator out of what it
   * returns. Doing this as select-then-update leaves a window where two
   * callbacks arriving together both pass; `used_at is null` inside the UPDATE
   * makes the database the thing that decides, and only one can win.
   */
  const { data: burned, error: burnErr } = await admin
    .from('creator_tiktok_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('state', state)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('creator_id')
    .maybeSingle();

  if (burnErr || !burned) {
    return reply({ error: 'That connection link has already been used or has expired.' }, 400);
  }
  const creatorId = burned.creator_id as string;

  /* ------------------------------------------------------- the handshake -- */
  let token;
  try {
    token = await exchangeCode(creds, code);
  } catch (e) {
    return reply({ error: (e as Error).message }, 502);
  }

  let who: Awaited<ReturnType<typeof fetchUser>> = {};
  try {
    who = await fetchUser(token.access_token);
  } catch {
    /*
     * NOT FATAL. The token is good, which is the part that matters; we simply
     * have no display name to show yet and the next refresh will fill it in.
     * Failing the whole connection here would throw away a working grant over a
     * cosmetic field.
     */
  }

  const openId = token.open_id ?? who.open_id;
  if (!openId) return reply({ error: 'TikTok did not say which account that was' }, 502);

  const nowIso = new Date().toISOString();

  const { error: connErr } = await admin.from('creator_tiktok_connections').upsert(
    {
      creator_id: creatorId,
      open_id: openId,
      union_id: who.union_id ?? null,
      display_name: who.display_name ?? null,
      avatar_url: who.avatar_url ?? null,
      /*
       * WHAT TIKTOK SAYS THEY GRANTED, not what we asked for. A token
       * permanently carries the scopes it was minted with, so the only honest
       * record of "can we read their videos" is the one that came back.
       */
      scope: token.scope ?? '',
      connected_at: nowIso,
      last_error: null,
      // A reconnect after a disconnect has to clear this, or the screen keeps
      // saying they are disconnected while a live token sits behind it.
      revoked_at: null,
    },
    { onConflict: 'creator_id' }
  );
  if (connErr) return reply({ error: 'Could not save that connection' }, 500);

  const { error: tokErr } = await admin
    .from('creator_tiktok_tokens')
    .upsert(
      {
        creator_id: creatorId,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        access_expires_at: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
        refresh_expires_at: token.refresh_expires_in
          ? new Date(Date.now() + token.refresh_expires_in * 1000).toISOString()
          : null,
        updated_at: nowIso,
      },
      { onConflict: 'creator_id' }
    );
  if (tokErr) return reply({ error: 'Could not save that connection' }, 500);

  await admin.from('audit_log').insert({
    actor_id: creatorId,
    actor_role: 'creator',
    action: 'tiktok_creator.connected',
    subject_type: 'creator_tiktok_connection',
    subject_id: creatorId,
    /* Names and scopes, never the token. The schema comment on audit_log says
     * "never put secrets in here" and it means it. */
    detail: { display_name: who.display_name ?? null, scope: token.scope ?? '' },
  });

  return reply({ ok: true, displayName: who.display_name ?? null });
});
