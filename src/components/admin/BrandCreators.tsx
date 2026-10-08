import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Search, Users, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { CreatorFace } from '@/components/work/CreatorFace';
import { useCreatorAvatars } from '@/lib/admin/useCreatorAvatars';
import { money } from '@/lib/money';
import {
  DEFAULT_ROSTER_FILTERS,
  ROSTER_PAGE_SIZE,
  useBrandRoster,
  useRosterCounts,
  type RosterFilters,
  type RosterRow,
  type RosterSort,
  type RosterTab,
} from '@/lib/admin/useBrandRollups';

/**
 * Who is working on this brand.
 *
 * The tab the hub has advertised as coming for weeks. It answers the question
 * an admin actually opens a brand with once it is running: who is on it, where
 * have they got to, what did we promise them, and what have they delivered.
 *
 * PAGED IN THE DATABASE, through the `brand_creator_roster` view. A grouped
 * list cannot be paged in a browser: you would have to fetch every request the
 * brand has ever had to know what page two is, and it would truncate silently
 * rather than error the day that outgrew one read.
 *
 * Everything here is other creators' work, so it is staff surface only. The
 * view carries an `is_staff()` gate in its own body rather than trusting this
 * file to stay on the admin side of the fence.
 */

const TABS: { value: RosterTab; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'on', label: 'On the roster' },
  { value: 'waiting', label: 'Waiting on you' },
  { value: 'declined', label: 'Turned down' },
];

const SORTS: { value: RosterSort; label: string }[] = [
  { value: 'committed', label: 'Most committed' },
  { value: 'delivered', label: 'Most delivered' },
  { value: 'newest', label: 'Newest first' },
];

const isTab = (v: string | null): v is RosterTab =>
  v === 'all' || v === 'on' || v === 'waiting' || v === 'declined';
const isSort = (v: string | null): v is RosterSort =>
  v === 'committed' || v === 'delivered' || v === 'newest';

