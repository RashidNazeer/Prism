import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Plus, Search, Store, Tag } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { BrandDialog } from '@/components/admin/BrandDialog';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  BRAND_PAGE_SIZE,
  money,
  useBrands,
  useOfferCounts,
  type BrandFilters,
} from '@/lib/admin/useBrands';

const TABS: { value: BrandFilters['active']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Retired' },
  { value: 'all', label: 'All' },
];

const isActiveFilter = (v: string | null): v is BrandFilters['active'] =>
  v === 'active' || v === 'inactive' || v === 'all';

/**
 * Every brand we run.
 *
 * A brand is a seller store on TikTok Shop, and each one owns a hub: offers
 * now, campaigns, contests, promotions, discounts and creator management to
 * come. This screen is the way in to all of them.
 */
export function Brands() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);

  const activeParam = params.get('active');
  const filters: BrandFilters = {
    active: isActiveFilter(activeParam) ? activeParam : 'active',
    search: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  const [searchDraft, setSearchDraft] = useState(filters.search);
  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  const setFilters = (next: Partial<BrandFilters>) => {
    const merged = { ...filters, ...next };
    if (next.page === undefined) merged.page = 1;

    const p = new URLSearchParams();
    if (merged.active !== 'active') p.set('active', merged.active);
    if (merged.search) p.set('q', merged.search);
    if (merged.page > 1) p.set('page', String(merged.page));
    setParams(p, { replace: true });
  };

  const { data, isLoading, isError, error, isPlaceholderData } = useBrands(filters);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / BRAND_PAGE_SIZE));

  const { data: counts } = useOfferCounts(rows.map((b) => b.id));

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.6rem,4vw,2.25rem)] font-extrabold">Brands</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
            Every seller store we run. Open one to manage its offers, and everything else
            in its hub.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus size={16} aria-hidden />
          Add brand
        </Button>
      </div>

      {/* ----------------------------------------------------------- filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:gap-3">
        <div
          role="tablist"
          aria-label="Filter brands"
          className="inline-flex rounded-xl border border-line bg-surface-1 p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={filters.active === t.value}
              onClick={() => setFilters({ active: t.value })}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 sm:px-3.5',
                filters.active === t.value
                  ? 'bg-accent text-on-accent'
                  : 'text-muted hover:text-accent'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form
          className="relative min-w-0 flex-1 basis-48"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ search: searchDraft });
          }}
        >
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            name="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search brands"
            aria-label="Search brands by name"
            className="h-9 w-full rounded-xl border border-line-interactive bg-surface-1 pr-3 pl-9 text-[13px] placeholder:text-faint hover:border-accent/60 focus:border-accent focus:outline-none"
          />
        </form>
      </div>

      {/* ------------------------------------------------------------- grid */}
      <div className={cn('mt-5 transition-opacity duration-200', isPlaceholderData && 'opacity-60')}>
        {isLoading ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-40 animate-pulse rounded-2xl bg-surface-1" />
            ))}
          </ul>
        ) : isError ? (
          <div className="rounded-2xl border border-line bg-surface-1 px-6 py-14 text-center">
            <p className="font-semibold">That list would not load</p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface-1 px-6 py-16 text-center">
            <Store size={26} aria-hidden className="mx-auto text-faint" />
            <p className="mt-4 font-semibold">
              {filters.search || filters.active !== 'active'
                ? 'No brands match that'
                : 'No brands yet'}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
              {filters.search || filters.active !== 'active'
                ? 'Try a different search, or switch to All.'
                : 'Add the first seller store and its hub is ready to fill.'}
            </p>
            {!filters.search && filters.active === 'active' ? (
              <Button className="mt-6" onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden />
                Add brand
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((brand) => {
              const c = counts?.[brand.id];
              return (
                <li key={brand.id}>
                  <Link
                    to={`/admin/brands/${brand.id}`}
                    className="flex h-full flex-col rounded-2xl border border-line bg-surface-1 p-5 transition-colors duration-200 hover:border-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-lg font-bold">{brand.name}</span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-faint">
                          {brand.store_id}
                        </span>
                      </span>
                      {!brand.is_active ? (
                        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
                          Retired
                        </span>
                      ) : null}
                    </div>

                    {brand.client_name ? (
                      <p className="mt-3 truncate text-[13px] text-muted">
                        {brand.client_name}
                      </p>
                    ) : null}

                    <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
                      <span>
                        <span className="block font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                          Budget
                        </span>
                        <span className="wx-numeric mt-1 block text-[15px] font-semibold">
                          {money(brand.budget_allocated, brand.currency)}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-muted">
                        <Tag size={12} aria-hidden />
                        <span className="wx-numeric">{c ? c.active : 0}</span> live
                        {c && c.total > c.active ? (
                          <span className="text-faint">of {c.total}</span>
                        ) : null}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* -------------------------------------------------------- pagination */}
      {total > BRAND_PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="wx-numeric text-[13px] text-muted">
            {(filters.page - 1) * BRAND_PAGE_SIZE + 1} to{' '}
            {Math.min(filters.page * BRAND_PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ page: filters.page - 1 })}
            >
              <ChevronLeft size={15} aria-hidden />
              Previous
            </Button>
            <span className="wx-numeric px-1 font-mono text-[12px] text-muted">
              {filters.page} / {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={filters.page >= pages}
              onClick={() => setFilters({ page: filters.page + 1 })}
            >
              Next
              <ChevronRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      {creating ? <BrandDialog onClose={() => setCreating(false)} /> : null}
    </AppShell>
  );
}
