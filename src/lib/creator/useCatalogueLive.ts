import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/**
 * Keep the brands, offers and products a creator is looking at current.
 *
 * A creator's own requests have always been live, because that is the promise
 * the product is built on. What an admin EDITS was not: renaming an offer,
 * re-pricing it, retiring a brand or adding a product changed nothing on a
 * creator's screen until they happened to refetch, which with a 30 to 60 second
 * `staleTime` could be a long time to sit looking at a stale number.
 *
 * One channel, not three. These three tables are edited together (an admin
 * saving a brand usually touches its offers in the same sitting) and a
 * subscription per table would open three sockets' worth of bookkeeping to
 * answer the same question.
 *
 * Row level security still decides what arrives. A retired brand or a hidden
 * product produces a change a creator is not authorised to receive, so it never
 * reaches them; they just stop seeing the row on the next read.
 *
 * `key` must be unique per mounted screen. Two channels with one name is a
 * Supabase footgun: the second subscribe is ignored and the screen that thinks
 * it is listening never hears anything.
 */
export function useCatalogueLive(key: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getSupabase();
    const invalidate = (...keys: string[]) => {
      for (const k of keys) {
        void queryClient.invalidateQueries({ queryKey: ['creator', k] });
      }
    };

    const channel = supabase
      .channel(`creator-catalogue:${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () =>
        // A renamed or retired brand changes the list, the hub header and the
        // brand shown against every offer.
        invalidate('brands', 'brand', 'all-offers')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, () =>
        invalidate('all-offers', 'offers', 'offer-counts')
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_products' }, () =>
        invalidate('products')
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [key, queryClient]);
}
