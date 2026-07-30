import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/**
 * Brands, offers and products AS A CREATOR SEES THEM.
 *
 * A separate file from `src/lib/admin/useBrands.ts` on purpose, and it must
 * stay separate. The admin hooks reach into `brand_commercials` for the client
 * and the allocated budget; nothing in here does, or ever should.
 *
 * That is belt as well as braces. The database is the real guard: those columns
 * live in a different table with a staff-only policy, so a creator asking for
 * them by name gets nothing. This file exists so nobody has to rely on that
 * while reading a screen.
 *
 * Row level security also decides WHICH rows arrive. Retired brands, inactive
 * offers and hidden products are already gone before the browser sees them, so
 * there is no `status` filter anywhere below. Adding one would only hide the
 * fact that the database is doing the work.
 */

export interface CreatorBrand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  tagline: string | null;
  description: string | null;
}

export interface CreatorOffer {
  id: string;
  brand_id: string;
  badge_title: string | null;
  title: string;
  description: string | null;
  /** Null when there is no fixed deliverable, e.g. a boosted commission rate. */
  video_count: number | null;
  /** Null when there is no fixed fee. Arrives as a JSON number. */
  reward_amount: string | number | null;
  currency: string;
  needs_application: boolean;
  created_at: string;
}

export interface CreatorProduct {
  id: string;
  brand_id: string;
  name: string;
  image_url: string | null;
  price: string | number | null;
  currency: string;
  commission_rate: string | number | null;
  badge_title: string | null;
}

const BRAND_COLUMNS = 'id, name, slug, logo_url, tagline, description';
const OFFER_COLUMNS =
  'id, brand_id, badge_title, title, description, video_count, reward_amount, currency, needs_application, created_at';
const PRODUCT_COLUMNS =
  'id, brand_id, name, image_url, price, currency, commission_rate, badge_title';

/** Every brand a creator may work with. */
export function useCreatorBrands() {
  return useQuery({
    queryKey: ['creator', 'brands'],
    // Brands change rarely and this is the screen people bounce in and out of.
    staleTime: 60_000,
    queryFn: async (): Promise<CreatorBrand[]> => {
      const { data, error } = await getSupabase()
        .from('brands')
        .select(BRAND_COLUMNS)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CreatorBrand[];
    },
  });
}

/**
 * One brand, by slug.
 *
 * By slug rather than id because creators hold these links, and the slug is
 * generated once and never regenerated on rename for exactly that reason.
 */
export function useCreatorBrand(slug: string | undefined) {
  return useQuery({
    queryKey: ['creator', 'brand', slug],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: async (): Promise<CreatorBrand | null> => {
      const { data, error } = await getSupabase()
        .from('brands')
        .select(BRAND_COLUMNS)
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CreatorBrand | null) ?? null;
    },
  });
}

export function useCreatorOffers(brandId: string | undefined) {
  return useQuery({
    queryKey: ['creator', 'offers', brandId],
    enabled: Boolean(brandId),
    staleTime: 30_000,
    queryFn: async (): Promise<CreatorOffer[]> => {
      const { data, error } = await getSupabase()
        .from('offers')
        .select(OFFER_COLUMNS)
        .eq('brand_id', brandId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CreatorOffer[];
    },
  });
}

export function useCreatorProducts(brandId: string | undefined) {
  return useQuery({
    queryKey: ['creator', 'products', brandId],
    enabled: Boolean(brandId),
    staleTime: 60_000,
    queryFn: async (): Promise<CreatorProduct[]> => {
      const { data, error } = await getSupabase()
        .from('brand_products')
        .select(PRODUCT_COLUMNS)
        .eq('brand_id', brandId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CreatorProduct[];
    },
  });
}

/**
 * How many offers each brand has, for the brand list.
 *
 * One grouped read rather than one per card. Only ids come back, because the
 * list needs a number and nothing else.
 */
export function useCreatorOfferCounts(brandIds: string[]) {
  const key = [...brandIds].sort().join(',');

  return useQuery({
    queryKey: ['creator', 'offer-counts', key],
    enabled: brandIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await getSupabase()
        .from('offers')
        .select('brand_id')
        .in('brand_id', brandIds);
      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { brand_id: string }[]) {
        counts[row.brand_id] = (counts[row.brand_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}
