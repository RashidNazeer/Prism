import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env';

/**
 * THE Supabase client. There is exactly one, for the whole application.
 *
 * This is deliberate and non-negotiable (see CLAUDE.md "Auth rules"). Creating
 * a second client, inside a component, a hook, a route loader, anywhere, * gives you two things racing to refresh the same refresh token. One of them
 * loses, the token is revoked, and the user gets logged out at random. That is
 * the exact bug we are engineering against.
 *
 * Session settings:
 *   persistSession   - keep the session in localStorage across reloads
 *   autoRefreshToken - renew the access token in the background, silently
 *   flowType: 'pkce' - the secure browser auth flow
 *   detectSessionInUrl - needed for magic links / OAuth callbacks
 *
 * Token lifetimes are left at Supabase defaults on purpose. The refresh token
 * is long-lived, so a creator who signs in today is still signed in in three
 * weeks, exactly like every other real app.
 */

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const env = getEnv();

  client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'wurxmediahub-auth',
    },
    global: {
      headers: { 'x-application-name': 'wurxmediahub' },
    },
    realtime: {
      // Keep realtime polite; we subscribe to narrow per-user / per-hub
      // channels rather than one global firehose.
      params: { eventsPerSecond: 10 },
    },
  });

  return client;
}
