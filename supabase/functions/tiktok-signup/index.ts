/**
 * TIKTOK-FIRST SIGNUP.
 *
 * Rashid, 2026-09-28: the public page leads with "Continue with TikTok"; once
 * TikTok has vouched for them we thank them and ask for email and password,
 * with the handle already filled in; then the normal application flow.
 *
 * ═══ THIS FUNCTION NEVER LOGS ANYONE IN ═══
 *
 * The browser creates the account with the same `signUp` the apply form already
 * uses, so Supabase issues every session exactly as it does today — same token,
 * the same role stamp, the same behaviour after a refresh and in two tabs. The
 * only question answered here is narrower and checkable: "whoever holds this
 * ticket proved, a moment ago, that they control TikTok account X".
 *
 * That is deliberate and it is the whole posture. A defect in code that mints
 * sessions does not look like a bug, it looks like a successful login.
 *
 * ═══ THREE ACTIONS ═══
 *
 *   start   public   mint a nonce, remember the browser's fingerprint, hand
 *                    back TikTok's approval URL
 *   finish  public   burn the nonce, redeem the code AT ONCE, prove who they
 *                    are, hand back a single-use ticket and the handle
 *   claim   signed in  bind that proven identity to the account that now exists
 *
 * `verify_jwt` is false because the first two are reached from TikTok's redirect
 * with no session in the tab — a creator approving inside TikTok's in-app
 * browser on a phone is exactly the person this is for. `claim` verifies the
 * caller's token itself, the same way `tiktok-connect` does.
 *
 * ═══ TWO SECRETS, BECAUSE TIKTOK GIVES US NO PKCE ═══
 *
 * TikTok's own docs say `code_verifier` is "required for mobile and desktop app
 * only", so a code cannot be cryptographically bound to the browser that began
 * the flow. Instead the browser generates a secret, keeps it, and sends only its
 * SHA-256 at the start. Nothing on the server ever holds the secret. A stolen
 * `state` is not enough, and neither is a stolen code.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';
import { displayCreds, authorizeUrl, exchangeCode, fetchUser, listVideos, revoke } from '../_shared/tiktok-display.ts';

const STATE_TTL_MINUTES = 15;
/* Long enough to choose a password and read the page; short enough that an
   abandoned proof is not lying about for an afternoon. */
const TICKET_TTL_MINUTES = 30;

const HEX64 = /^[0-9a-f]{64}$/;

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    browserSecretHash: z.string().trim().regex(HEX64, 'Bad request'),
  }),
  z.object({
    action: z.literal('finish'),
    code: z.string().trim().min(8).max(2048),
    state: z.string().trim().regex(HEX64, 'Bad request'),
    browserSecret: z.string().trim().min(32).max(200),
  }),
  z.object({
    action: z.literal('claim'),
    ticket: z.string().trim().min(32).max(200),
    browserSecret: z.string().trim().min(32).max(200),
  }),
]);

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
};
const randomHex = (bytes: number) => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * THE HANDLE, OUT OF A VIDEO LINK — and never a guess.
 *
 * `user.info.basic` does not carry the @handle; `user.info.profile` would, and
 * is not approved yet. Every share_url TikTok returns has the shape
 * https://www.tiktok.com/@handle/video/123, and across the 6,171 real TikTok
 * URLs in our own data this reads 99.56% of them.
 *
 * IT TAKES THE `@` SEGMENT, NOT THE LAST ONE. The repo's existing `handleOf`
 * takes the last path segment, which for a video URL is the VIDEO NUMBER — that
 * would have written a 19-digit number into the roster labelled "verified".
 * Anything that does not unmistakably look like a handle returns null, because
 * a wrong handle wearing a verified badge is worse than an honest blank.
 */
function handleFromShareUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (!/(^|\.)tiktok\.com$/i.test(u.hostname)) return null;
  const at = u.pathname.split('/').filter(Boolean).find((x) => x.startsWith('@'));
  if (!at) return null;
  const h = at.slice(1).toLowerCase();
  return /^[a-z0-9._]{2,24}$/.test(h) ? h : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return json({ error: 'Bad request' }, 400, req);
  }

  let creds;
  try { creds = displayCreds(); } catch (e) { return json({ error: (e as Error).message }, 500, req); }

  /* ─────────────────────────────────────────────────────────── start ──── */
  if (body.action === 'start') {
    /* A signed-in applicant may start this to verify a handle they typed. The
       token is verified properly rather than trusted; no token is the ordinary
       case and is fine. */
    let startedBy: string | null = null;
    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader && anonKey) {
      const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
      const { data: who } = await asCaller.auth.getUser();
      startedBy = who?.user?.id ?? null;
    }

    const state = randomHex(32);
    const { error } = await admin.from('tiktok_signup_states').insert({
      state,
      browser_secret_hash: body.browserSecretHash,
      started_by: startedBy,
      expires_at: new Date(Date.now() + STATE_TTL_MINUTES * 60_000).toISOString(),
    });
    if (error) {
      console.error('[tiktok-signup] state insert', error);
      return json({ error: 'Could not start that. Try again.' }, 500, req);
    }

    /* Opportunistic sweep, the same shape the creator flow uses: expired rows
       are rubbish, and there is no scheduler for this. */
    await admin.from('tiktok_signup_states').delete()
      .lt('expires_at', new Date(Date.now() - 86_400_000).toISOString());

    return json({ url: authorizeUrl(creds, state) }, 200, req);
  }

  /* ────────────────────────────────────────────────────────── finish ──── */
  if (body.action === 'finish') {
    const secretHash = await sha256(body.browserSecret);

    /*
     * BURN THE NONCE AND CHECK THE BROWSER IN ONE STATEMENT. Doing it as
     * select-then-update leaves a window where two callbacks both pass, and
     * comparing the hash in TypeScript is a hand-written secret comparison —
     * the database decides both, together.
     */
    const { data: burned } = await admin
      .from('tiktok_signup_states')
      .update({ used_at: new Date().toISOString() })
      .eq('state', body.state)
      .eq('browser_secret_hash', secretHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('started_by')
      .maybeSingle();

    /* ONE MESSAGE for unknown, used, expired, and wrong browser. Telling the
       caller which would let a live nonce be probed for. */
    if (!burned) return json({ error: 'That link has expired. Start again from the sign-up page.' }, 400, req);

    /*
     * REDEEM THE CODE NOW, before anything else can fail. It is single use and
     * short lived, and every second it stays unspent is a second it can be
     * stolen out of a phone's history or a log.
     */
    let token;
    try {
      token = await exchangeCode(creds, body.code);
    } catch (e) {
      return json({ error: `TikTok could not confirm that: ${(e as Error).message}` }, 502, req);
    }

    let who: Awaited<ReturnType<typeof fetchUser>> = {};
    try { who = await fetchUser(token.access_token, token.scope); } catch { /* cosmetic */ }
    const openId = token.open_id ?? who.open_id;
    if (!openId) return json({ error: 'TikTok did not say which account that was' }, 502, req);

    /* The handle, from their own most recent video. Best effort: an account
       with no videos simply has no handle yet, and the screen says so. */
    let handle: string | null = who.username ? String(who.username).toLowerCase() : null;
    if (!handle) {
      try {
        const vids = await listVideos(token.access_token);
        for (const v of vids.videos ?? []) {
          const h = handleFromShareUrl((v as Record<string, unknown>).share_url);
          if (h) { handle = h; break; }
        }
      } catch { /* no videos, or the scope was declined */ }
    }

    /*
     * ALREADY SOMEBODY ELSE'S? Say so plainly — at this point the caller has
     * PROVED they control this TikTok account, so an honest message tells them
     * about themselves and nobody else. Before the code was spent it would have
     * been a probe; after, it is the only useful thing to say. "Start again" on
     * a permanent bar is an instruction to loop forever.
     */
    const { data: claimed } = await admin
      .from('tiktok_identities')
      .select('profile_id')
      .eq('open_id', openId)
      .is('released_at', null)
      .limit(1)
      .maybeSingle();
    if (claimed && claimed.profile_id && claimed.profile_id !== burned.started_by) {
      try { await revoke(creds, token.access_token); } catch { /* best effort */ }
      return json({
        error: 'That TikTok account has already been used to sign up here. If it should be yours, ask the Wurx team to release it.',
      }, 409, req);
    }

    const ticket = randomHex(32);
    const { error: pendErr } = await admin.from('tiktok_signup_pending').insert({
      ticket_hash: await sha256(ticket),
      browser_secret_hash: secretHash,
      open_id: openId,
      union_id: who.union_id ?? null,
      display_name: who.display_name ?? null,
      avatar_url: who.avatar_url ?? null,
      handle,
      scope: token.scope ?? '',
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      access_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      refresh_expires_at: token.refresh_expires_in ? new Date(Date.now() + token.refresh_expires_in * 1000).toISOString() : null,
      started_by: burned.started_by,
      expires_at: new Date(Date.now() + TICKET_TTL_MINUTES * 60_000).toISOString(),
    });
    if (pendErr) {
      console.error('[tiktok-signup] pending insert', pendErr);
      return json({ error: 'Could not finish that. Start again from the sign-up page.' }, 500, req);
    }

    return json({
      ticket,
      handle,
      displayName: who.display_name ?? null,
      avatarUrl: who.avatar_url ?? null,
      alreadySignedIn: !!burned.started_by,
    }, 200, req);
  }

  /* ─────────────────────────────────────────────────────────── claim ──── */
  /* The only action that needs a session, and it is verified with the auth
     server rather than decoded. */
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader || !anonKey) return json({ error: 'Not signed in' }, 401, req);
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: whoami } = await asCaller.auth.getUser();
  const profileId = whoami?.user?.id;
  if (!profileId) return json({ error: 'Not signed in' }, 401, req);

  const { data: bound, error: claimErr } = await admin.rpc('claim_tiktok_signup', {
    p_ticket_hash: await sha256(body.ticket),
    p_browser_secret_hash: await sha256(body.browserSecret),
    p_profile: profileId,
  });
  if (claimErr) {
    console.error('[tiktok-signup] claim', claimErr);
    /* The database's messages here are written for the person reading them and
       carry no secret; passing them through beats "something went wrong" on the
       one screen where being stuck is unrecoverable. */
    return json({ error: claimErr.message }, 409, req);
  }

  /* The function's OUT columns carry an `out_` prefix: declared as `open_id`
     and `handle` they shadowed the real columns inside its own body and every
     bind failed with "column reference open_id is ambiguous". */
  const row = (Array.isArray(bound) ? bound[0] : bound) as
    { out_handle?: string | null; out_already?: boolean } | null;
  return json({ ok: true, handle: row?.out_handle ?? null, already: !!row?.out_already }, 200, req);
});
