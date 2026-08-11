import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/auth-context';
import { STAGE_META, type OfferApplicationStatus, type OfferStage } from '@/lib/offer-stages';

/**
 * Everything this creator has asked for, and where each one has got to.
 *
 * One read, then all the arithmetic here. The alternative is half a dozen
 * counting queries whose answers can disagree with each other for a second
 * while they land, which on a screen that talks about money is worse than
 * slower.
 *
 * Row level security means this only ever returns their own rows. The offer
 * and the brand come back even if either was later switched off, because the
 * policies added on 2026-08-01 say you can always read the thing you asked for.
 */

export interface MyWorkRow {
  id: string;
  offer_id: string;
  brand_id: string;
  status: OfferApplicationStatus;
  stage: OfferStage | null;
  stage_updated_at: string | null;
  /** What we agreed to pay. Null on anything not approved. */
  committed_amount: string | number | null;
  /**
   * How many videos were agreed, frozen at approval beside the amount. Null
   * when no number was agreed. Never use `offer.video_count` for a job that is
   * already under way: re-scoping the offer does not change the deal.
   */
  committed_video_count: number | null;
  currency: string;
  note: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  offer: {
    id: string;
    title: string;
    video_count: number | null;
    reward_amount: string | number | null;
    currency: string;
  } | null;
  brand: { id: string; name: string; slug: string; logo_url: string | null } | null;
}

export interface StageEvent {
  id: number;
  application_id: string;
  from_stage: OfferStage | null;
  to_stage: OfferStage;
  note: string | null;
  created_at: string;
}

const COLUMNS =
  'id, offer_id, brand_id, status, stage, stage_updated_at, committed_amount, ' +
  'committed_video_count, currency, note, decision_note, decided_at, created_at, ' +
  'offer:offers (id, title, video_count, reward_amount, currency), ' +
  'brand:brands (id, name, slug, logo_url)';

/** One creator's own jobs. Generous, but never unbounded. */
const MY_WORK_CAP = 200;

export function useMyWork() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator', 'my-work'],
    staleTime: 15_000,
    queryFn: async (): Promise<MyWorkRow[]> => {
      const { data, error } = await getSupabase()
        .from('offer_applications')
        .select(COLUMNS)
        .order('created_at', { ascending: false })
        // Explicit, like the offers list. Every growable read in this product
        // states its own ceiling rather than inheriting PostgREST's, which
        // truncates silently and would leave the money on this screen quietly
        // short of the truth.
        .limit(MY_WORK_CAP);
      if (error) throw error;
      return (data ?? []) as unknown as MyWorkRow[];
    },
  });

  // A stage change has to land while they are looking at it. Being told
  // immediately is the entire product.
  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabase();

    const channel = supabase
      .channel(`my-work:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'offer_applications',
          filter: `creator_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['creator', 'my-work'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'offer_stage_events',
          filter: `creator_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['creator', 'my-work'] });
          void queryClient.invalidateQueries({ queryKey: ['creator', 'my-stage-events'] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return query;
}

/** The creator's own history through the pipeline, newest first. */
export function useMyStageEvents(limit = 40) {
  return useQuery({
    queryKey: ['creator', 'my-stage-events', limit],
    staleTime: 15_000,
    queryFn: async (): Promise<StageEvent[]> => {
      const { data, error } = await getSupabase()
        .from('offer_stage_events')
        .select('id, application_id, from_stage, to_stage, note, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as StageEvent[];
    },
  });
}

export interface WorkSummary {
  /** Approved and not finished. */
  active: number;
  approved: number;
  waiting: number;
  declined: number;
  /** Distinct brands they have been approved for. */
  brands: number;
  money: {
    /** Handed over. */
    paid: number;
    /** Work done, waiting on us. */
    due: number;
    /** Agreed, still being worked. */
    working: number;
    /** All three together: everything ever agreed. */
    total: number;
    currency: string;
  };
  /** How many approved requests sit in each stage, for the pipeline chart. */
  byStage: Record<OfferStage, { count: number; amount: number }>;
}

const EMPTY_STAGES = () =>
  Object.fromEntries(
    (Object.keys(STAGE_META) as OfferStage[]).map((s) => [s, { count: 0, amount: 0 }])
  ) as Record<OfferStage, { count: number; amount: number }>;

/**
 * Turn the rows into the numbers a dashboard shows.
 *
 * Money is bucketed by STAGE, never by status, because "approved" says nothing
 * about whether anybody has been paid. Each stage belongs to exactly one bucket
 * (see `STAGE_META`), so paid plus due plus working always equals the total
 * agreed, and a creator can add the three cards up and get the big number.
 *
 * An approved request with no fixed fee contributes nothing to the money and
 * still counts as work. Pretending it is worth zero would be a lie in the other
 * direction.
 */
export function summarise(rows: MyWorkRow[]): WorkSummary {
  const byStage = EMPTY_STAGES();
  const money = { paid: 0, due: 0, working: 0, total: 0, currency: 'USD' };
  const brands = new Set<string>();

  let approved = 0;
  let waiting = 0;
  let declined = 0;
  let active = 0;

  for (const row of rows) {
    if (row.status === 'pending') waiting += 1;
    if (row.status === 'rejected') declined += 1;
    if (row.status !== 'approved') continue;

    approved += 1;
    brands.add(row.brand_id);
    if (row.currency) money.currency = row.currency;

    const stage = row.stage ?? 'pending_request';
    const amount = Number(row.committed_amount ?? 0) || 0;

    byStage[stage].count += 1;
    byStage[stage].amount += amount;

    const bucket = STAGE_META[stage].bucket;
    money[bucket] += amount;
    money.total += amount;
    if (stage !== 'paid') active += 1;
  }

  return {
    active,
    approved,
    waiting,
    declined,
    brands: brands.size,
    money,
    byStage,
  };
}

/** The summary, memoised, straight from the rows. */
export function useWorkSummary(rows: MyWorkRow[] | undefined): WorkSummary {
  return useMemo(() => summarise(rows ?? []), [rows]);
}
