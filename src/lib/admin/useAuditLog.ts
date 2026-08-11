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
  /**
   * WHAT KIND of record this was about: 'application', 'brand', 'offer',
   * 'offer_application', 'content_submission', 'product'.
   *
   * Stored and indexed since day one and never once selected, which is why
   * every row in the activity feed used to link to the applications screen
   * whatever it was actually about. Most of those links were dead and looked
   * alive.
   */
  subject_type: string | null;
  subject_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

const COLUMNS =
  'id, actor_email, actor_role, action, subject_type, subject_id, detail, created_at';

/**
 * A short list, either for one subject or the most recent activity overall.
 *
 * `subjectType` is not optional flavour. The index is `(subject_type,
 * subject_id)` and a btree cannot serve a predicate that skips its leading
 * column, so filtering on the id alone made this a sequential scan of a table
 * that only ever grows. Every caller already knows the kind.
 */
export function useAuditLog({
  subjectId,
  subjectType,
  limit = 10,
}: { subjectId?: string; subjectType?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['admin', 'audit', subjectId ?? 'recent', subjectType ?? 'any', limit],
    staleTime: 15_000,
    queryFn: async (): Promise<AuditEntry[]> => {
      let q = getSupabase().from('audit_log').select(COLUMNS);
      if (subjectType) q = q.eq('subject_type', subjectType);
      if (subjectId) q = q.eq('subject_id', subjectId);

      const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);

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

/**
 * Plain English for a dotted action verb.
 *
 * The fallback used to strip the namespace with `/^[a-z]+\./`, which cannot
 * match a namespace containing an underscore. Every one of the eleven
 * `offer_application.*` actions therefore rendered with its raw dotted verb
 * still in it: the feed printed "offer application.stage changed".
 */
const ACTIONS: Record<string, string> = {
  'application.approved': 'approved',
  'application.rejected': 'rejected',
  'application.review_denied': 'was blocked trying to review',
  'offer_application.approved': 'put a creator on an offer',
  'offer_application.rejected': 'turned a creator down for an offer',
  'offer_application.stage_changed': 'moved a job along',
  'offer_application.created': 'a creator asked for an offer',
  'offer_application.withdrawn': 'a creator withdrew',
  'content.reviewed': 'reviewed a video',
  'brand.saved': 'saved a brand',
  'brand.about': 'edited a brand story',
  'offer.saved': 'saved an offer',
  'offer.deleted': 'deleted an offer',
  'product.saved': 'saved a product',
  'product.deleted': 'deleted a product',
};

export function describeAction(action: string): string {
  const known = ACTIONS[action];
  if (known) return known;
  // `[^.]+` rather than `[a-z]+`, so a namespace with an underscore in it is
  // actually stripped.
  return action.replace(/^[^.]+\./, '').replace(/_/g, ' ');
}

/**
 * Where an entry actually happened, so a row links to the record it is about.
 *
 * Everything used to point at `/admin/applications/<id>` whatever the id was,
 * which meant a brand edit, a stage move and a content decision were all dead
 * links that looked alive.
 *
 * Null means there is nowhere honest to send somebody. A content submission has
 * no screen of its own, and a request lives inside a filtered queue rather than
 * at an address, so those stay as plain text rather than pretending.
 */
export function linkForSubject(
  subjectType: string | null,
  subjectId: string | null
): string | null {
  if (!subjectId || !subjectType) return null;
  if (subjectType === 'application') return `/admin/applications/${subjectId}`;
  if (subjectType === 'brand') return `/admin/brands/${subjectId}`;
  return null;
}
