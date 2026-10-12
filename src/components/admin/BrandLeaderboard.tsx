import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataError } from '@/components/ui/DataState';
import { getSupabase } from '@/lib/supabase';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * This brand's leaderboard, exactly as its creators see it, and read only.
 *
 * It calls the same `creator_leaderboard` function the creator app does, which
 * admits staff as well as approved creators and returns eleven fixed columns, so
 * a manager sees the board a creator sees and nothing more. The rank is worked
 * out INSIDE the brand by the database, so "number 3 of 9" means nine creators
 * on this brand, not nine on the platform.
 *
 * Its own small hook rather than an import from the creator library: creator and
 * admin code stay on their own sides of the line, and the day one needs a
 * column the other does not, they are free to part.
 */

interface BoardRow {
  rank: number;
  creator_id: string;
  display_name: string | null;
  gmv: number;
  orders: number;
  videos: number;
  currency: string | null;
  total_creators: number;
}

const PAGE = 25;
const FROM = '2020-01-01';

function useBrandBoard(brandId: string, page: number) {
  return useQuery({
    queryKey: ['admin', 'brand-board', brandId, page],
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BoardRow[]> => {
      const { data, error } = await getSupabase().rpc('creator_leaderboard', {
        p_from: FROM,
        p_to: new Date().toISOString().slice(0, 10),
        p_limit: PAGE,
        p_offset: page * PAGE,
        p_search: null,
        p_brand_id: brandId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as BoardRow[];
    },
  });
}

export function BrandLeaderboard({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, refetch } = useBrandBoard(brandId, page);

  const rows = data ?? [];
  const total = rows[0]?.total_creators ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  if (isLoading) {
    return (
      <ul className="mt-4 grid gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="wx-skeleton h-16 rounded-xl" />
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <DataError
        className="mt-4"
        title="The leaderboard would not load"
        body="Nothing has been changed. Try again in a moment."
        onRetry={() => refetch()}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-surface-1 mt-4 rounded-xl px-6 py-14 text-center shadow-md">
        <Trophy size={26} aria-hidden className="text-faint mx-auto" />
        <p className="mt-4 font-semibold">Nobody is ranked yet</p>
        <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
          A creator appears on {brandName}'s leaderboard once their videos for this brand have
          sales figures. Nobody sits at the bottom on zero.
        </p>
      </div>
    );
  }

  return (
    <>
      <ol className="mt-4 grid gap-2">
        {rows.map((row) => (
          <li
            key={row.creator_id}
            className="bg-surface-1 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 shadow-md"
          >
            <span
              className={cn(
                'wx-numeric grid size-9 shrink-0 place-items-center rounded-full text-[0.875rem] font-bold',
                row.rank <= 3 ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
              )}
            >
              {row.rank}
            </span>

            <p className="min-w-0 flex-1 basis-40 font-semibold break-words">
              {row.display_name ?? 'A creator'}
            </p>

            <dl className="flex items-center gap-5">
              <div>
                <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                  GMV
                </dt>
                <dd className="wx-numeric mt-0.5 text-[0.9375rem] font-bold">
                  {money(row.gmv, row.currency ?? 'USD')}
                </dd>
              </div>
              <div>
                <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                  Orders
                </dt>
                <dd className="wx-numeric mt-0.5 text-[0.9375rem] font-semibold">
                  {row.orders}
                </dd>
              </div>
              <div>
                <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                  Videos
                </dt>
                <dd className="wx-numeric mt-0.5 text-[0.9375rem] font-semibold">
                  {row.videos}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-muted text-[0.8125rem]">
            Page {page + 1} of {pages}, {total} in total
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={15} aria-hidden />
              Back
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
