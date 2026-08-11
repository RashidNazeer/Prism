import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Search, Users, Video } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { money } from '@/lib/money';
import { TIER_LABEL } from '@/lib/tiers';
import {
  CREATOR_PAGE_SIZE,
  DEFAULT_CREATOR_FILTERS,
  useCreators,
  useCreatorWork,
  type CreatorFilters,
  type CreatorRow,
  type CreatorSort,
  type CreatorWork,
} from '@/lib/admin/useCreators';

/**
 * Every creator, as people.
 *
 * There was a screen for applications, brands, offers, requests, videos and
 * activity, and none for a person. The closest thing was the form they filled
 * in once, which stops dead at the approval, so answering "what is going on
 * with this creator" meant searching four screens and holding it in your head.
 *
 * The list is paged and searched IN THE DATABASE through `creator_directory`,
 * which exists because a person's identity is spread over two tables: the
 * account on `profiles`, and the handle everybody actually uses on
 * `applications`.
 */

const SORTS: { value: CreatorSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'By name' },
  { value: 'tier', label: 'By tier' },
];

const isSort = (v: string | null): v is CreatorSort =>
  v === 'newest' || v === 'name' || v === 'tier';
const isActive = (v: string | null): v is CreatorFilters['active'] =>
  v === 'all' || v === 'active' || v === 'suspended';

export function Creators() {
  const [params, setParams] = useSearchParams();

  const rawSort = params.get('sort');
  const rawActive = params.get('show');
  const filters: CreatorFilters = {
    search: params.get('q') ?? '',
    sort: isSort(rawSort) ? rawSort : DEFAULT_CREATOR_FILTERS.sort,
    active: isActive(rawActive) ? rawActive : DEFAULT_CREATOR_FILTERS.active,
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  const set = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in patch)) p.delete('page');
    setParams(p, { replace: true });
  };

  const { data, isLoading, isError, error } = useCreators(filters);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / CREATOR_PAGE_SIZE));

  // Two grouped reads over the people on this page, never one pair per row.
  const { data: work } = useCreatorWork(rows.map((r) => r.id));
  const filtered = Boolean(filters.search) || filters.active !== 'all';

  return (
    <AppShell>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-[clamp(1.4rem,3.5vw,1.9rem)] font-semibold tracking-[-0.015em]">
          Creators
        </h1>
        <p className="text-muted text-[14px]">
          {total > 0 ? `${total} on the roster` : 'Everybody approved to work with us.'}
        </p>
      </div>

      {/* -------------------------------------------------------- filters -- */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:gap-3">
        <div className="relative min-w-0 flex-1 basis-52">
          <Search
            size={15}
            aria-hidden
            className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
          />
          <input
            type="search"
            name="q"
            defaultValue={filters.search}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search by handle, name or email"
            aria-label="Search creators"
            className="border-line-interactive bg-surface-1 placeholder:text-faint hover:border-accent/60 focus:border-accent h-9 w-full rounded-xl border pr-3 pl-9 text-[13px] focus:outline-none"
          />
        </div>

        <label className="sr-only" htmlFor="creator-show">
          Show
        </label>
        <Select
          id="creator-show"
          name="show"
          value={filters.active}
          onChange={(e) => set({ show: e.target.value === 'all' ? '' : e.target.value })}
          className="h-9 basis-40 text-[13px]"
        >
          <option value="all">Everyone</option>
          <option value="active">Active only</option>
          <option value="suspended">Suspended</option>
        </Select>

        <label className="sr-only" htmlFor="creator-sort">
          Sort
        </label>
        <Select
          id="creator-sort"
          name="sort"
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value === 'newest' ? '' : e.target.value })}
          className="h-9 basis-40 text-[13px]"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {/* ----------------------------------------------------------- list -- */}
      {isLoading ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-36 rounded-[20px]" />
          ))}
        </ul>
      ) : isError ? (
        <div className="border-line bg-surface-1 mt-4 rounded-[20px] border px-6 py-14 text-center shadow-md">
          <p className="font-semibold">That list would not load</p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
            {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="border-line bg-surface-1 mt-4 rounded-[20px] border px-6 py-16 text-center shadow-md">
          <Users size={26} aria-hidden className="text-faint mx-auto" />
          <p className="mt-4 font-semibold">
            {filtered ? 'Nobody matches that' : 'No creators yet'}
          </p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
            {filtered
              ? 'Try a different search or filter.'
              : 'People appear here the moment an application is approved.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <li key={row.id}>
                <CreatorCard row={row} work={work?.get(row.id)} />
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-muted text-[13px]">
                Page {filters.page} of {pages}, {total} in total
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() => set({ page: String(filters.page - 1) })}
                >
                  <ChevronLeft size={15} aria-hidden />
                  Back
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page >= pages}
                  onClick={() => set({ page: String(filters.page + 1) })}
                >
                  Next
                  <ChevronRight size={15} aria-hidden />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

/* ----------------------------------------------------------------- card -- */

function CreatorCard({ row, work }: { row: CreatorRow; work: CreatorWork | undefined }) {
  const who = row.tiktok_handle ? `@${row.tiktok_handle}` : (row.display_name ?? 'A creator');
  const mixed = (work?.currencies ?? 0) > 1;

  return (
    <Link
      to={`/admin/creators/${row.id}`}
      className="border-line bg-surface-1 hover:border-accent/60 flex h-full flex-col rounded-[20px] border p-4 shadow-md transition-colors sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold break-all">{who}</p>
        {row.tier ? (
          <span className="bg-accent-soft text-accent rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase">
            {TIER_LABEL[row.tier]}
          </span>
        ) : null}
        {!row.is_active ? (
          <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase">
            Suspended
          </span>
        ) : null}
      </div>

      {row.display_name && row.tiktok_handle ? (
        <p className="text-muted mt-0.5 truncate text-[13px]">{row.display_name}</p>
      ) : null}

      <div className="border-line mt-3 flex flex-wrap items-end gap-x-5 gap-y-2 border-t pt-3">
        <span>
          <span className="text-muted block text-[11px] font-semibold tracking-[0.14em] uppercase">
            Agreed
          </span>
          <span className="font-display mt-0.5 block text-[16px] font-semibold">
            {work === undefined
              ? '...'
              : mixed
                ? 'Mixed'
                : money(work.committed, work.currency ?? 'USD')}
          </span>
        </span>
        <span>
          <span className="text-muted block text-[11px] font-semibold tracking-[0.14em] uppercase">
            Paid
          </span>
          <span className="font-display text-stage-paid mt-0.5 block text-[16px] font-semibold">
            {work === undefined
              ? '...'
              : mixed
                ? 'Mixed'
                : money(work.paid, work.currency ?? 'USD')}
          </span>
        </span>
        <span className="text-muted flex items-center gap-1.5 text-[12.5px]">
          <Video size={13} aria-hidden className="text-faint" />
          {work?.videosApproved ?? 0} approved
        </span>
      </div>

      <p className="text-faint mt-2 text-[12.5px]">
        {work
          ? `${work.approved} ${work.approved === 1 ? 'job' : 'jobs'} across ${work.brands} ${work.brands === 1 ? 'brand' : 'brands'}`
          : 'Loading their work'}
        {work && work.pending > 0 ? `, ${work.pending} waiting on you` : ''}
      </p>
    </Link>
  );
}
