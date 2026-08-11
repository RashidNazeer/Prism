import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import type { OfferStatus } from '@/lib/admin/useBrands';

/**
 * Every offer we run, across every brand, in one place.
 *
 * The Brand Hub answers "what is this brand offering". This answers the
 * questions that cut across brands: what is live right now, who is on what, and
 * what is sitting waiting on somebody. Those are different jobs, so they are
 * different screens rather than one screen with a brand filter bolted on.
 *
 * Paginated and filtered in the database. This list grows with every brand
 * times every offer and has no ceiling.
 */

export const ALL_OFFERS_PAGE_SIZE = 20;

export type OfferStatusFilter = 'all' | OfferStatus;
export type OfferKindFilter = 'all' | 'application' | 'open';
export type AllOffersSort = 'newest' | 'oldest' | 'reward';

export interface AllOffersFilters {
  search: string;
  brandId: string;
  status: OfferStatusFilter;
  /** 'application' needs asking for, 'open' is anyone's to take. */
  kind: OfferKindFilter;
  sort: AllOffersSort;
  page: number;
}

export const DEFAULT_ALL_OFFERS_FILTERS: AllOffersFilters = {
  search: '',
  brandId: '',
  status: 'active',
  kind: 'all',
  sort: 'newest',
  page: 1,
};

export interface AllOffersRow {
  id: string;
  brand_id: string;
  badge_title: string | null;
  title: string;
  description: string | null;
  video_count: number | null;
  reward_amount: string | number | null;
  currency: string;
  status: OfferStatus;
  needs_application: boolean;
  created_at: string;
  brand: { id: string; name: string; is_active: boolean } | null;
}

/** How many creators are on an offer, and how many are waiting on a decision. */
export interface OfferPeople {
  approved: number;
  pending: number;
}

const COLUMNS =
  'id, brand_id, badge_title, title, description, video_count, reward_amount, ' +
  'currency, status, needs_application, created_at, ' +
  'brand:brands (id, name, is_active)';

/**
 * PostgREST puts filter values straight into the query string, where a comma or
 * a bracket changes what the filter means rather than being matched literally.
 */
const sanitise = (raw: string) =>
  raw.trim().replace(/[^a-zA-Z0-9 &._-]/g, '').slice(0, 64);

export function useAllOffers(filters: AllOffersFilters) {
  const search = sanitise(filters.search);

  return useQuery({
    queryKey: ['admin', 'all-offers', { ...filters, search }],
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<{ rows: AllOffersRow[]; total: number }> => {
      const from = (filters.page - 1) * ALL_OFFERS_PAGE_SIZE;

      let q = getSupabase().from('offers').select(COLUMNS, { count: 'exact' });

      if (filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.brandId) q = q.eq('brand_id', filters.brandId);
      if (filters.kind !== 'all') q = q.eq('needs_application', filters.kind === 'application');
      if (search) q = q.ilike('title', `%${search}%`);

      const order =
        filters.sort === 'reward'
          ? q.order('reward_amount', { ascending: false, nullsFirst: false })
          : q.order('created_at', { ascending: filters.sort === 'oldest' });

      const { data, error, count } = await order.range(
        from,
        from + ALL_OFFERS_PAGE_SIZE - 1
      );

      if (error) throw error;
      return { rows: (data ?? []) as unknown as AllOffersRow[], total: count ?? 0 };
    },
  });
}

/**
 * Who is on each offer on this page, in one grouped read rather than one per
 * row. Only offers that need applying for can answer this: an open offer
 * belongs to every creator on the roster and there is no row to count.
 */
export function useOfferPeople(offerIds: string[]) {
  const key = [...offerIds].sort().join(',');

  return useQuery({
    queryKey: ['admin', 'offer-people', key],
    enabled: offerIds.length > 0,
    staleTime: 15_000,
    queryFn: async (): Promise<Record<string, OfferPeople>> => {
      const { data, error } = await getSupabase()
        .from('offer_applications')
        .select('offer_id, status')
        .in('offer_id', offerIds)
        .in('status', ['approved', 'pending']);
      if (error) throw error;

      const people: Record<string, OfferPeople> = {};
      for (const row of (data ?? []) as { offer_id: string; status: string }[]) {
        const p = (people[row.offer_id] ??= { approved: 0, pending: 0 });
        if (row.status === 'approved') p.approved += 1;
        else p.pending += 1;
      }
      return people;
    },
  });
}

export interface OfferContent {
  approved: number;
  submitted: number;
  needs_another_take: number;
}

/**
 * What has actually been filmed against each offer on this page.
 *
 * The stage says where a job stands with us; this says what has landed. One
 * grouped read for the whole page, the same shape as `useOfferPeople` beside
 * it, and it rides the `content_submissions_offer_status_idx` added on
 * 2026-08-11. Before that index `offer_id` was a foreign key with nothing on
 * it, so every per-offer rollup was a sequential scan and so was every offer
 * deletion.
 *
 * Staff only in practice: `content_submissions` is theirs to read in full. A
 * creator running this would get a group built from their own rows, which is
 * why this hook lives here and nothing under `src/lib/creator/` may import it.
 */
export function useOfferContent(offerIds: string[]) {
  const key = [...offerIds].sort().join(',');

  return useQuery({
    queryKey: ['admin', 'offer-content', key],
    enabled: offerIds.length > 0,
    staleTime: 15_000,
    queryFn: async (): Promise<Record<string, OfferContent>> => {
      const { data, error } = await getSupabase()
        .from('content_submissions')
        .select('offer_id, status')
        .in('offer_id', offerIds);
      if (error) throw error;

      const out: Record<string, OfferContent> = {};
      for (const row of (data ?? []) as { offer_id: string; status: keyof OfferContent }[]) {
        const c = (out[row.offer_id] ??= { approved: 0, submitted: 0, needs_another_take: 0 });
        c[row.status] += 1;
      }
      return out;
    },
  });
}

/** Counts for the status tabs. Cheap: PostgREST returns a header, not rows. */
export function useOfferStatusCounts() {
  return useQuery({
    queryKey: ['admin', 'all-offer-counts'],
    staleTime: 30_000,
    queryFn: async (): Promise<{ active: number; inactive: number }> => {
      const supabase = getSupabase();
      const [active, inactive] = await Promise.all([
        supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase
          .from('offers')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'inactive'),
      ]);
      if (active.error) throw active.error;
      if (inactive.error) throw inactive.error;
      return { active: active.count ?? 0, inactive: inactive.count ?? 0 };
    },
  });
}

/** Every brand that has at least one offer, for the filter. */
export function useBrandsWithOffers() {
  return useQuery({
    queryKey: ['admin', 'brands-with-offers'],
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await getSupabase()
        .from('offers')
        .select('brand_id, brand:brands (id, name)');
      if (error) throw error;

      const seen = new Map<string, string>();
      for (const row of (data ?? []) as unknown as AllOffersRow[]) {
        if (row.brand) seen.set(row.brand.id, row.brand.name);
      }
      return [...seen.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
