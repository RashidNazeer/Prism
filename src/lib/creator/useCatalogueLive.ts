import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { joinChannel } from '@/lib/realtime';

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
 * IT TOOK A `key` ARGUMENT UNTIL 2026-08-14, AND THE REASON IT NO LONGER DOES
 * IS THE WHOLE POINT OF `joinChannel`. Three screens called this with 'hub',
 * 'brands' and 'offers' because of a comment that said, correctly at the time,
 * that "two channels with one name is a Supabase footgun: the second subscribe
 * is ignored and the screen that thinks it is listening never hears anything".
 * That was a caller being asked to work around a bug in this file. Reference
 * counting fixes it here instead: every screen joins one channel, everybody
 * hears everything, and it closes when the last one unmounts. Three separate
 * subscriptions to identical rows became one.
 */
export function useCatalogueLive() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = (...keys: string[]) => {
      for (const k of keys) {
        void queryClient.invalidateQueries({ queryKey: ['creator', k] });
      }
    };

    return joinChannel(
      'creator-catalogue',
      [{ table: 'brands' }, { table: 'offers' }, { table: 'brand_products' }],
      () => {
        /*
         * Every key, on any of the three, rather than one set per table.
         *
         * `joinChannel` fires ONE callback for the whole channel and does not
         * say which binding woke it, which is a deliberate trade: the three
         * tables here are edited in the same sitting, the reads are cached
         * behind a `staleTime`, and an invalidation that turns out to be
         * unnecessary costs one request. Telling them apart would mean three
         * channels, which is exactly what this stopped doing.
         *
         * A renamed or retired brand changes the list, the hub header AND the
         * brand shown against every offer, so even the narrow version had to
         * invalidate three keys.
         */
        invalidate('brands', 'brand', 'all-offers', 'offers', 'offer-counts', 'products');
      }
    );
  }, [queryClient]);
}