export function BrandCreators({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [params, setParams] = useSearchParams();

  // Read once, then narrow. A second `params.get` call is a fresh
  // `string | null` as far as TypeScript is concerned, so the guard above it
  // buys nothing.
  const rawTab = params.get('tab');
  const rawSort = params.get('by');

  const filters: RosterFilters = {
    tab: isTab(rawTab) ? rawTab : DEFAULT_ROSTER_FILTERS.tab,
    search: params.get('who') ?? '',
    sort: isSort(rawSort) ? rawSort : DEFAULT_ROSTER_FILTERS.sort,
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  // Keeps `section=creators` in the address bar, so a filter change does not
  // throw you back to the Offers tab.
  const set = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in patch)) p.delete('page');
    setParams(p, { replace: true });
  };

  const { data, isLoading, isError, error } = useBrandRoster(brandId, filters);
  const { data: counts } = useRosterCounts(brandId);

  const rows = data?.rows ?? [];
  // One query and one batch of signed URLs for this brand's page.
  const faces = useCreatorAvatars(rows.map((r) => r.creator_id));
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ROSTER_PAGE_SIZE));
  const filtered = Boolean(filters.search) || filters.tab !== 'all';

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-[0.875rem] leading-relaxed">
          Everyone who has ever asked for one of this brand's offers.
        </p>
      </div>

      {/* ----------------------------------------------------------- tabs -- */}
      <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Filter creators"
          className="bg-surface-2 flex min-w-max gap-1 rounded-xl p-[3px]"
        >
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={filters.tab === t.value}
              onClick={() => set({ tab: t.value === 'all' ? '' : t.value })}
              className={cn(
                'shrink-0 rounded-[9px] px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors duration-200',
                filters.tab === t.value ? 'bg-text text-inverse' : 'text-muted hover:text-text'
              )}
            >
              {t.label}
              {counts && counts[t.value] > 0 ? (
                <span
                  className={cn(
                    'ml-1.5 text-[0.75rem]',
                    filters.tab === t.value ? 'text-inverse/70' : 'text-muted'
                  )}
                >
                  {counts[t.value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* -------------------------------------------------------- filters -- */}
      <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:gap-3">
        <div className="relative min-w-0 flex-1 basis-52">
          <Search
            size={15}
            aria-hidden
            className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
          />
          <input
            type="search"
            name="who"
            defaultValue={filters.search}
            onChange={(e) => set({ who: e.target.value })}
            placeholder="Search by handle, name or email"
            aria-label="Search creators on this brand"
            className="wx-neo-inset placeholder:text-faint focus-visible:ring-accent/50 h-11 w-full rounded-xl pr-3 pl-9 text-[0.8125rem] focus:outline-none focus-visible:ring-2 sm:h-9"
          />
        </div>

        <label className="sr-only" htmlFor="roster-sort">
          Sort
        </label>
        <Select
          id="roster-sort"
          name="by"
          value={filters.sort}
          onChange={(e) => set({ by: e.target.value === 'committed' ? '' : e.target.value })}
          className="h-11 basis-44 text-[0.8125rem] sm:h-9"
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
        <ul className="mt-4 grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-32 rounded-xl" />
          ))}
        </ul>
      ) : isError ? (
        <div className="bg-surface-1 mt-4 rounded-xl px-6 py-14 text-center shadow-md">
          <p className="font-semibold">That roster would not load</p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
            {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-surface-1 mt-4 rounded-xl px-6 py-16 text-center shadow-md">
          <Users size={26} aria-hidden className="text-faint mx-auto" />
          <p className="mt-4 font-semibold">
            {filtered ? 'Nobody matches that' : 'Nobody has asked yet'}
          </p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
            {filtered
              ? 'Try a different search or tab.'
              : `Creators appear here as soon as they ask for one of ${brandName}'s offers. An offer that is open to everyone needs no asking, so it puts nobody in this list.`}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-4 grid gap-3">
            {rows.map((row) => (
              <li key={row.creator_id}>
                <RosterCard row={row} face={faces[row.creator_id]} />
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-muted text-[0.8125rem]">
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
    </section>
  );
}

/* ----------------------------------------------------------------- card -- */

function RosterCard({ row, face }: { row: RosterRow; face: string | undefined }) {
  const who = row.creator_handle ? `@${row.creator_handle}` : (row.creator_name ?? 'A creator');

  /*
   * MONEY IS ONLY PRINTABLE WHEN THERE IS ONE CURRENCY.
   *
   * The view names the currency only when this person's approved money is all
   * in one. Two and it hands back null, and this says so rather than printing a
   * total that added dollars to pounds. Every brand we actually run is single
   * currency, so this is the edge, but it is the edge that would otherwise
   * print a confident wrong number.
   */
  const mixed = row.currency_count > 1 || (row.currency_count === 1 && !row.committed_currency);
  const cur = row.committed_currency ?? 'USD';
  const fmt = (v: string | number) => money(Number(v ?? 0) || 0, cur);

  const cells = [
    { label: 'Agreed', value: row.committed, text: 'text-text' },
    { label: 'Paid', value: row.paid, text: 'text-stage-paid' },
    { label: 'Awaiting payment', value: row.due, text: 'text-stage-due' },
  ];

  return (
    <div className="bg-surface-1 rounded-xl p-4 shadow-md sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <CreatorFace
          src={face}
          name={row.creator_name}
          handle={row.creator_handle}
          size={38}
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1 basis-52">
          <Link
            to={`/admin/creators/${row.creator_id}`}
            className="hover:text-accent font-semibold break-all transition-colors"
          >
            {who}
          </Link>
          {row.creator_name && row.creator_handle ? (
            <p className="text-muted mt-0.5 truncate text-[0.8125rem]">{row.creator_name}</p>
          ) : null}

          <p className="text-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78125rem]">
            <span>
              {row.jobs_approved} on
              {row.jobs_pending > 0 ? `, ${row.jobs_pending} waiting` : ''}
              {row.jobs_rejected > 0 ? `, ${row.jobs_rejected} turned down` : ''}
            </span>
            {row.jobs_approved > 0 ? (
              <span className="text-faint">
                {row.jobs_working} in progress, {row.jobs_due} due, {row.jobs_paid} paid
              </span>
            ) : null}
          </p>
        </div>

        {/* What they have actually delivered, against what was promised. */}
        <div className="shrink-0">
          <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Delivered
          </span>
          <span className="font-display mt-1 flex items-center gap-1.5 text-[1rem] font-semibold">
            <Video size={13} aria-hidden className="text-faint" />
            <span
              className={cn(
                row.videos_promised > 0 && row.videos_approved >= row.videos_promised
                  ? 'text-stage-paid'
                  : 'text-text'
              )}
            >
              {row.videos_approved}
            </span>
            {row.videos_promised > 0 ? (
              <span className="text-faint">/ {row.videos_promised}</span>
            ) : null}
          </span>
          {row.videos_waiting > 0 ? (
            <span className="text-stage-live mt-0.5 block text-[0.75rem]">
              {row.videos_waiting} to watch
            </span>
          ) : null}
        </div>
      </div>

      {row.jobs_approved > 0 ? (
        <div className="border-line mt-3 border-t pt-3">
          {mixed ? (
            <p className="text-muted text-[0.78125rem]">
              This creator has money on this brand in more than one currency, so it is not added
              up here. Open them to see each job.
            </p>
          ) : (
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {cells.map((c) => (
                <div key={c.label}>
                  <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                    {c.label}
                  </dt>
                  <dd
                    className={cn('font-display mt-0.5 text-[0.9375rem] font-semibold', c.text)}
                  >
                    {fmt(c.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : null}
    </div>
  );
}
