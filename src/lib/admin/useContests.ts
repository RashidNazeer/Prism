import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/**
 * Contests, as STAFF see them.
 *
 * Reads only. Every write goes through `useManageContest`, which calls the
 * `manage-contest` Edge Function, because there is no insert, update or delete
 * policy on any of the eleven contest tables and every database function is
 * granted to `service_role` alone.
 *
 * The creator's view of the same data is a separate file on purpose, the same
 * split that keeps `useCreatorBrands` away from `useBrands`. It reads fewer
 * columns from fewer tables, and keeping the two apart is what stops a creator
 * screen quietly inheriting a query that reaches for a budget.
 *
 * NOTHING HERE MAY BE IMPORTED BY CREATOR CODE. `contest_commercials` is staff
 * only at the database, so a creator importing this would get an empty result
 * rather than a leak, but the empty result would look like a bug and somebody
 * would "fix" it.
 */

export const BRAND_CONTESTS_PAGE_SIZE = 12;

export type ContestStatus = 'active' | 'inactive';
export type DeliverableKind = 'fixed' | 'rank' | 'milestone';

/** The commercial half. Staff only, and its own table for exactly that reason. */
export interface ContestCommercials {
  totalBudget: number | null;
  internalNote: string | null;
}

export interface ContestDeliverable {
  id: string;
  contestId: string;
  kind: DeliverableKind;
  title: string;
  detail: string | null;
  videoCount: number | null;
  rankPosition: number | null;
  metric: string | null;
  threshold: number | null;
  rewardAmount: number | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ContestProduct {
  productId: string;
  productName: string;
  externalProductId: string;
}

export interface ContestExclusion {
  id: string;
  handle: string | null;
  email: string | null;
  userId: string | null;
  reason: string | null;
  /** How many times somebody barred has tried anyway, straight at the API. */
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
}

export interface Contest {
  id: string;
  brandId: string;
  name: string;
  description: string | null;
  judgingBasis: string | null;
  briefUrl: string | null;
  bannerUrl: string | null;
  status: ContestStatus;
  needsAdminApproval: boolean;
  opensAt: string;
  expiresAt: string;
  /** An IANA zone name. "Europe/London", never "+01:00". */
  expiresAtTimezone: string;
  currency: string;
  settledAt: string | null;
  cancelledAt: string | null;
  cancelMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

const CONTEST_COLUMNS =
  'id, brand_id, name, description, judging_basis, brief_url, banner_url, status, ' +
  'needs_admin_approval, opens_at, expires_at, expires_at_timezone, currency, ' +
  'settled_at, cancelled_at, cancel_message, created_at, updated_at';

interface ContestRow {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  judging_basis: string | null;
  brief_url: string | null;
  banner_url: string | null;
  status: ContestStatus;
  needs_admin_approval: boolean;
  opens_at: string;
  expires_at: string;
  expires_at_timezone: string;
  currency: string;
  settled_at: string | null;
  cancelled_at: string | null;
  cancel_message: string | null;
  created_at: string;
  updated_at: string;
}

const flatten = (r: ContestRow): Contest => ({
  id: r.id,
  brandId: r.brand_id,
  name: r.name,
  description: r.description,
  judgingBasis: r.judging_basis,
  briefUrl: r.brief_url,
  bannerUrl: r.banner_url,
  status: r.status,
  needsAdminApproval: r.needs_admin_approval,
  opensAt: r.opens_at,
  expiresAt: r.expires_at,
  expiresAtTimezone: r.expires_at_timezone,
  currency: r.currency,
  settledAt: r.settled_at,
  cancelledAt: r.cancelled_at,
  cancelMessage: r.cancel_message,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/**
 * The three axes, as one word for a screen to print.
 *
 * "Active" is not one question, it is three: may somebody new enter, may
 * anybody read it, and may the people already in still work and be paid. This
 * only answers the first, and it is deliberately NOT called `isOpen`, because
 * a closed contest still carries live work.
 */
export type ContestState = 'settled' | 'cancelled' | 'closed' | 'off' | 'open';

export function stateOf(c: Contest, now = Date.now()): ContestState {
  if (c.cancelledAt) return 'cancelled';
  if (c.settledAt) return 'settled';
  if (c.status === 'inactive') return 'off';
  if (Date.parse(c.expiresAt) <= now) return 'closed';
  return 'open';
}

export const STATE_LABEL: Record<ContestState, string> = {
  open: 'Open to enter',
  off: 'Closed to new entries',
  closed: 'Deadline passed',
  settled: 'Settled',
  cancelled: 'Cancelled',
};

export interface BrandContestFilters {
  search: string;
  status: 'all' | ContestStatus;
  page: number;
}

const sanitise = (raw: string) =>
  raw
    .trim()
    .replace(/[^a-zA-Z0-9 &._-]/g, '')
    .slice(0, 64);

/**
 * Every contest a brand runs, paged in the database.
 *
 * Paged rather than fetched whole because the Offers tab shipped unbounded and
 * had to be fixed later, once its counts had quietly started describing the
 * first twelve rows.
 */
export function useBrandContests(brandId: string | undefined, filters: BrandContestFilters) {
  const search = sanitise(filters.search);

  return useQuery({
    queryKey: ['admin', 'contests', brandId, { ...filters, search }],
    enabled: Boolean(brandId),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<{ rows: Contest[]; total: number }> => {
      const from = (filters.page - 1) * BRAND_CONTESTS_PAGE_SIZE;

      let q = getSupabase()
        .from('contests')
        .select(CONTEST_COLUMNS, { count: 'exact' })
        .eq('brand_id', brandId!);

      if (filters.status !== 'all') q = q.eq('status', filters.status);
      if (search) q = q.ilike('name', `%${search}%`);

      // Soonest deadline first. A contest closing tomorrow is the one somebody
      // opened this tab to deal with.
      const { data, error, count } = await q
        .order('expires_at', { ascending: true })
        .range(from, from + BRAND_CONTESTS_PAGE_SIZE - 1);

      if (error) throw error;
      return {
        rows: ((data ?? []) as unknown as ContestRow[]).map(flatten),
        total: count ?? 0,
      };
    },
  });
}

/** Counts for the status tabs, in the database rather than over a page of rows. */
export function useBrandContestCounts(brandId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'contests', brandId, 'counts'],
    enabled: Boolean(brandId),
    staleTime: 15_000,
    queryFn: async (): Promise<{ all: number; active: number; inactive: number }> => {
      const sb = getSupabase();
      const base = () =>
        sb.from('contests').select('id', { count: 'exact', head: true }).eq('brand_id', brandId!);

      const [all, active, inactive] = await Promise.all([
        base(),
        base().eq('status', 'active'),
        base().eq('status', 'inactive'),
      ]);

      if (all.error) throw all.error;
      return {
        all: all.count ?? 0,
        active: active.count ?? 0,
        inactive: inactive.count ?? 0,
      };
    },
  });
}

/**
 * One contest and everything inside it, for the setup screen.
 *
 * Five reads rather than one nested select, because the commercial row is in a
 * different table with a different policy and a nested select that silently
 * returns null for it would look identical to a contest with no budget set.
 */
export function useContest(contestId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'contest', contestId],
    enabled: Boolean(contestId),
    staleTime: 10_000,
    queryFn: async (): Promise<{
      contest: Contest | null;
      commercials: ContestCommercials | null;
      deliverables: ContestDeliverable[];
      products: ContestProduct[];
      exclusions: ContestExclusion[];
    }> => {
      const sb = getSupabase();
      const id = contestId!;

      const [c, m, d, p, x] = await Promise.all([
        sb.from('contests').select(CONTEST_COLUMNS).eq('id', id).maybeSingle(),
        sb
          .from('contest_commercials')
          .select('total_budget, internal_note')
          .eq('contest_id', id)
          .maybeSingle(),
        sb
          .from('contest_deliverables')
          .select(
            'id, contest_id, kind, title, detail, video_count, rank_position, metric, ' +
              'threshold, reward_amount, sort_order, is_active'
          )
          .eq('contest_id', id)
          .order('sort_order', { ascending: true }),
        sb
          .from('contest_products')
          .select('product_id, product_name, external_product_id')
          .eq('contest_id', id)
          .order('product_name', { ascending: true }),
        sb
          .from('contest_exclusions')
          .select('id, handle, email, user_id, reason, attempts, last_attempt_at, created_at')
          .eq('contest_id', id)
          .order('created_at', { ascending: false }),
      ]);

      if (c.error) throw c.error;
      if (m.error) throw m.error;
      if (d.error) throw d.error;
      if (p.error) throw p.error;
      if (x.error) throw x.error;

      interface DRow {
        id: string;
        contest_id: string;
        kind: DeliverableKind;
        title: string;
        detail: string | null;
        video_count: number | null;
        rank_position: number | null;
        metric: string | null;
        threshold: number | null;
        reward_amount: number | null;
        sort_order: number;
        is_active: boolean;
      }
      interface PRow {
        product_id: string;
        product_name: string;
        external_product_id: string;
      }
      interface XRow {
        id: string;
        handle: string | null;
        email: string | null;
        user_id: string | null;
        reason: string | null;
        attempts: number;
        last_attempt_at: string | null;
        created_at: string;
      }
      const mm = m.data as unknown as { total_budget: number | null; internal_note: string | null } | null;

      return {
        contest: c.data ? flatten(c.data as unknown as ContestRow) : null,
        commercials: mm ? { totalBudget: mm.total_budget, internalNote: mm.internal_note } : null,
        deliverables: ((d.data ?? []) as unknown as DRow[]).map((r) => ({
          id: r.id,
          contestId: r.contest_id,
          kind: r.kind,
          title: r.title,
          detail: r.detail,
          videoCount: r.video_count,
          rankPosition: r.rank_position,
          metric: r.metric,
          threshold: r.threshold,
          rewardAmount: r.reward_amount,
          sortOrder: r.sort_order,
          isActive: r.is_active,
        })),
        products: ((p.data ?? []) as unknown as PRow[]).map((r) => ({
          productId: r.product_id,
          productName: r.product_name,
          externalProductId: r.external_product_id,
        })),
        exclusions: ((x.data ?? []) as unknown as XRow[]).map((r) => ({
          id: r.id,
          handle: r.handle,
          email: r.email,
          userId: r.user_id,
          reason: r.reason,
          attempts: r.attempts,
          lastAttemptAt: r.last_attempt_at,
          createdAt: r.created_at,
        })),
      };
    },
  });
}
