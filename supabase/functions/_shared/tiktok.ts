/**
 * The TikTok Business API, and the two things about it that will waste your day.
 *
 * ---------------------------------------------------------------------------
 * 1. THE CALL MUST NOT LEAVE FROM INDIA.
 *
 * Supabase runs an edge function in the region nearest whoever invoked it. Wurx
 * operates from Pakistan, so that is Mumbai, `ap-south-1`. TikTok blocks every
 * Indian IP, because India banned TikTok in 2020, and answers:
 *
 *     code -1  "Client IP address is in banned Country list."
 *
 * That reads exactly like a bad app secret, which is how it costs an afternoon.
 * Callers pin the region with an `x-region: ap-northeast-1` header, but a header
 * set by the caller is a header a caller can forget, so `assertCallableRegion`
 * below refuses BEFORE any request leaves, naming the real problem. Verified by
 * probing: ap-south-1 blocked; ap-northeast-1, ap-southeast-1, eu-west-2 and
 * us-east-1 all fine. Tokyo is closest to the people using this.
 *
 * ---------------------------------------------------------------------------
 * 2. TIKTOK RETURNS HTTP 200 ON FAILURE.
 *
 * Every response is 200 and the verdict is in the `code` field, where 0 means
 * success. `res.ok` is therefore meaningless, and code that trusts it stores
 * access tokens that were never issued. `callTikTok` is the only way this
 * project talks to them, and it treats a non-zero code as a thrown error.
 */

const BASE = 'https://business-api.tiktok.com';

/** Where Supabase says this function is running. */
export function currentRegion(): string {
  return Deno.env.get('SB_REGION') ?? Deno.env.get('DENO_REGION') ?? 'unknown';
}

/**
 * Regions TikTok has been verified to answer from. An allow list rather than a
 * ban list: a new region we have never tried is a thing to check deliberately,
 * not to discover through a misleading error in production.
 */
const ALLOWED = new Set(['ap-northeast-1', 'ap-southeast-1', 'eu-west-2', 'us-east-1']);

export class TikTokError extends Error {
  constructor(
    message: string,
    readonly code: number | string | null = null,
    readonly detail: unknown = null
  ) {
    super(message);
    this.name = 'TikTokError';
  }
}

/**
 * Refuse to call TikTok from a region they block, and say so in words that
 * point at the fix rather than at the credentials.
 */
export function assertCallableRegion(): void {
  const region = currentRegion();
  if (ALLOWED.has(region)) return;

  if (region === 'ap-south-1') {
    throw new TikTokError(
      'This ran in Mumbai (ap-south-1), and TikTok blocks every Indian IP, so ' +
        'the call was not attempted. Nothing is wrong with the credentials. ' +
        'The caller must send an "x-region: ap-northeast-1" header when it ' +
        'invokes this function.',
      'region_blocked',
      { region }
    );
  }

  throw new TikTokError(
    `This ran in "${region}", which has never been checked against TikTok. ` +
      'Invoke with an "x-region: ap-northeast-1" header, or add this region to ' +
      'ALLOWED in _shared/tiktok.ts once it is known to work.',
    'region_unverified',
    { region }
  );
}

type TikTokResponse<T> = { code: number; message?: string; data?: T };

/**
 * The only door to TikTok. Checks the region first, then the `code` field,
 * because their HTTP status never disagrees with itself.
 */
export async function callTikTok<T>(
  path: string,
  init: { method: 'GET' | 'POST'; token?: string; body?: unknown; query?: Record<string, string> }
): Promise<T> {
  assertCallableRegion();

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.token) headers['Access-Token'] = init.token;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: init.method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    throw new TikTokError(
      `Could not reach TikTok from ${currentRegion()}: ${(e as Error).message}`,
      'network'
    );
  }

  let payload: TikTokResponse<T>;
  try {
    payload = (await res.json()) as TikTokResponse<T>;
  } catch {
    throw new TikTokError(`TikTok replied with something that was not JSON (HTTP ${res.status})`);
  }

  if (payload.code !== 0) {
    // The region is named in every failure on purpose: it is the first thing
    // worth ruling out and the hardest to guess from the message alone.
    throw new TikTokError(
      `TikTok refused: ${payload.message ?? 'no message'} (code ${payload.code}, from ${currentRegion()})`,
      payload.code,
      payload.data ?? null
    );
  }

  return payload.data as T;
}

/* ------------------------------------------------------------------ oauth -- */

export function authorizeUrl(appId: string, redirectUri: string, state: string): string {
  const u = new URL(`${BASE}/portal/auth`);
  u.searchParams.set('app_id', appId);
  u.searchParams.set('state', state);
  u.searchParams.set('redirect_uri', redirectUri);
  return u.toString();
}

export type TokenGrant = {
  access_token: string;
  scope?: unknown;
  advertiser_ids?: string[];
};

export function exchangeAuthCode(appId: string, secret: string, authCode: string) {
  return callTikTok<TokenGrant>('/open_api/v1.3/oauth2/access_token/', {
    method: 'POST',
    body: { app_id: appId, secret, auth_code: authCode, grant_type: 'auth_code' },
  });
}

export type AdvertiserInfo = {
  advertiser_id: string;
  advertiser_name?: string;
  currency?: string;
  timezone?: string;
};

/**
 * Which ad accounts this token can reach. Note it authenticates with the app id
 * and secret in the QUERY STRING as well as the token header, which is unusual
 * and is how TikTok actually behaves.
 */
export function listAdvertisers(appId: string, secret: string, token: string) {
  return callTikTok<{ list: AdvertiserInfo[] }>('/open_api/v1.3/oauth2/advertiser/get/', {
    method: 'GET',
    token,
    query: { app_id: appId, secret },
  });
}

export type StoreInfo = {
  store_id: string;
  store_name?: string;
  store_authorized_bc_id?: string;
};

/**
 * The stores under one ad account. `store_authorized_bc_id` is mandatory on
 * every GMV Max report call later, and this is the only place it comes from,
 * which is why it is captured at connect time rather than looked up per request.
 */
export function listStores(advertiserId: string, token: string) {
  return callTikTok<{ list: StoreInfo[] }>('/open_api/v1.3/gmv_max/store/list/', {
    method: 'GET',
    token,
    query: { advertiser_id: advertiserId },
  });
}
