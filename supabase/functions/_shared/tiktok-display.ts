/**
 * Talking to TikTok's DISPLAY API, which is a different product on a different
 * host from the ads integration next door in `tiktok.ts`.
 *
 *   ads      business-api.tiktok.com   a BRAND's ad account   money
 *   display  open.tiktokapis.com       a CREATOR's account    engagement
 *
 * They share nothing: not the host, not the credentials, not the token format,
 * not the error shape. Do not "tidy" them into one module. Confusing the two is
 * what cost a whole round of scope applications on 2026-08-25, when scopes were
 * added to the ads app in the belief they would deliver views.
 */

/** Where the creator is sent to approve, and where tokens are minted. */
const AUTH_HOST = 'https://www.tiktok.com';
const API_HOST = 'https://open.tiktokapis.com';

export type DisplayCreds = {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * The credentials, read once and complained about clearly.
 *
 * NAMED `..._CREATOR_...` throughout so nobody wires the ads app's id into this
 * flow. They are different apps with different secrets; sending one to the
 * other's host returns a generic auth error that reads like a bad secret.
 */
export function displayCreds(): DisplayCreds {
  /*
   * TRIMMED, AND THIS IS NOT DEFENSIVE PROGRAMMING FOR ITS OWN SAKE.
   *
   * These are pasted by a human into a dashboard text box, and a copied
   * credential very often carries a trailing newline. It happened on the first
   * real attempt here: the client key arrived 17 characters long for a 16
   * character key, and TikTok's redirect showed `...cme27g%250A` — a
   * double-encoded \n riding along inside the authorise URL.
   *
   * The failure it causes is the worst kind: TikTok answers "client key not
   * recognised", which reads exactly like a wrong key, so the natural response
   * is to re-copy the same value and get the same result. One `.trim()` removes
   * a whole afternoon of that.
   */
  const clientKey = Deno.env.get('TIKTOK_CREATOR_CLIENT_KEY')?.trim();
  const clientSecret = Deno.env.get('TIKTOK_CREATOR_CLIENT_SECRET')?.trim();
  const redirectUri = Deno.env.get('TIKTOK_CREATOR_REDIRECT_URI')?.trim();
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error(
      'TIKTOK_CREATOR_CLIENT_KEY, TIKTOK_CREATOR_CLIENT_SECRET and ' +
        'TIKTOK_CREATOR_REDIRECT_URI must all be set as Edge Function secrets. ' +
        'These belong to the Display API app on developers.tiktok.com, NOT the ' +
        'ads app on TikTok for Business.'
    );
  }
  return { clientKey, clientSecret, redirectUri };
}

/**
 * The scopes we ask for, and the ONLY ones.
 *
 * `user.info.basic` is the baseline every app gets and is what tells us which
 * account connected. `video.list` is the one that carries the view, like,
 * comment and share counts, and the one an app reviewer actually looks at.
 *
 * NOTHING ELSE GOES IN HERE without a matching change to the demo video.
 * TikTok's review guidelines: "All selected products and scopes must be clearly
 * demonstrated in the video." An unused scope is a rejection, not a spare.
 */
export const DISPLAY_SCOPES = ['user.info.basic', 'video.list'] as const;

/** Where to send a creator to approve us. */
export function authorizeUrl(creds: DisplayCreds, state: string): string {
  const p = new URLSearchParams({
    client_key: creds.clientKey,
    scope: DISPLAY_SCOPES.join(','),
    response_type: 'code',
    redirect_uri: creds.redirectUri,
    state,
  });
  return `${AUTH_HOST}/v2/auth/authorize/?${p.toString()}`;
}

export type DisplayToken = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
};

/*
 * THE TOKEN ENDPOINT IS FORM-ENCODED, not JSON, and it answers 200 with an
 * error body rather than a 4xx. Both are easy to get wrong and both fail in a
 * way that looks like a bad secret.
 */
async function tokenCall(body: URLSearchParams): Promise<DisplayToken> {
  const res = await fetch(`${API_HOST}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`TikTok returned a non-JSON token response (${res.status})`);
  if (json.error) {
    throw new Error(`TikTok refused the token: ${json.error} ${json.error_description ?? ''}`.trim());
  }
  if (!json.access_token) throw new Error('TikTok returned no access token');
  return json as DisplayToken;
}

export function exchangeCode(creds: DisplayCreds, code: string) {
  return tokenCall(
    new URLSearchParams({
      client_key: creds.clientKey,
      client_secret: creds.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: creds.redirectUri,
    })
  );
}

export function refreshToken(creds: DisplayCreds, refresh: string) {
  return tokenCall(
    new URLSearchParams({
      client_key: creds.clientKey,
      client_secret: creds.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    })
  );
}

/** Who connected, so the screen can say "connected as @handle". */
export async function fetchUser(accessToken: string) {
  const fields = 'open_id,union_id,display_name,avatar_url';
  const res = await fetch(`${API_HOST}/v2/user/info/?fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => null);
  if (json?.error?.code && json.error.code !== 'ok') {
    throw new Error(`TikTok user info failed: ${json.error.code} ${json.error.message ?? ''}`.trim());
  }
  return (json?.data?.user ?? {}) as {
    open_id?: string;
    union_id?: string;
    display_name?: string;
    avatar_url?: string;
  };
}

export type DisplayVideo = {
  id: string;
  title?: string;
  cover_image_url?: string;
  share_url?: string;
  duration?: number;
  create_time?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
};

/**
 * The creator's OWN videos, with the numbers we came for.
 *
 * `POST` with the field list in the QUERY STRING and the paging in the BODY,
 * which is TikTok's own shape here and not a mistake. `max_count` is capped at
 * 20 by the API; asking for more is an error rather than a truncation.
 */
export async function listVideos(
  accessToken: string,
  cursor?: number
): Promise<{ videos: DisplayVideo[]; cursor?: number; hasMore: boolean }> {
  const fields = [
    'id',
    'title',
    'cover_image_url',
    'share_url',
    'duration',
    'create_time',
    'view_count',
    'like_count',
    'comment_count',
    'share_count',
  ].join(',');

  const res = await fetch(`${API_HOST}/v2/video/list/?fields=${fields}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
  });

  const json = await res.json().catch(() => null);
  if (json?.error?.code && json.error.code !== 'ok') {
    throw new Error(
      `TikTok video list failed: ${json.error.code} ${json.error.message ?? ''}`.trim()
    );
  }
  return {
    videos: (json?.data?.videos ?? []) as DisplayVideo[],
    cursor: json?.data?.cursor,
    hasMore: Boolean(json?.data?.has_more),
  };
}

/** Revoke at TikTok's end too, so "disconnect" means what a creator thinks. */
export async function revoke(creds: DisplayCreds, accessToken: string): Promise<void> {
  /*
   * BEST EFFORT, AND DELIBERATELY SO. If TikTok refuses this we still delete
   * our copy of the token: leaving a creator connected in our database because
   * a third party had a bad minute is the wrong way round. The caller logs it.
   */
  await fetch(`${API_HOST}/v2/oauth/revoke/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: creds.clientKey,
      client_secret: creds.clientSecret,
      token: accessToken,
    }),
  });
}
