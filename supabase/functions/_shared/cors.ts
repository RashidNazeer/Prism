/**
 * CORS for browser-invoked functions.
 *
 * `*` is safe here because these functions carry no cookies and no ambient
 * authority: every one of them requires an Authorization header holding a real
 * access token, and re-checks who that token belongs to server side. An open
 * origin therefore buys an attacker nothing they could not already do with
 * curl. Pinning it to a list would only break Vercel's preview URLs, which are
 * generated fresh on every deploy.
 *
 * Allow-Headers ECHOES what the browser asked for, rather than naming a fixed
 * list. That is not laziness, it is the fix for a real failure: our Supabase
 * client sends a custom `x-application-name` header on every request, a static
 * list did not mention it, and the preflight failed before the function was
 * ever reached. Approving an application simply did nothing. Echoing means
 * adding another client header can never silently break this again.
 *
 * Preflight is not a security boundary. It decides which headers a browser may
 * send, not who is allowed in; that decision is made after the token is
 * verified.
 */

const FALLBACK_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-application-name';

export function corsHeaders(req?: Request): Record<string, string> {
  const requested = req?.headers.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': requested || FALLBACK_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

export function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}
