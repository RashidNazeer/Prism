import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/**
 * The best commission rate each brand offers, for the marketplace cards.
 *
 * ONE LIGHT READ for the whole grid: `brand_id, commission_rate` from
 * `brand_products`, the same table the brand page already reads and under the
 * same creator policy (active products of active brands). No new table, RPC or
 * policy. Only the rate comes back, never an amount: commission is a term
 * offered, not a measured figure. A brand with no rate set is absent from the
 * result, so a missing rate is never drawn as 0%.
 */
export function useBrandRates(brandIds: string[]) {
  const key = [...brandIds].sort().join(',');

  return useQuery({
    queryKey: ['creator', 'brand-rates', key],
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await getSupabase()
        .from('brand_products')
        .select('brand_id, commission_rate')
        .in('brand_id', brandIds)
        .not('commission_rate', 'is', null)
        .limit(2000);
      if (error) throw error;

      const best: Record<string, number> = {};
      for (const row of (data ?? []) as { brand_id: string; commission_rate: string | number }[]) {
        const rate = Number(row.commission_rate);
        if (!Number.isFinite(rate) || rate <= 0) continue;
        const prev = best[row.brand_id];
        if (prev === undefined || rate > prev) {
          best[row.brand_id] = rate;
        }
      }
      return best;
    },
  });
}
