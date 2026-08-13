import { useEffect } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { joinChannel } from '@/lib/realtime';
import { CONTENT_COLUMNS, type ContentRow, type ContentStatus } from '@/lib/content';

/**
 * Every video posted, for the team.
 *
 * Paginated in the database like every other growable list here, and filtered
 * there too. The one thing done in the browser is nothing: search, status and
 * brand all go down the wire, because a team with a thousand videos should not
 * be shipped a thousand rows to filter three of them out.
 */

export interface ContentFilters {
  status: ContentStatus | 'all';
  brandId: string;
  /** Handle or ad code, both trigram indexed. */
  search: string;
  sort: 'newest' | 'oldest';
  page: number;
}

export const CONTENT_PAGE_SIZE = 24;

export function useAdminContent(filters: ContentFilters) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'content', filters],
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    queryFn: async (): Promise<{ rows: ContentRow[]; total: number }> => {
      const from = (filters.page - 1) * CONTENT_PAGE_SIZE;

      let q = getSupabase()
        .from('content_submissions')
        .select(CONTENT_COLUMNS, { count: 'exact' })
        .order('created_at', { ascending: filters.sort === 'oldest' })
        .range(from, from + CONTENT_PAGE_SIZE - 1);

      if (filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.brandId) q = q.eq('brand_id', filters.brandId);

      const needle = filters.search.trim();
      if (needle) {
        // Handle OR ad code. `%` has to be escaped or a creator searching for
        // it matches everything.
        const safe = needle.replace(/[%,]/g, '');
        q = q.or(`creator_handle.ilike.%${safe}%,ad_code.ilike.%${safe}%`);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ContentRow[], total: count ?? 0 };
    },
  });

  // A creator posting a video has to appear in the queue while somebody is
  // looking at it, the same way a request does.
  useEffect(() => {
    return joinChannel('admin-content', [{ table: 'content_submissions' }], () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content-counts'] });
    });
  }, [queryClient]);

  return query;
}

/**
 * How many sit in each status, for the tabs and the board at the top.
 *
 * One grouped read rather than one query per status. Only the status column
 * comes back, because a number is all this needs.
 */
export type ContentTotals = Record<ContentStatus | 'all', number>;

export interface BrandContentRow extends ContentTotals {
  id: string;
  name: string;
}

export function useContentCounts() {
  return useQuery({
    queryKey: ['admin', 'content-counts'],
    staleTime: 10_000,
    queryFn: async (): Promise<{ totals: ContentTotals; byBrand: BrandContentRow[] }> => {
      // Still ONE read. The brand comes back on the same row, so the split by
      // brand costs nothing beyond a slightly wider select.
      const { data, error } = await getSupabase()
        .from('content_submissions')
        .select('status, brand_id, brand:brands (id, name)')
        .limit(5000);
      if (error) throw error;

      const blank = (): ContentTotals => ({
        all: 0,
        submitted: 0,
        approved: 0,
        needs_another_take: 0,
      });

      const totals = blank();
      const brands = new Map<string, BrandContentRow>();

      for (const row of (data ?? []) as unknown as {
        status: ContentStatus;
        brand_id: string;
        brand: { id: string; name: string } | null;
      }[]) {
        totals.all += 1;
        totals[row.status] += 1;

        const id = row.brand?.id ?? row.brand_id;
        const existing = brands.get(id) ?? {
          id,
          name: row.brand?.name ?? 'A brand',
          ...blank(),
        };
        existing.all += 1;
        existing[row.status] += 1;
        brands.set(id, existing);
      }

      return {
        totals,
        // Busiest first: the brand with the most videos is the one a team is
        // most likely to be looking for.
        byBrand: [...brands.values()].sort((a, b) => b.all - a.all),
      };
    },
  });
}

/** The team's decision on one video. Staff only, checked again server side. */
export function useReviewContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      contentId: string;
      status: Exclude<ContentStatus, 'submitted'>;
      note: string | null;
    }) => {
      const { data, error } = await getSupabase().functions.invoke('manage-content', {
        body: { action: 'content.review', ...input },
      });
      if (error) throw new Error(await messageFrom(error));
      /*
       * `advanced` and `reopened` are the database telling us what the decision
       * actually DID to the job. They were being fetched and thrown away, so
       * approving the last video of a job silently finished somebody's work and
       * the person who clicked it was never told.
       */
      return data as {
        result: { submission: ContentRow; advanced: boolean; reopened: boolean };
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content-counts'] });
      // Approving the last video finishes the job, so the request queue and
      // every progress figure on the page are now out of date too.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offer-applications'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offer-content'] });
      void queryClient.invalidateQueries({ queryKey: ['work', 'job-progress-for'] });
      void queryClient.invalidateQueries({ queryKey: ['work', 'latest-stage-moves'] });
    },
  });
}

async function messageFrom(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // Not JSON. Fall through.
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'That did not go through. Try again.';
}
