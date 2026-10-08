import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Plus, Search, Store, Tag } from 'lucide-react';
import { BrandDialog } from '@/components/admin/BrandDialog';
import { BudgetBar } from '@/components/admin/BudgetBar';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import {
  BRAND_PAGE_SIZE,
  BUDGET_BANDS,
  money,
  useBrands,
  useBrandsWaiting,
  useOfferCounts,
  type BrandFilters,
  type BudgetBand,
} from '@/lib/admin/useBrands';

const TABS: { value: BrandFilters['active']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Retired' },
  { value: 'all', label: 'All' },
];

const isActiveFilter = (v: string | null): v is BrandFilters['active'] =>
  v === 'active' || v === 'inactive' || v === 'all';

const isBudgetBand = (v: string | null): v is BudgetBand =>
  BUDGET_BANDS.some((b) => b.value === v);

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
  const budgetParam = params.get('budget');
  const filters: BrandFilters = {
    active: isActiveFilter(activeParam) ? activeParam : 'active',
    budget: isBudgetBand(budgetParam) ? budgetParam : 'any',
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
    if (merged.budget !== 'any') p.set('budget', merged.budget);
    if (merged.search) p.set('q', merged.search);
    if (merged.page > 1) p.set('page', String(merged.page));
    setParams(p, { replace: true });
  };

  const { data, isLoading, isError, error, isPlaceholderData } = useBrands(filters);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / BRAND_PAGE_SIZE));

  const brandIds = rows.map((b) => b.id);
  const { data: counts } = useOfferCounts(brandIds);
  const { data: waiting } = useBrandsWaiting(brandIds);

  return (
    <>
      {/* ----------------------------------------------------------- filters */}
      {/*
        NO TITLE ROW HERE ANY MORE. The shell's top bar carries "Brands" as the
        page's <h1> since 2026-08-16, taken from the sidebar's own label, so a
        heading in the body would be the same word said twice. The tagline under
        it went with it: Rashid, plainly, "i don't want to show description of
        that section". Nobody lands here without having chosen Brands from the
        menu, so it was explaining the screen to the one person who already knew.

        The controls are the first thing on the page now, in the shared
        `FilterBar` so this row cannot drift from the one he approved on
        contests. Radius is `rounded-md` on everything in it, height `h-10`: he
        asked for slightly rounded, "do not give it circle look".
      */}
      <FilterBar
        action={
          <Button
            onClick={() => setCreating(true)}
            className="h-10 shrink-0 rounded-md text-[0.875rem]"
          >
            <Plus size={16} aria-hidden />
            Add brand
          </Button>
        }
      >
        <FilterTabs label="Filter brands">
          {TABS.map((t) => (
            <FilterTab
              key={t.value}
              active={filters.active === t.value}
              onClick={() => setFilters({ active: t.value })}
            >
              {t.label}
            </FilterTab>
          ))}
        </FilterTabs>

        <form
          className="min-w-[10rem] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ search: searchDraft });
          }}
        >
          <div className="relative">
            <Search
              size={15}
              aria-hidden
              className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            />
            <Input
              type="search"
              name="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search brands"
              aria-label="Search brands by name"
              className="h-10 rounded-md pl-9 text-[0.875rem]"
            />
          </div>
        </form>

        {/* Budget is a first-class filter, not a detail. "Which brands are
            nearly spent" is the question this list gets asked most.

            The label stays sr-only rather than becoming an aria-label, so the
            control keeps the accessible name it already had. */}
        <label className="sr-only" htmlFor="budget-filter">
          Filter by budget used
        </label>
        <Select
          id="budget-filter"
          name="budget"
          value={filters.budget}
          onChange={(e) => setFilters({ budget: e.target.value as BudgetBand })}
          className="h-10 w-auto min-w-[10rem] shrink-0 rounded-md text-[0.875rem]"
        >
          {BUDGET_BANDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </Select>
      </FilterBar>

      {/* ------------------------------------------------------------- grid */}
      <div
        className={cn(
          'mt-4 transition-opacity duration-200',
          isPlaceholderData && 'opacity-60'
        )}
      >
        {isLoading ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="wx-skeleton h-40 rounded-xl" />
            ))}
          </ul>
        ) : isError ? (
          <div className="bg-surface-1 rounded-xl px-6 py-14 text-center shadow-md">
            <p className="font-semibold">That list would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-surface-1 rounded-xl px-6 py-16 text-center shadow-md">
            <Store size={26} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">
              {filters.search || filters.active !== 'active' || filters.budget !== 'any'
                ? 'No brands match that'
                : 'No brands yet'}
            </p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
              {filters.search || filters.active !== 'active' || filters.budget !== 'any'
                ? 'Try a different search, budget band, or switch to All.'
                : 'Add the first seller store and its hub is ready to fill.'}
            </p>
            {!filters.search && filters.active === 'active' && filters.budget === 'any' ? (
              <Button className="mt-6" onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden />
                Add brand
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((brand) => {
              const c = counts?.[brand.id];
              return (
                <li key={brand.id}>
                  <Link
                    to={`/admin/brands/${brand.id}`}
                    className="bg-surface-1 flex h-full flex-col rounded-xl p-5 shadow-md transition-colors duration-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-lg font-bold">{brand.name}</span>
                        <span className="text-faint mt-0.5 block truncate font-mono text-[0.6875rem]">
                          {brand.store_id}
                        </span>
                      </span>
                      {!brand.is_active ? (
                        <span className="bg-surface-2 text-muted shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
                          Retired
                        </span>
                      ) : null}
                    </div>

                    {brand.client_name ? (
                      <p className="text-muted mt-3 truncate text-[0.8125rem]">
                        {brand.client_name}
                      </p>
                    ) : null}

                    <div className="mt-auto pt-5">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <span>
                          <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                            Budget
                          </span>
                          <span className="wx-numeric mt-1 block text-[0.9375rem] font-semibold">
                            {money(brand.budget_allocated, brand.currency)}
                          </span>
                        </span>
                        <span className="bg-surface-2 text-muted inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem]">
                          <Tag size={12} aria-hidden />
                          <span className="wx-numeric">{c ? c.active : 0}</span> live
                          {c && c.total > c.active ? (
                            <span className="text-faint">of {c.total}</span>
                          ) : null}
                        </span>
                      </div>

                      <div className="mt-3">
                        <BudgetBar brand={brand} />
                      </div>

                      {/*
                        The one number that should decide where an admin clicks.
                        A budget bar says how committed a brand is; it says
                        nothing about whether anybody is standing there waiting
                        for an answer, which was on a different screen entirely.

                        Footer only, no new vertical stack, so the card does not
                        grow taller on a phone.
                      */}
                      {waiting?.[brand.id] ? (
                        <p className="text-stage-due mt-3 text-[0.78125rem] font-medium">
                          {waiting[brand.id]}{' '}
                          {waiting[brand.id] === 1 ? 'creator is' : 'creators are'} waiting on
                          you
                        </p>
                      ) : null}
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
          <p className="wx-numeric text-muted text-[0.8125rem]">
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
            <span className="wx-numeric text-muted px-1 font-mono text-[0.75rem]">
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
    </>
  );
}
