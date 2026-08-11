import { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { Search, Ticket } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ApplyDialog } from '@/components/creator/ApplyDialog';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { OfferCard } from '@/components/creator/OfferCard';
import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  stateFor,
  useAllCreatorOffers,
  useAllMyRequests,
  type CreatorOfferRow,
  type CreatorOfferState,
} from '@/lib/creator/useAllOffers';
import type { MyOfferApplication } from '@/lib/creator/useOfferApplications';
import { useCatalogueLive } from '@/lib/creator/useCatalogueLive';
import { useMyJobProgress } from '@/lib/work/job-progress';

/**
 * Every offer open to this creator, across every brand.
 *
 * The brand hub answers "what is this brand offering me". This answers "what is
 * on the table anywhere", which is the question a creator actually opens the
 * app with. Before this, seeing everything meant remembering every brand and
 * visiting each hub in turn.
 *
 * Filtering happens in the browser rather than the database, and that is a
 * deliberate exception to the project's usual rule. The filters that matter
 * here are "am I in", "am I waiting", "have I not asked", and those live in a
 * different table from the offers themselves. Fetching the offers and their own
 * requests once, then sorting them out here, is one round trip instead of a
 * join a creator would feel on every tab.
 */
type Tab = 'all' | 'in' | 'waiting' | 'open';

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'in', label: 'You are in' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'open', label: 'Not asked yet' },
];

const MATCHES: Record<Tab, (s: CreatorOfferState) => boolean> = {
  all: () => true,
  in: (s) => s === 'in' || s === 'open',
  waiting: (s) => s === 'waiting',
  open: (s) => s === 'canApply' || s === 'declined',
};

export function Offers() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  const [tab, setTab] = useState<Tab>('all');
  const [brandId, setBrandId] = useState('');
  const [search, setSearch] = useState('');
  const [applyingTo, setApplyingTo] = useState<CreatorOfferRow | null>(null);

  // Admin edits to brands, offers and products land here without a reload.
  useCatalogueLive('offers');

  const { data: offers, isLoading, isError, error } = useAllCreatorOffers();
  const { data: requests } = useAllMyRequests();
  // How much of each job has been filmed. Keyed by REQUEST, not by offer: five
  // videos for three hundred is a promise made to one creator on one request.
  const { data: progress } = useMyJobProgress();

  /** The newest request per offer. A rejected creator can ask again, so an
   *  offer can carry several rows and only the newest describes today. */
  const latest = useMemo(() => {
    const map = new Map<string, MyOfferApplication>();
    for (const r of requests ?? []) if (!map.has(r.offer_id)) map.set(r.offer_id, r);
    return map;
  }, [requests]);

  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of offers ?? []) if (o.brand) seen.set(o.brand.id, o.brand.name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [offers]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, in: 0, waiting: 0, open: 0 };
    for (const o of offers ?? []) {
      const s = stateFor(o, latest.get(o.id));
      c.all += 1;
      (Object.keys(MATCHES) as Tab[]).forEach((t) => {
        if (t !== 'all' && MATCHES[t](s)) c[t] += 1;
      });
    }
    return c;
  }, [offers, latest]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (offers ?? []).filter((o) => {
      if (brandId && o.brand_id !== brandId) return false;
      if (!MATCHES[tab](stateFor(o, latest.get(o.id)))) return false;
      if (!needle) return true;
      return (
        o.title.toLowerCase().includes(needle) ||
        (o.brand?.name ?? '').toLowerCase().includes(needle) ||
        (o.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [offers, latest, tab, brandId, search]);

  return (
    <AppShell>
      <div className="flex flex-col gap-1.5 px-0.5 py-1">
        <h1 className="font-display text-[clamp(26px,4.4vw,40px)] leading-[1.05] font-semibold tracking-[-0.02em]">
          Offers
        </h1>
        <p className="text-muted text-[15px]">
          Everything on the table, from every brand you work with.
        </p>
      </div>

      {!approved ? (
        <LockedUntilApproved className="mt-6" />
      ) : (
        <>
          {/* ------------------------------------------------------- tabs -- */}
          <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div
              role="tablist"
              aria-label="Filter offers"
              className="bg-surface-2 flex min-w-max gap-1 rounded-xl p-[3px]"
            >
              {TABS.map((t) => (
                <button
                  key={t.value}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.value}
                  onClick={() => setTab(t.value)}
                  className={cn(
                    'shrink-0 rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200',
                    tab === t.value ? 'bg-text text-inverse' : 'text-muted hover:text-text'
                  )}
                >
                  {t.label}
                  {counts[t.value] > 0 ? (
                    <span
                      className={cn(
                        'ml-1.5 text-[12px]',
                        tab === t.value ? 'text-inverse/70' : 'text-muted'
                      )}
                    >
                      {counts[t.value]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {/* ---------------------------------------------------- filters -- */}
          <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className="relative min-w-0 flex-1 basis-52">
              <Search
                size={15}
                aria-hidden
                className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
              />
              <input
                type="search"
                name="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search offers or brands"
                aria-label="Search offers or brands"
                className="border-line-interactive bg-surface-1 placeholder:text-faint hover:border-accent/60 focus:border-accent h-9 w-full rounded-xl border pr-3 pl-9 text-[13px] focus:outline-none"
              />
            </div>

            <label className="sr-only" htmlFor="brand-filter">
              Filter by brand
            </label>
            <Select
              id="brand-filter"
              name="brand"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="h-9 basis-44 text-[13px]"
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          {/* ------------------------------------------------------- list -- */}
          {isLoading ? (
            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="wx-skeleton h-52 rounded-[20px]" />
              ))}
            </ul>
          ) : isError ? (
            <div className="border-line bg-surface-1 mt-4 rounded-[20px] border px-6 py-14 text-center shadow-md">
              <p className="font-semibold">That list would not load</p>
              <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
                {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
              </p>
            </div>
          ) : shown.length === 0 ? (
            <div className="border-line bg-surface-1 mt-4 rounded-[20px] border px-6 py-16 text-center shadow-md">
              <Ticket size={26} aria-hidden className="text-faint mx-auto" />
              <p className="mt-4 font-semibold">
                {(offers ?? []).length === 0 ? 'No offers yet' : 'Nothing matches that'}
              </p>
              <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
                {(offers ?? []).length === 0
                  ? 'New offers land here as soon as a brand puts one up.'
                  : 'Try a different search, brand or tab.'}
              </p>
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((offer, i) => (
                <m.li
                  key={offer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04 }}
                >
                  <OfferCard
                    offer={offer}
                    request={latest.get(offer.id)}
                    progress={progress?.get(latest.get(offer.id)?.id ?? '')}
                    showBrand
                    onApply={() => setApplyingTo(offer)}
                  />
                </m.li>
              ))}
            </ul>
          )}
        </>
      )}

      {applyingTo ? (
        <ApplyDialog
          offer={applyingTo}
          brandName={applyingTo.brand?.name ?? 'this brand'}
          onClose={() => setApplyingTo(null)}
        />
      ) : null}
    </AppShell>
  );
}
