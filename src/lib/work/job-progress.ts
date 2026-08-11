/**
 * How much of a job has actually been filmed.
 *
 * NEUTRAL ON PURPOSE. This lives in `src/lib/work/` rather than in
 * `src/lib/creator/` or `src/lib/admin/`, because both sides read it and
 * neither may import the other. Creator code importing admin code is how a
 * brand's budget ends up on a creator's screen by accident, and admin code
 * importing creator code is how creator screens end up in the admin bundle.
 * Both directions are now a build failure, see `.oxlintrc.json`.
 *
 * The numbers come from the `job_progress` VIEW, not from arithmetic in here.
 * Before this, "three of five approved" was worked out in the browser on one
 * screen out of nine, and every other screen that showed the job showed nothing
 * about it. One question, asked one way, answered by the database.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/auth-context';

/** One row of the view, exactly as it comes back. */
export interface JobProgressRow {
  application_id: string;
  creator_id: string;
  brand_id: string;
  offer_id: string;
  /** Agreed at approval and frozen there. Null when no number was agreed. */
  required: number | null;
  approved: number;
  waiting: number;
  needs_another_take: number;
  posted: number;
}

export interface JobProgress extends JobProgressRow {
  /** Null when no number was agreed, so there is nothing to be short of. */
  remaining: number | null;
  /** Every video promised is in and approved. */
  done: boolean;
  /** Nothing posted at all yet. */
  untouched: boolean;
  /** 0 to 1, for the bar. Null when there is no denominator to draw against. */
  fraction: number | null;
}

export const JOB_PROGRESS_COLUMNS =
  'application_id, creator_id, brand_id, offer_id, required, approved, waiting, ' +
  'needs_another_take, posted';

/**
 * The two derived facts, in one place.
 *
 * `remaining` counts against APPROVED videos only, never posted ones. A video
 * sitting with the team is not yet one of the five, and telling a creator they
 * are done when nobody has watched their work is the exact lie the whole
 * approval rule exists to prevent.
 */
export function deriveProgress(row: JobProgressRow): JobProgress {
  const remaining = row.required === null ? null : Math.max(0, row.required - row.approved);
  return {
    ...row,
    remaining,
    done: row.required !== null && row.approved >= row.required,
    untouched: row.posted === 0,
    fraction:
      row.required === null || row.required === 0
        ? null
        : Math.min(1, row.approved / row.required),
  };
}

/**
 * Everything the signed-in person can see, keyed by job.
 *
 * Row level security decides the rows, and the view is `security_invoker`, so a
 * creator gets their own jobs and staff get everyone's. There is no
 * `creator_id` filter here for the same reason `useMyContent` has none: the
 * database is the boundary, not a filter somebody could forget to write.
 *
 * The cap is deliberate. A creator's own jobs are a handful, but no growable
 * list in this product is allowed to be unbounded, and a silent truncation on a
 * screen that says "3 of 5" is worse than a slow one.
 */
export function useMyJobProgress(limit = 200) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['work', 'job-progress', limit],
    staleTime: 15_000,
    queryFn: async (): Promise<Map<string, JobProgress>> => {
      const { data, error } = await getSupabase()
        .from('job_progress')
        .select(JOB_PROGRESS_COLUMNS)
        .limit(limit);
      if (error) throw error;
      const rows = (data ?? []) as unknown as JobProgressRow[];
      return new Map(rows.map((r) => [r.application_id, deriveProgress(r)]));
    },
  });

  /*
   * Rashid, 2026-08-11: "it should reflect realtime wherever it's connected".
   * An approval by the team moves this bar under the creator's hands.
   *
   * The `creator_id` filter is load bearing, not tidiness. `content_submissions`
   * is published with replica identity full and postgres_changes does NOT apply
   * row security to DELETE events, so without it the whole old row of somebody
   * else's deleted submission would arrive here.
   *
   * The channel name is its own. Two channels sharing a name means the second
   * subscribe is silently ignored, and this hook mounts on screens that already
   * run one.
   */
  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabase();

    const channel = supabase
      .channel(`job-progress:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_submissions',
          filter: `creator_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['work', 'job-progress'] });
        }
      )
      .on(
        // A new approval creates a new job, which needs a row on the board even
        // before anything has been filmed for it.
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'offer_applications',
          filter: `creator_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['work', 'job-progress'] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return query;
}

/**
 * The one sentence that describes where a job has got to.
 *
 * Written once so the home screen, the offers list and the brand hub cannot
 * word it three different ways. Videos still with the team are named
 * separately from videos still to film, because they are different asks: one
 * needs the creator to do something, the other needs us to.
 */
export function progressSentence(p: JobProgress): string {
  if (p.required === null) {
    // No fixed deliverable. Nothing to be short of, so we report rather than
    // measure.
    if (p.posted === 0) return 'Nothing posted yet';
    const parts = [`${p.approved} approved`];
    if (p.waiting > 0) parts.push(`${p.waiting} with the team`);
    return parts.join(', ');
  }

  const parts = [`${p.approved} of ${p.required} approved`];
  if (p.waiting > 0) parts.push(`${p.waiting} with the team`);
  if (p.needs_another_take > 0) parts.push(`${p.needs_another_take} to redo`);
  if (p.remaining !== null && p.remaining > 0 && p.waiting === 0) {
    parts.push(`${p.remaining} still to film`);
  }
  return parts.join(', ');
}

/** Whether the creator is the one holding this job up. */
export function needsFilming(p: JobProgress): boolean {
  if (p.required === null) return false;
  return !p.done && p.approved + p.waiting < p.required;
}
