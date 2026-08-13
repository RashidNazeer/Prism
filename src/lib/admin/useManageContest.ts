import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import type { ContestStatus, DeliverableKind } from '@/lib/admin/useContests';

/**
 * Every STAFF write in the contest feature.
 *
 * Deliberately not table writes. None of the eleven contest tables has an
 * insert, update or delete policy at all, and the database functions behind
 * these calls are granted to `service_role` alone, so the browser could not do
 * this even if it tried. The `manage-contest` Edge Function is the only door,
 * and it re-reads the caller's role from the profiles table before it opens.
 *
 * There is no action here that removes a creator from a contest they have
 * joined, and there must never be one. That capability does not exist in the
 * database either. Cancelling the whole contest is the only exit and it affects
 * everybody, which is why it reads as a fire alarm rather than a tidy-up.
 */

export type ContestSavePayload = {
  action: 'contest.save';
  contestId?: string | null;
  brandId: string;
  name: string;
  description: string | null;
  /** Required by the database once the contest carries an active ranked prize. */
  judgingBasis: string | null;
  /** ISO instant. Always sent with its zone, because one is meaningless alone. */
  expiresAt: string;
  /** An IANA zone name, never an offset. See rule L6. */
  expiresAtTimezone: string;
  opensAt?: string | null;
  briefUrl: string | null;
  bannerUrl: string | null;
  currency: string;
  status: ContestStatus;
  needsAdminApproval: boolean;
};

/** Staff only, and its own action so the setup form cannot reach it by accident. */
export type ContestCommercialsPayload = {
  action: 'contest.commercials';
  contestId: string;
  totalBudget: number | null;
  internalNote: string | null;
};

/** Closes the door, never the work. Everybody already in carries on and is paid. */
export type ContestStatusPayload = {
  action: 'contest.status';
  contestId: string;
  status: ContestStatus;
};

export type ContestDeletePayload = { action: 'contest.delete'; contestId: string };

/** The fire alarm. Affects every entrant, and the screen has to say so. */
export type ContestCancelPayload = {
  action: 'contest.cancel';
  contestId: string;
  /** MESSAGE, not reason: the entrants read this. See decision D14. */
  message: string | null;
};

export type DeliverableSavePayload = {
  action: 'deliverable.save';
  deliverableId?: string | null;
  contestId: string;
  kind: DeliverableKind;
  /** Typed by the admin, every time. Nothing generates one. See decision Q11. */
  title: string;
  detail: string | null;
  videoCount: number | null;
  rankPosition: number | null;
  metric: string | null;
  threshold: number | null;
  rewardAmount: number | null;
  sortOrder: number;
  isActive: boolean;
};

/** Retire, never delete. A row somebody holds terms against is part of a promise. */
export type DeliverableRetirePayload = {
  action: 'deliverable.retire';
  deliverableId: string;
};

export type ProductsSetPayload = {
  action: 'products.set';
  contestId: string;
  productIds: string[];
};

/** Scoped to ONE contest. Never a brand, never an account. See decision D5. */
export type ExclusionSavePayload = {
  action: 'exclusion.save';
  contestId: string;
  handle: string | null;
  email: string | null;
  userId?: string | null;
  /** Staff only, and genuinely a reason: no creator can ever read it. */
  reason: string | null;
};

export type ExclusionRemovePayload = {
  action: 'exclusion.remove';
  exclusionId: string;
};

export type ManageContestPayload =
  | ContestSavePayload
  | ContestCommercialsPayload
  | ContestStatusPayload
  | ContestDeletePayload
  | ContestCancelPayload
  | DeliverableSavePayload
  | DeliverableRetirePayload
  | ProductsSetPayload
  | ExclusionSavePayload
  | ExclusionRemovePayload;

export function useManageContest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ManageContestPayload): Promise<unknown> => {
      const { data, error } = await getSupabase().functions.invoke('manage-contest', {
        body: payload,
      });
      if (error) throw new Error(await messageFrom(error));
      return (data as { result: unknown }).result;
    },

    onSuccess: () => {
      // Cheap, and much safer than patching several caches by hand. An admin
      // must not have to wait on a websocket to see their own edit.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'contests'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'contest'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
      // The creator side reads the same contests through different queries, so
      // an admin who is also looking at a hub sees their own edit there too.
      void queryClient.invalidateQueries({ queryKey: ['creator'] });
    },
  });
}

/**
 * Pull the real message out of a failed function call.
 *
 * `functions.invoke` reports any non-2xx as a generic "Edge Function returned a
 * non-2xx status code" and hides the body on `error.context`, which is the
 * actual Response. Without this an admin would see that sentence instead of
 * "say how this contest is judged before you add a ranked prize", which is the
 * one that tells them what to do next.
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
