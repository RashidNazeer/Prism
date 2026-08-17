import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import {
  disconnectTikTok,
  mapTikTokStore,
  recheckTikTokConnection,
  startTikTokConnect,
  syncTikTokNow,
} from '@/lib/tiktok';

/**
 * The TikTok settings screen's data.
 *
 * TWO READS, ON PURPOSE, because they answer different questions and one of
 * them is behind a lock:
 *
 *   `tiktok_connection_health` is a security definer view over the connection,
 *   carrying everything EXCEPT the access token. The token's own table has RLS
 *   on and no policies, so it is unreadable with any user token, an admin's
 *   included, which is why the health has to come from a view at all.
 *
 *   `tiktok_account_map` is an ordinary security invoker view over the ad
 *   accounts and stores, gated by the staff read policies on both.
 */

export type ConnectionHealth = {
  id: string;
  connected_at: string;
  last_verified_at: string | null;
  last_error: string | null;
  revoked_at: string | null;
  granted_advertiser_count: number;
  connected_by_name: string | null;
  connected_by_email: string | null;
};

export type AdAccount = {
  advertiser_id: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
  last_seen_at: string;
};

export type AccountMapRow = {
  store_id: string;
  store_name: string | null;
  store_authorized_bc_id: string | null;
  brand_id: string | null;
  brand_name: string | null;
  mapped_at: string | null;
  advertiser_id: string;
  advertiser_name: string | null;
  currency: string | null;
  timezone: string | null;
  last_seen_at: string;
  store_status: string | null;
  is_gmv_max_available: boolean | null;
  bc_name: string | null;
};

export function useTikTokConnection() {
  return useQuery({
    queryKey: ['admin', 'tiktok', 'connection'],
    staleTime: 15_000,
    queryFn: async (): Promise<ConnectionHealth | null> => {
      const { data, error } = await getSupabase()
        .from('tiktok_connection_health')
        .select('*')
        .is('revoked_at', null)
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ConnectionHealth | null) ?? null;
    },
  });
}

/**
 * THE AD ACCOUNTS THEMSELVES, read separately from their stores, and that is
 * the fix for the first thing Rashid saw.
 *
 * The screen used to be built from `tiktok_account_map` alone, which is a join
 * FROM stores. So an ad account with no GMV Max store attached produced no rows
 * and vanished completely: he connected successfully, both of his accounts were
 * stored correctly, and the screen said zero. An account is a real thing whether
 * or not it has a shop on it, so it is read as one.
 */
export function useTikTokAdAccounts() {
  return useQuery({
    queryKey: ['admin', 'tiktok', 'ad-accounts'],
    staleTime: 15_000,
    queryFn: async (): Promise<AdAccount[]> => {
      const { data, error } = await getSupabase()
        .from('tiktok_ad_accounts')
        .select('advertiser_id, name, currency, timezone, last_seen_at')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdAccount[];
    },
  });
}

export function useTikTokAccounts() {
  return useQuery({
    queryKey: ['admin', 'tiktok', 'accounts'],
    staleTime: 15_000,
    queryFn: async (): Promise<AccountMapRow[]> => {
      const { data, error } = await getSupabase()
        .from('tiktok_account_map')
        .select('*')
        .order('advertiser_name', { ascending: true })
        .order('store_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AccountMapRow[];
    },
  });
}

/** The brands a store can be mapped to. Active ones only. */
export function useMappableBrands() {
  return useQuery({
    queryKey: ['admin', 'tiktok', 'brands'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('brands')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
        .limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

export function useTikTokActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'tiktok'] });
  };

  const connect = useMutation({
    mutationFn: startTikTokConnect,
    onSuccess: (res) => {
      // Leave the app entirely. TikTok will send the browser back to
      // /oauth/tiktok/callback with the code and our nonce.
      window.location.assign(res.url);
    },
  });

  const recheck = useMutation({ mutationFn: recheckTikTokConnection, onSuccess: refresh });

  const disconnect = useMutation({
    mutationFn: (connectionId: string) => disconnectTikTok(connectionId),
    onSuccess: refresh,
  });

  const pull = useMutation({
    mutationFn: (days: number) => syncTikTokNow(days),
    onSuccess: refresh,
  });

  const map = useMutation({
    mutationFn: ({
      advertiserId,
      storeId,
      brandId,
    }: {
      advertiserId: string;
      storeId: string;
      brandId: string | null;
    }) => mapTikTokStore(advertiserId, storeId, brandId),
    onSuccess: refresh,
  });

  return { connect, recheck, disconnect, map, pull };
}
