import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import type { OfferApplicationStatus } from '@/lib/creator/useOfferApplications';

/**
 * The offer queue: every creator asking for an offer, and what they asked for.
 *
 * Paginated and filtered in the database, never in the browser. This list grows
 * with every creator times every offer, so "fetch everything then filter" was
 * never an option here.
 *
 * Identity comes from the columns snapshotted onto the row when the request was
 * made, not from a join. That is deliberate: it keeps search to one trigram
 * index on one table, and it means the queue still reads correctly after a
 * creator changes their display name or their account is closed.
 */

export const OFFER_QUEUE_PAGE_SIZE = 20;

export type OfferStatusFilter = 'all' | OfferApplicationStatus;
export type OfferSortOrder = 'newest' | 'oldest';

export interface OfferQueueFilters {
  status: OfferStatusFilter;
  /** Empty means every brand. */
  brandId: string;
  search: string;
  sort: OfferSortOrder;
  page: number;
}

export const DEFAULT_OFFER_FILTERS: OfferQueueFilters = {
  status: 'pending',
  brandId: '',
  search: '',
  sort: 'newest',
  page: 1,
};

export interface OfferQueueRow {
  id: string;
  offer_id: string;
  brand_id: string;
  creator_id: string;
  creator_handle: string | null;
  creator_name: string | null;
  creator_email: string | null;
  status: OfferApplicationStatus;
  /** The currency the offer was quoted in when they asked. */
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
  brand: { id: string; name: string } | null;
}

/**
 * PostgREST puts filter values straight into the query string, where a comma,
 * a bracket or a dot changes what the filter MEANS rather than being matched
 * literally. `or=(...)` is especially easy to break, so anything that is not a
 * plain search character is dropped before it can get near one.
 */
export const sanitiseOfferSearch = (raw: string) =>
  raw.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9._@ -]/g, '').slice(0, 64);

const COLUMNS =
  'id, offer_id, brand_id, creator_id, creator_handle, creator_name, creator_email, ' +
  'status, currency, note, decision_note, decided_at, created_at, ' +
  'offer:offers (id, title, video_count, reward_amount, currency), ' +
  'brand:brands (id, name)';

export function useOfferApplications(filters: OfferQueueFilters) {
  const search = sanitiseOfferSearch(filters.search);

  return useQuery({
    queryKey: ['admin', 'offer-applications', { ...filters, search }],
    // Keep the previous page on screen while the next one loads, or every page
    // change flashes an empty list and reads as a bug.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<{ rows: OfferQueueRow[]; total: number }> => {
      const from = (filters.page - 1) * OFFER_QUEUE_PAGE_SIZE;

      let q = getSupabase()
        .from('offer_applications')
        .select(COLUMNS, { count: 'exact' });

      if (filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.brandId) q = q.eq('brand_id', filters.brandId);
      if (search) {
        q = q.or(
          `creator_handle.ilike.*${search}*,creator_name.ilike.*${search}*,creator_email.ilike.*${search}*`
        );
      }

      const { data, error, count } = await q
        .order('created_at', { ascending: filters.sort === 'oldest' })
        .range(from, from + OFFER_QUEUE_PAGE_SIZE - 1);

      if (error) throw error;
      return { rows: (data ?? []) as unknown as OfferQueueRow[], total: count ?? 0 };
    },
  });
}

export type OfferApplicationCounts = Record<OfferApplicationStatus, number>;

/**
 * Counts for the tabs and the dashboard.
 *
 * `head: true` means PostgREST returns the count in a header and no rows at
 * all, so this stays cheap however long the queue gets.
 */
export function useOfferApplicationCounts() {
  return useQuery({
    queryKey: ['admin', 'offer-application-counts'],
    staleTime: 30_000,
    queryFn: async (): Promise<OfferApplicationCounts> => {
      const supabase = getSupabase();
      const statuses: OfferApplicationStatus[] = [
        'pending',
        'approved',
        'rejected',
        'withdrawn',
      ];

      const results = await Promise.all(
        statuses.map((s) =>
          supabase
            .from('offer_applications')
            .select('id', { count: 'exact', head: true })
            .eq('status', s)
        )
      );

      const counts: OfferApplicationCounts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        withdrawn: 0,
      };
      results.forEach((r, i) => {
        if (r.error) throw r.error;
        counts[statuses[i]!] = r.count ?? 0;
      });
      return counts;
    },
  });
}

/** Brands that actually have requests, for the filter. One grouped read. */
export function useBrandsWithRequests() {
  return useQuery({
    queryKey: ['admin', 'offer-application-brands'],
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await getSupabase()
        .from('offer_applications')
        .select('brand_id, brand:brands (id, name)');
      if (error) throw error;

      const seen = new Map<string, string>();
      for (const row of (data ?? []) as unknown as OfferQueueRow[]) {
        if (row.brand) seen.set(row.brand.id, row.brand.name);
      }
      return [...seen.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export function useReviewOfferApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      applicationId: string;
      decision: 'approved' | 'rejected';
      note: string | null;
    }): Promise<OfferQueueRow> => {
      const { data, error } = await getSupabase().functions.invoke(
        'manage-offer-application',
        { body: { action: 'application.review', ...input } }
      );
      if (error) throw new Error(await messageFrom(error));
      return (data as { result: OfferQueueRow }).result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offer-applications'] });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'offer-application-counts'],
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
      void queryClient.invalidateQueries({ queryKey: ['creator', 'my-offer-applications'] });
    },
  });
}

/**
 * Pull the real message out of a failed function call.
 *
 * `functions.invoke` reports any non-2xx as a generic "Edge Function returned a
 * non-2xx status code" and hides the body on `error.context`, which is the
 * actual Response. Without this an admin sees that sentence instead of
 * "that was already approved".
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
