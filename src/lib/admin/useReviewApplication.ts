import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import type { AppRole, CreatorTier } from '@/lib/auth/auth-context';
import type { ApplicationStatus } from '@/lib/auth/useApplication';
import { reviewSchema, type ReviewInput } from '@/lib/schemas/review';

export interface ReviewResult {
  application_id: string;
  user_id: string;
  status: ApplicationStatus;
  role: AppRole;
  tier: CreatorTier | null;
  reviewed_at: string;
}

/**
 * Approve or reject an application.
 *
 * Deliberately NOT a table update. The browser could not do this one even if it
 * tried: `applications.status` is not in the column grant, a trigger blocks it,
 * and the database function that performs the change is granted to the service
 * role alone. The Edge Function is the only door, and it re-reads the caller's
 * role from the profiles table before it opens.
 *
 * That also buys atomicity. Status, role, tier and the audit row all commit
 * together, so there is no window where someone is approved on one screen and
 * still an applicant on another.
 */
export function useReviewApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReviewInput): Promise<ReviewResult> => {
      const parsed = reviewSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'That decision was not valid');
      }
      const { applicationId, decision, tier, note } = parsed.data;

      const { data, error } = await getSupabase().functions.invoke('review-application', {
        body: {
          applicationId,
          decision,
          tier: decision === 'approved' ? tier : null,
          note: note || null,
        },
      });

      if (error) {
        throw new Error(await messageFrom(error));
      }
      return (data as { result: ReviewResult }).result;
    },

    onSuccess: (result) => {
      // Everything that could now be stale. Cheap, and much safer than trying
      // to patch four caches by hand.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'application-counts'] });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'application', result.application_id],
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/**
 * Pull the real message out of a failed function call.
 *
 * `functions.invoke` reports any non-2xx as a generic "Edge Function returned a
 * non-2xx status code" and hides the body on `error.context`, which is the
 * actual Response. Without this a reviewer would see that sentence instead of
 * "already reviewed as approved".
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
