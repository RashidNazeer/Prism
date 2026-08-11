import { useEffect } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
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
    const supabase = getSupabase();
    const channel = supabase
      .channel('admin-content')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'content_submissions' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
          void queryClient.invalidateQueries({ queryKey: ['admin', 'content-counts'] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

/**
 * How many sit in each status, for the tabs and the board at the top.
 *
 * One grouped read rather than one query per status. Only the status column
 * comes back, because a number is all this needs.
 */
export function useContentCounts() {
  return useQuery({
    queryKey: ['admin', 'content-counts'],
    staleTime: 10_000,
    queryFn: async (): Promise<Record<ContentStatus | 'all', number>> => {
      const { data, error } = await getSupabase()
        .from('content_submissions')
        .select('status')
        .limit(5000);
      if (error) throw error;

      const counts = {
        all: 0,
        submitted: 0,
        approved: 0,
        needs_another_take: 0,
      } as Record<ContentStatus | 'all', number>;
      for (const row of (data ?? []) as { status: ContentStatus }[]) {
        counts.all += 1;
        counts[row.status] += 1;
      }
      return counts;
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
      return data as { result: { submission: ContentRow; advanced: boolean } };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content-counts'] });
      // Approving the last video finishes the job, so the request queue is now
      // out of date too.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offer-applications'] });
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
