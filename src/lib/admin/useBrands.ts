import { useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/**
 * Brands, and everything inside one brand's hub, as STAFF see it.
 *
 * Reads only. Every write goes through `useManageBrand`, which calls the
 * `manage-brand` Edge Function, because there are no write policies on any of
 * these tables at all.
 *
 * The creator's view of the same data is a separate file on purpose
 * (`src/lib/creator/useCreatorBrands.ts`). It reads fewer columns from fewer
 * tables, and keeping the two apart is what stops a creator screen quietly
 * inheriting a query that reaches for a budget.
 */

export const BRAND_PAGE_SIZE = 24;

/** The commercial half of a brand. Staff only, and its own table. */
interface Commercials {
  client_name: string | null;
  budget_allocated: string | number | null;
  currency: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  store_id: string;
  /** Creator facing: the brand's own story. */
  logo_url: string | null;
  tagline: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  /*
   * These three live in `brand_commercials`, not in `brands`, and are flattened
   * onto the object here so admin screens can carry on treating a brand as one
   * thing.
   *
   * The split is the whole reason creators can be shown a brand at all: the
   * budget is not a column they are filtered away from, it is a column that
   * does not exist on anything they can read. Never add these fields to a
   * creator facing query or type.
   */
  client_name: string | null;
  budget_allocated: string | number | null;
  currency: string;
}

export type OfferStatus = 'active' | 'inactive';

export interface Offer {
  id: string;
  brand_id: string;
  badge_title: string | null;
  title: string;
  description: string | null;
  /** Null when the offer has no fixed deliverable, e.g. a commission boost. */
  video_count: number | null;
  /**
   * Null when there is no fixed fee.
   *
   * Typed as string OR number on purpose: PostgREST hands `numeric` back as a
   * JSON number, while the same value arriving from the Edge Function can be a
   * string. Pretending it is only one of those is how a `.trim()` ends up
   * crashing a dialog. Always run it through `money()` or `Number()`.
   */
  reward_amount: string | number | null;
  currency: string;
  status: OfferStatus;
  needs_application: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandProduct {
  id: string;
  brand_id: string;
  name: string;
  external_product_id: string;
  image_url: string | null;
  /** Both optional: a product can be listed before its numbers are confirmed. */
  price: string | number | null;
  currency: string;
  commission_rate: string | number | null;
  badge_title: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const BRAND_COLUMNS =
  'id, name, slug, store_id, logo_url, tagline, description, is_active, created_at, updated_at, ' +
  'brand_commercials(client_name, budget_allocated, currency)';

const OFFER_COLUMNS =
  'id, brand_id, badge_title, title, description, video_count, reward_amount, currency, status, needs_application, created_at, updated_at';

export const PRODUCT_COLUMNS =
  'id, brand_id, name, external_product_id, image_url, price, currency, commission_rate, badge_title, is_active, created_at, updated_at';

type BrandRow = Omit<Brand, keyof Commercials> & {
  brand_commercials: Commercials | Commercials[] | null;
};

/**
 * Fold the commercial row into the brand.
 *
 * The array check is not paranoia: PostgREST returns an embedded resource as an
 * object when it can prove the relationship is one to one and as an array when
 * it cannot, and that proof depends on the constraints it finds. Handling both
 * costs a line and removes a whole class of "it worked locally" failure.
 */
function flatten(row: BrandRow): Brand {
  const { brand_commercials: embedded, ...brand } = row;
  const c = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;
  return {
    ...brand,
    client_name: c?.client_name ?? null,
    budget_allocated: c?.budget_allocated ?? null,
    currency: c?.currency ?? 'USD',
  };
}

/**
 * numeric arrives from PostgREST as a JSON number and from an Edge Function as
 * a string, so this takes either. Parse only at the point of display, never to
 * store or send back, or a penny goes missing on the way.
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

/** "25%", from whatever numeric shape arrived. Empty string when unset. */
export const percent = (value: string | number | null): string => {
  if (value === null || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n % 1 === 0 ? n : n.toFixed(2).replace(/0$/, '')}%`;
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
      return {
        rows: ((data ?? []) as unknown as BrandRow[]).map(flatten),
        total: count ?? 0,
      };
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
      return data ? flatten(data as unknown as BrandRow) : null;
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

/**
 * Every product on one brand, in the order they were added.
 *
 * Deliberately not live. Products change when somebody is sitting in this
 * screen editing them, and the mutation already refreshes the list, so a
 * websocket per hub would buy nothing.
 */
export function useProducts(brandId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'products', brandId],
    enabled: Boolean(brandId),
    staleTime: 15_000,
    queryFn: async (): Promise<BrandProduct[]> => {
      const { data, error } = await getSupabase()
        .from('brand_products')
        .select(PRODUCT_COLUMNS)
        .eq('brand_id', brandId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BrandProduct[];
    },
  });
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
