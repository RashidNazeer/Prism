/**
 * The last thing that happened to a job, and how long ago.
 *
 * NEUTRAL, like the rest of `src/lib/work/`. `offer_stage_events` is the
 * creator-readable history, which `audit_log` can never be because that is
 * staff only, so both sides read this table under their own policies: a creator
 * sees their own moves, staff see everyone's.
 *
 * The note on an event is CREATOR FACING and always has been, so it is safe to
 * put on either screen. The person who made the move is NOT: `actor_id` points
 * at `profiles`, which a creator cannot read for anybody but themselves, so an
 * embed would come back null rather than refusing. It is deliberately not
 * selected here. If the admin side ever wants the actor's name it passes it in
 * from an admin-only read, so this file cannot become the thing that makes a
 * creator screen look broken.
 */

import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import type { OfferStage } from '@/lib/offer-stages';

export interface StageMove {
  application_id: string;
  from_stage: OfferStage | null;
  to_stage: OfferStage;
  note: string | null;
  created_at: string;
}

/**
 * The newest move per job, for the jobs on this page.
 *
 * ONE read, newest first, then the first hit per job wins. Bounded by the page
 * size times the seven stages, which is why it does not need a window function
 * or a view. `offer_stage_events_application_idx` is `(application_id,
 * created_at desc)`, which is exactly this query and has never been used by one
 * until now.
 */
export function useLatestStageMoves(applicationIds: string[]) {
  const key = [...applicationIds].sort().join(',');

  return useQuery({
    queryKey: ['work', 'latest-stage-moves', key],
    enabled: applicationIds.length > 0,
    staleTime: 15_000,
    queryFn: async (): Promise<Map<string, StageMove>> => {
      const { data, error } = await getSupabase()
        .from('offer_stage_events')
        .select('application_id, from_stage, to_stage, note, created_at')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const latest = new Map<string, StageMove>();
      for (const row of (data ?? []) as unknown as StageMove[]) {
        if (!latest.has(row.application_id)) latest.set(row.application_id, row);
      }
      return latest;
    },
  });
}

/**
 * How long something has been sitting where it is, in words.
 *
 * Deliberately coarse. "17 days" is a decision; "17 days 4 hours" is noise on a
 * queue somebody is scanning. Anything under a day is "today", because a job
 * that moved this morning is not information.
 */
export function standingFor(since: string | null | undefined): string | null {
  if (!since) return null;
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/** Long enough that somebody should look at it. Two weeks, matching the plan. */
export function isStale(since: string | null | undefined): boolean {
  if (!since) return false;
  return Date.now() - new Date(since).getTime() > 14 * 86_400_000;
}
