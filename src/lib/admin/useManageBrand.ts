import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import type { Brand, Offer } from '@/lib/admin/useBrands';

/**
 * Every write in the Brand Hub.
 *
 * Deliberately not table writes. `brands` and `offers` have no insert, update
 * or delete policy at all, and the database functions behind these calls are
 * granted to `service_role` alone, so the browser could not do this even if it
 * tried. The Edge Function is the only door, and it re-reads the caller's role
 * from the profiles table before it opens.
 */

export type BrandSavePayload = {
  action: 'brand.save';
  brandId?: string | null;
  name: string;
  storeId: string;
  clientName: string | null;
  budget: number | null;
  currency: string;
  isActive: boolean;
};

export type OfferSavePayload = {
  action: 'offer.save';
  offerId?: string | null;
  brandId: string;
  badgeTitle: string | null;
  title: string;
  description: string | null;
  /** Null is legitimate: an offer can have no fixed deliverable or fee. */
  videoCount: number | null;
  rewardAmount: number | null;
  currency: string;
  status: 'active' | 'inactive';
  needsApplication: boolean;
};

export type OfferDeletePayload = { action: 'offer.delete'; offerId: string };

export type ManagePayload = BrandSavePayload | OfferSavePayload | OfferDeletePayload;

export function useManageBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ManagePayload): Promise<Brand | Offer> => {
      const { data, error } = await getSupabase().functions.invoke('manage-brand', {
        body: payload,
      });
      if (error) throw new Error(await messageFrom(error));
      return (data as { result: Brand | Offer }).result;
    },

    onSuccess: () => {
      // Cheap, and much safer than patching five caches by hand. Realtime also
      // refreshes the open offer list, but an admin must not have to wait on a
      // websocket to see their own edit.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'brands'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'brand'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offers'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offer-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/**
 * Pull the real message out of a failed function call.
 *
 * `functions.invoke` reports any non-2xx as a generic "Edge Function returned a
 * non-2xx status code" and hides the body on `error.context`, which is the
 * actual Response. Without this an admin would see that sentence instead of
 * "Another brand already uses that store id".
 */
async function messageFrom(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // Body was not JSON. Fall through to the generic message.
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'That did not go through. Try again.';
}
