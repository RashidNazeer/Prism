import { getSupabase } from '@/lib/supabase';

/**
 * Calling the TikTok edge functions, with the one header that must never be
 * forgotten.
 *
 * THE REGION IS THE WHOLE POINT OF THIS FILE.
 *
 * Supabase runs an edge function in the region nearest whoever invoked it. Wurx
 * operates from Pakistan, so that is Mumbai, `ap-south-1`, and TikTok blocks
 * every Indian IP because India banned TikTok in 2020. The reply is:
 *
 *     code -1  "Client IP address is in banned Country list."
 *
 * which reads exactly like a bad app secret and is not one. `x-region` pins the
 * function to Tokyo instead.
 *
 * A header that every call site has to remember is a header that one call site
 * will eventually forget, and the failure is a misleading error message rather
 * than a crash. So no component may call `functions.invoke` for TikTok
 * directly; they all come through here. The edge functions ALSO check their own
 * region and refuse before making the request, so a forgotten header is caught
 * on both sides rather than blamed on the credentials.
 *
 * `Access-Control-Allow-Headers` is not a worry: our shared `cors.ts` echoes
 * whatever the browser asks for rather than naming a fixed list, so `x-region`
 * survives the preflight already.
 */
const TIKTOK_REGION = 'ap-northeast-1';

/**
 * `functions.invoke` reports any non-2xx as a generic "Edge Function returned a
 * non-2xx status code" and throws the real body away, so the careful message
 * the function wrote is lost exactly when it matters. Read it off the response.
 */
async function messageFrom(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* not JSON: fall through to the generic message */
    }
  }
  return (error as Error)?.message || fallback;
}

async function callTikTokFunction<T>(
  name: 'tiktok-connect' | 'tiktok-callback',
  body: Record<string, unknown>,
  fallback: string
): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke(name, {
    body,
    headers: { 'x-region': TIKTOK_REGION },
  });
  if (error) throw new Error(await messageFrom(error, fallback));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/* ------------------------------------------------------------ the actions -- */

export function startTikTokConnect() {
  return callTikTokFunction<{ url: string; expiresAt: string }>(
    'tiktok-connect',
    { action: 'connect.start' },
    'Could not start the TikTok connection.'
  );
}

export function finishTikTokConnect(authCode: string, state: string) {
  return callTikTokFunction<{
    ok: true;
    accounts: number;
    stores: number;
    warning: string | null;
  }>('tiktok-callback', { authCode, state }, 'Could not finish the TikTok connection.');
}

export function recheckTikTokConnection() {
  return callTikTokFunction<{
    ok: true;
    accounts: number;
    stores: number;
    storeFailures: { advertiserId: string; reason: string }[];
  }>('tiktok-connect', { action: 'connection.recheck' }, 'Could not check the connection.');
}

export function disconnectTikTok(connectionId: string) {
  return callTikTokFunction<{ ok: true }>(
    'tiktok-connect',
    { action: 'connection.disconnect', connectionId },
    'Could not disconnect.'
  );
}

export function mapTikTokStore(advertiserId: string, storeId: string, brandId: string | null) {
  return callTikTokFunction<{ ok: true }>(
    'tiktok-connect',
    { action: 'store.map', advertiserId, storeId, brandId },
    'Could not save that mapping.'
  );
}
