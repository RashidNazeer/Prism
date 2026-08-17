/**
 * Bring our record of TikTok ad accounts and stores in line with what the token
 * can actually see.
 *
 * Shared by the public callback (right after authorising) and the admin
 * re-check button, because "what can this connection reach" has to mean the
 * same thing in both places or the settings screen will disagree with itself.
 *
 * UPSERT, NEVER DELETE-THEN-INSERT. `tiktok_stores.brand_id` is a mapping a
 * human made by hand, and rebuilding the rows would throw it away every time
 * somebody pressed Re-check. Accounts that vanish from TikTok keep their row
 * and simply stop having `last_seen_at` moved forward, which is also what lets
 * the screen say "we have not seen this account since the 3rd" rather than
 * quietly dropping it.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9';
import { listAdvertisers, listStores } from './tiktok.ts';

export type SyncResult = {
  accounts: number;
  stores: number;
  /** Advertisers whose store list could not be read, with the reason. */
  storeFailures: { advertiserId: string; reason: string }[];
};

export async function syncAccountsAndStores(
  db: SupabaseClient,
  connectionId: string,
  appId: string,
  secret: string,
  token: string
): Promise<SyncResult> {
  const seenAt = new Date().toISOString();

  const advertisers = await listAdvertisers(appId, secret, token);
  const list = advertisers?.list ?? [];

  if (list.length > 0) {
    const { error } = await db.from('tiktok_ad_accounts').upsert(
      list.map((a) => ({
        advertiser_id: String(a.advertiser_id),
        connection_id: connectionId,
        name: a.advertiser_name ?? null,
        currency: a.currency ?? null,
        timezone: a.timezone ?? null,
        last_seen_at: seenAt,
      })),
      { onConflict: 'advertiser_id' }
    );
    if (error) throw new Error(`could not save the ad accounts: ${error.message}`);
  }

  /*
   * Stores are fetched per advertiser, and ONE FAILING ADVERTISER MUST NOT SINK
   * THE WHOLE CONNECTION. An account we lack GMV Max permission on answers with
   * an error; that is a fact about that account, not a broken authorisation, so
   * it is collected and reported rather than thrown.
   */
  let stores = 0;
  const storeFailures: SyncResult['storeFailures'] = [];

  for (const a of list) {
    const advertiserId = String(a.advertiser_id);
    try {
      const res = await listStores(advertiserId, token);
      const rows = res?.list ?? [];
      if (rows.length === 0) continue;

      const { error } = await db.from('tiktok_stores').upsert(
        rows.map((s) => ({
          store_id: String(s.store_id),
          advertiser_id: advertiserId,
          name: s.store_name ?? null,
          store_authorized_bc_id: s.store_authorized_bc_id
            ? String(s.store_authorized_bc_id)
            : null,
          last_seen_at: seenAt,
        })),
        // brand_id is deliberately absent from this list, so an upsert can
        // never overwrite a mapping somebody made by hand.
        { onConflict: 'store_id' }
      );
      if (error) throw new Error(error.message);
      stores += rows.length;
    } catch (e) {
      storeFailures.push({ advertiserId, reason: (e as Error).message });
    }
  }

  return { accounts: list.length, stores, storeFailures };
}
