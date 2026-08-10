import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/auth-context';
import type { OfferStage } from '@/lib/offer-stages';

/**
 * What this creator has asked for, and what came back.
 *
 * Row level security means this only ever returns their own rows, so there is
 * no `creator_id` filter in the query. A creator cannot see who else applied
 * for an offer or what anybody else was offered, and that is a policy in the
 * database rather than a filter here.
 */

export type OfferApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface MyOfferApplication {
  id: string;
  offer_id: string;
  brand_id: string;
  status: OfferApplicationStatus;
  /**
   * Where approved work has got to. Carried here as well as on the dashboard
   * so every screen that shows an approved offer can say the same thing. "You
   * are in" on one screen and "sample shipped" on another is two answers to
   * one question.
   */
  stage: OfferStage | null;
  /** What we agreed to pay. Null on anything not approved. */
  committed_amount: string | number | null;
  /** The currency the offer was quoted in when they asked. */
  currency: string;
  note: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

const COLUMNS =
  'id, offer_id, brand_id, status, stage, committed_amount, currency, note, ' +
  'decision_note, decided_at, created_at';

/**
 * Every request this creator has made inside one brand's hub, newest first.
 *
 * Kept live. A decision has to land while they are looking at it, the same way
 * their approval does on the dashboard, because being told immediately is the
 * whole point of the product.
 */
export function useMyOfferApplications(brandId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator', 'my-offer-applications', brandId],
    enabled: Boolean(brandId),
    staleTime: 15_000,
    queryFn: async (): Promise<MyOfferApplication[]> => {
      const { data, error } = await getSupabase()
        .from('offer_applications')
        .select(COLUMNS)
        .eq('brand_id', brandId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyOfferApplication[];
    },
  });

  useEffect(() => {
    if (!brandId || !user?.id) return;
    const supabase = getSupabase();

    // Narrowed to this creator's own rows. Row level security would filter it
    // anyway, but there is no reason to be told about rows we then discard.
    const channel = supabase
      .channel(`my-offer-applications:${brandId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'offer_applications',
          filter: `creator_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ['creator', 'my-offer-applications'],
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [brandId, user?.id, queryClient]);

  return query;
}

export type ApplyPayload = {
  action: 'application.create';
  offerId: string;
  note: string | null;
};

export type WithdrawPayload = { action: 'application.withdraw'; applicationId: string };

/**
 * Asking for an offer, and changing your mind.
 *
 * Not a table write. `offer_applications` has no insert or update policy at
 * all; the Edge Function re-reads who the caller is from the profiles table and
 * calls a security definer function that writes the row and its audit entry
 * together.
 */
export function useApplyForOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ApplyPayload | WithdrawPayload) => {
      const { data, error } = await getSupabase().functions.invoke(
        'manage-offer-application',
        { body: payload }
      );
      if (error) throw new Error(await messageFrom(error));
      return (data as { result: MyOfferApplication }).result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator', 'my-offer-applications'] });
      // The offers dashboard reads the same rows through its own query, and a
      // creator who applies from one screen must not see the other disagree.
      void queryClient.invalidateQueries({ queryKey: ['creator', 'all-my-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offer-applications'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offer-people'] });
    },
  });
}

/**
 * Pull the real message out of a failed function call.
 *
 * `functions.invoke` reports any non-2xx as a generic "Edge Function returned a
 * non-2xx status code" and hides the body on `error.context`, which is the
 * actual Response. Without this a creator sees that sentence instead of
 * "You have already asked for this one".
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
