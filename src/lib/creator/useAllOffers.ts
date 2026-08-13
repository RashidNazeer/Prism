import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { joinChannel } from '@/lib/realtime';
import { useAuth } from '@/lib/auth/auth-context';
import type { MyOfferApplication } from '@/lib/creator/useOfferApplications';

/**
 * Every offer open to this creator, across every brand.
 *
 * The brand hub answers "what is this brand offering me". This answers "what is
 * on the table anywhere", which is the question a creator actually wakes up
 * with.
 *
 * Row level security decides what comes back: active offers, of active brands,
 * for approved creators only. There is no status filter in the query, because
 * adding one would disguise which layer is doing the work.
 */

export interface CreatorOfferRow {
  id: string;
  brand_id: string;
  badge_title: string | null;
  title: string;
  description: string | null;
  video_count: number | null;
  reward_amount: string | number | null;
  currency: string;
  needs_application: boolean;
  created_at: string;
  brand: { id: string; name: string; slug: string; logo_url: string | null } | null;
}

const COLUMNS =
  'id, brand_id, badge_title, title, description, video_count, reward_amount, ' +
  'currency, needs_application, created_at, ' +
  'brand:brands (id, name, slug, logo_url)';

/**
 * Everything on the table, newest first.
 *
 * Not paginated on purpose. A creator's whole world here is the offers of the
 * handful of brands they can work with, and the filtering they actually want
 * (in, waiting, not yet asked) depends on their own requests, which cannot be
 * expressed as a database filter on this table. Paginating would mean paging
 * through a list whose useful order lives in another table. If a creator ever
 * has hundreds of offers, this becomes a view.
 */
export function useAllCreatorOffers() {
  return useQuery({
    queryKey: ['creator', 'all-offers'],
    staleTime: 30_000,
    queryFn: async (): Promise<CreatorOfferRow[]> => {
      const { data, error } = await getSupabase()
        .from('offers')
        .select(COLUMNS)
        .order('created_at', { ascending: false })
        // A ceiling rather than a page. If it is ever hit, the comment above
        // is the thing to act on, not this number.
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as CreatorOfferRow[];
    },
  });
}

/**
 * Every request this creator has made, anywhere, kept live.
 *
 * The per-brand version of this lives in `useOfferApplications`. This one is
 * for the dashboard, where the point is precisely that it crosses brands.
 */
export function useAllMyRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator', 'all-my-requests'],
    staleTime: 15_000,
    queryFn: async (): Promise<MyOfferApplication[]> => {
      const { data, error } = await getSupabase()
        .from('offer_applications')
        .select(
          'id, offer_id, brand_id, status, stage, committed_amount, committed_video_count, ' +
            'currency, note, decision_note, decided_at, created_at'
        )
        .order('created_at', { ascending: false })
        // Matches the 200 on the offers read above. A request list quietly
        // shorter than the offer list would leave cards claiming "not asked
        // yet" for offers this creator is already working on.
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as MyOfferApplication[];
    },
  });

  /*
   * THE SAME CHANNEL NAME `useOfferApplications` USES, and that is the point of
   * `joinChannel` rather than an accident. Both hooks watch exactly one thing,
   * this creator's own rows in `offer_applications`, and they used to open two
   * channels for it under two different names. Reference counted, a screen
   * running both now holds one subscription and both hooks hear every event.
   *
   * The name says what is being watched rather than which hook asked, because
   * a third caller should join this one rather than invent a third name.
   */
  useEffect(() => {
    if (!user?.id) return;

    return joinChannel(
      `offer-applications:${user.id}`,
      [{ table: 'offer_applications', filter: `creator_id=eq.${user.id}` }],
      () => {
        void queryClient.invalidateQueries({ queryKey: ['creator', 'all-my-requests'] });
      }
    );
  }, [user?.id, queryClient]);

  return query;
}

export type CreatorOfferState = 'in' | 'waiting' | 'declined' | 'open' | 'canApply';

/**
 * Where this creator stands on one offer.
 *
 * `open` means it needs no application and is already theirs. `canApply` means
 * they have never asked, or asked and withdrew. A rejection is its own state,
 * because "they said no" and "you have not asked" should not look the same.
 */
export function stateFor(
  offer: CreatorOfferRow,
  request: MyOfferApplication | undefined
): CreatorOfferState {
  /*
   * A LIVE REQUEST WINS OVER WHAT THE OFFER SAYS ABOUT ITSELF.
   *
   * `needs_application` used to be checked first, which was wrong the moment
   * an admin switched it off on an offer somebody had already been approved
   * for. The card then said "You are already on this one" and swallowed the
   * whole truth behind it: their stage, their tracker, and the money they are
   * owed all disappeared, on both the offers screen and inside the hub, while
   * the dashboard carried on showing them. One job, two answers.
   *
   * Nothing about the offer can be more important than work already under way
   * on it, so approved and pending are decided here before anything else.
   */
  if (request?.status === 'approved') return 'in';
  if (request?.status === 'pending') return 'waiting';
  if (!offer.needs_application) return 'open';
  if (!request) return 'canApply';
  if (request.status === 'rejected') return 'declined';
  return 'canApply';
}
