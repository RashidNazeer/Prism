import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import type { AppRole, CreatorTier } from '@/lib/auth/auth-context';
import type { ApplicationStatus } from '@/lib/auth/useApplication';

export interface ApplicationDetail {
  id: string;
  tiktok_handle: string;
  niche: string;
  niche_other: string | null;
  worked_with_wurx: boolean;
  video_links: string;
  status: ApplicationStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  applicant: {
    id: string;
    email: string;
    display_name: string | null;
    role: AppRole;
    tier: CreatorTier | null;
    is_active: boolean;
    created_at: string;
  } | null;
  reviewer: { email: string; display_name: string | null } | null;
}

const COLUMNS =
  'id, tiktok_handle, niche, niche_other, worked_with_wurx, video_links, status, ' +
  'review_note, reviewed_at, created_at, updated_at, ' +
  'applicant:profiles!applications_user_id_fkey (id, email, display_name, role, tier, is_active, created_at), ' +
  'reviewer:profiles!applications_reviewed_by_fkey (email, display_name)';

/** One application, everything about it. Staff only, enforced by RLS. */
export function useApplicationDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'application', id],
    enabled: Boolean(id),
    staleTime: 15_000,
    queryFn: async (): Promise<ApplicationDetail | null> => {
      const { data, error } = await getSupabase()
        .from('applications')
        .select(COLUMNS)
        .eq('id', id!)
        .maybeSingle();

      if (error) throw error;
      return (data as unknown as ApplicationDetail | null) ?? null;
    },
  });
}

export interface AuditEntry {
  id: number;
  actor_email: string | null;
  actor_role: AppRole | null;
  action: string;
  subject_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

const AUDIT_COLUMNS =
  'id, actor_email, actor_role, action, subject_id, detail, created_at';

/**
 * The audit trail.
 *
 * Pass a `subjectId` for one application's history, or leave it out for the
 * most recent activity across the whole panel. Nothing here is writable from a
 * browser: the table has a select policy and no insert grant at all, so this
 * hook can only ever read what the database wrote for itself.
 */
export function useAuditLog({
  subjectId,
  limit = 10,
}: { subjectId?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['admin', 'audit', subjectId ?? 'recent', limit],
    staleTime: 15_000,
    queryFn: async (): Promise<AuditEntry[]> => {
      let q = getSupabase().from('audit_log').select(AUDIT_COLUMNS);
      if (subjectId) q = q.eq('subject_id', subjectId);

      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as unknown as AuditEntry[];
    },
  });
}
