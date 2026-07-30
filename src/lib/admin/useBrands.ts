import { useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/**
 * Brands, and the offers inside one brand's hub.
 *
 * Reads only. Every write goes through `useManageBrand`, which calls the
 * `manage-brand` Edge Function, because there are no write policies on either
 * table at all.
 */

export const BRAND_PAGE_SIZE = 24;

export interface Brand {
  id: string;
  name: string;
  slug: string;
  store_id: string;
  client_name: string | null;
  budget_allocated: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type OfferStatus = 'active' | 'inactive';

export interface Offer {
  id: string;
  brand_id: string;
  badge_title: string | null;
  title: string;
  description: string | null;
  video_count: number;
  reward_amount: string;
  currency: string;
  status: OfferStatus;
  needs_application: boolean;
  created_at: string;
  updated_at: string;
}

const BRAND_COLUMNS =
  'id, name, slug, store_id, client_name, budget_allocated, currency, is_active, created_at, updated_at';

const OFFER_COLUMNS =
  'id, brand_id, badge_title, title, description, video_count, reward_amount, currency, status, needs_application, created_at, updated_at';

/**
 * numeric comes back from PostgREST as a STRING, on purpose: JavaScript numbers
 * cannot hold every value a numeric(14,2) can. Parse only at the point of
 * display, never to store or send back.
 */
export const money = (value: string | number | null, currency = 'USD'): string => {
  if (value === null || value === '') return 'Not set';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 'Not set';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    // An unknown currency code should not blank the screen.
    return `${currency} ${n.toLocaleString()}`;
  }
};

export interface BrandFilters {
  search: string;
  /** 'all' keeps switched-off brands visible; the list defaults to active. */
  active: 'all' | 'active' | 'inactive';
  page: number;
}

const sanitise = (raw: string) =>
  raw.trim().replace(/[^a-zA-Z0-9 &._-]/g, '').slice(0, 64);

export function useBrands(filters: BrandFilters) {
  const search = sanitise(filters.search);

  return useQuery({
    queryKey: ['admin', 'brands', { ...filters, search }],
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<{ rows: Brand[]; total: number }> => {
      const from = (filters.page - 1) * BRAND_PAGE_SIZE;
      let q = getSupabase().from('brands').select(BRAND_COLUMNS, { count: 'exact' });

      if (filters.active !== 'all') q = q.eq('is_active', filters.active === 'active');
      if (search) q = q.ilike('name', `%${search}%`);

      const { data, error, count } = await q
        .order('name', { ascending: true })
        .range(from, from + BRAND_PAGE_SIZE - 1);

      if (error) throw error;
      return { rows: (data ?? []) as unknown as Brand[], total: count ?? 0 };
    },
  });
}

/** One brand, by id. */
export function useBrand(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'brand', id],
    enabled: Boolean(id),
    staleTime: 15_000,
    queryFn: async (): Promise<Brand | null> => {
      const { data, error } = await getSupabase()
        .from('brands')
        .select(BRAND_COLUMNS)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Brand | null) ?? null;
    },
  });
}

/**
 * Every offer in one brand's hub, kept live.
 *
 * Two admins can be in the same hub at once. Without this, one of them edits a
 * reward and the other keeps quoting the old number to a creator.
 */
export function useOffers(brandId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'offers', brandId],
    enabled: Boolean(brandId),
    staleTime: 15_000,
    queryFn: async (): Promise<Offer[]> => {
      const { data, error } = await getSupabase()
        .from('offers')
        .select(OFFER_COLUMNS)
        .eq('brand_id', brandId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Offer[];
    },
  });

  useEffect(() => {
    if (!brandId) return;
    const supabase = getSupabase();

    // Narrow to this brand. Never a firehose over every offer in the product.
    const channel = supabase
      .channel(`offers:${brandId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'offers',
          filter: `brand_id=eq.${brandId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'offers', brandId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [brandId, queryClient]);

  return query;
}

/** How many offers each brand has, for the list. One grouped read, not N. */
export function useOfferCounts(brandIds: string[]) {
  const key = [...brandIds].sort().join(',');

  return useQuery({
    queryKey: ['admin', 'offer-counts', key],
    enabled: brandIds.length > 0,
    staleTime: 15_000,
    queryFn: async (): Promise<Record<string, { total: number; active: number }>> => {
      const { data, error } = await getSupabase()
        .from('offers')
        .select('brand_id, status')
        .in('brand_id', brandIds);
      if (error) throw error;

      const counts: Record<string, { total: number; active: number }> = {};
      for (const row of (data ?? []) as { brand_id: string; status: OfferStatus }[]) {
        const c = (counts[row.brand_id] ??= { total: 0, active: 0 });
        c.total += 1;
        if (row.status === 'active') c.active += 1;
      }
      return counts;
    },
  });
}
