import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import type { AppRole } from '@/lib/auth/auth-context';

/**
 * The audit trail.
 *
 * Read only, always. The table has a staff SELECT policy and no insert, update
 * or delete grant to `authenticated` at all, so there is deliberately no
 * mutation hook here and there never should be. Rows are written inside the
 * security definer functions that perform the action, in the same transaction.
 */

export const AUDIT_PAGE_SIZE = 25;

export interface AuditEntry {
  id: number;
  actor_email: string | null;
  actor_role: AppRole | null;
  action: string;
  subject_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

const COLUMNS = 'id, actor_email, actor_role, action, subject_id, detail, created_at';

/**
 * A short list, either for one subject or the most recent activity overall.
 * Used inline on the application detail screen.
 */
export function useAuditLog({
  subjectId,
  limit = 10,
}: { subjectId?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['admin', 'audit', subjectId ?? 'recent', limit],
    staleTime: 15_000,
    queryFn: async (): Promise<AuditEntry[]> => {
      let q = getSupabase().from('audit_log').select(COLUMNS);
      if (subjectId) q = q.eq('subject_id', subjectId);

      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as unknown as AuditEntry[];
    },
  });
}

/** The full log, paged in the database. This table only ever grows. */
export function useAuditPage(page: number) {
  return useQuery({
    queryKey: ['admin', 'audit', 'page', page],
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<{ rows: AuditEntry[]; total: number }> => {
      const from = (page - 1) * AUDIT_PAGE_SIZE;
      const { data, error, count } = await getSupabase()
        .from('audit_log')
        .select(COLUMNS, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + AUDIT_PAGE_SIZE - 1);

      if (error) throw error;
      return { rows: (data ?? []) as unknown as AuditEntry[], total: count ?? 0 };
    },
  });
}

/** Plain English for a dotted action verb. */
export function describeAction(action: string): string {
  if (action === 'application.approved') return 'approved';
  if (action === 'application.rejected') return 'rejected';
  if (action === 'application.review_denied') return 'was blocked trying to review';
  return action.replace(/^[a-z]+\./, '').replace(/_/g, ' ');
}
