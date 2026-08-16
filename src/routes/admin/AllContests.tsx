import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Search, ShieldCheck, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { ContestsHeader } from '@/components/admin/ContestsHeader';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { ContestStateChip } from '@/components/work/ContestStateChip';
import { cn } from '@/lib/utils';
import { formatDeadline, timeLeft } from '@/lib/contest-time';
import { stateOf } from '@/lib/admin/useContests';
import {
  ALL_CONTESTS_PAGE_SIZE,
  DEFAULT_ALL_CONTESTS_FILTERS,
  useAllContestCounts,
  useAllContests,
  useBrandsWithContests,
  useContestPeople,
  type AllContestsFilters,
  type AllContestsRow,
  type AllContestsSort,
  type AllContestsTab,
  type ContestPeople,
} from '@/lib/admin/useAllContests';

/**
 * Every contest, across every brand.
 *
 * It answers one question: what is running right now, and what needs me. Before
 * this existed the only way to reach a contest was to remember which brand it
 * belonged to and go in through that brand's hub, which meant a contest whose
 * deadline had gone could sit unsettled for a week with nobody looking at it.
 *
 * The owner's admin layout rules apply in full: the work starts high, there is
 * no block of summary tiles above it, the page hugs the sidebar, and no id,
 * slug or route is shown anywhere.
 *
 * Every filter lives in the URL, so a view is a link somebody can send.
 */

/*
 * The state chip is `src/components/work/ContestStateChip.tsx`, shared with the
 * brand's own Contests tab and with the creator screen, so one contest cannot
 * wear two colours or two words on two screens. Rule C1 lives there: no stage
 * token on a lifecycle state, because open is not paid and a passed deadline is
 * not money owed to anybody.
 */

const TABS: { value: AllContestsTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
  { value: 'ended', label: 'Ended' },
];

const isTab = (v: string | null): v is AllContestsTab =>
  v === 'all' || v === 'on' || v === 'off' || v === 'ended';

/**
 * The ticking clock rule L5 asks for, on the browser side of it.
 *
 * The queries refetch on their own timer, which is what moves a contest into
 * the Ended pile. This is the other half: without it the chip and the phrase
 * beside it are rendered from the moment the page loaded, so a tab left open
 * would still read "Closes in 2 hours" an hour after the contest shut. Thirty
 * seconds is plenty because the tightest thing it drives is a ceiled minute,
 * and `now` is passed into `stateOf` and `timeLeft` rather than read inside
 * them, which is what makes both testable.
 */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function AllContests() {
  const [params, setParams] = useSearchParams();
  const now = useNow();

  const tabParam = params.get('tab');
  const sortParam = params.get('sort');

  const filters: AllContestsFilters = {
    tab: isTab(tabParam) ? tabParam : DEFAULT_ALL_CONTESTS_FILTERS.tab,
    brandId: params.get('brand') ?? '',
    search: params.get('q') ?? '',
    sort: sortParam === 'newest' ? 'newest' : 'deadline',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
  };

  const [searchDraft, setSearchDraft] = useState(filters.search);
  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  // Filters live in the URL, so a view can be sent to somebody else. Anything
  // still on its default is left out, which keeps the link short and keeps a
  // shared link meaning the same thing if a default ever changes.
  const setFilters = (next: Partial<AllContestsFilters>) => {
    const merged = { ...filters, ...next };
    // Any change other than paging puts you back on page one, or filtering from
    // page 4 lands on an empty page that reads as "nothing matches".
    if (next.page === undefined) merged.page = 1;

    const p = new URLSearchParams();
    if (merged.tab !== DEFAULT_ALL_CONTESTS_FILTERS.tab) p.set('tab', merged.tab);
    if (merged.brandId) p.set('brand', merged.brandId);
    if (merged.search) p.set('q', merged.search);
    if (merged.sort !== DEFAULT_ALL_CONTESTS_FILTERS.sort) p.set('sort', merged.sort);
    if (merged.page > 1) p.set('page', String(merged.page));
    setParams(p, { replace: true });
  };

  const { data, isLoading, isError, error, isPlaceholderData, refetch } =
    useAllContests(filters);
  const { data: counts } = useAllContestCounts(filters.search, filters.brandId);
  const { data: brands } = useBrandsWithContests();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ALL_CONTESTS_PAGE_SIZE));

  const contestIds = rows.map((r) => r.contest.id);
  const { data: people, isPending: peoplePending } = useContestPeople(contestIds);

  const filtering = Boolean(filters.search) || filters.brandId !== '' || filters.tab !== 'all';

  return (
    <>
      <ContestsHeader />

      {/* ------------------------------------------------------ the toolbar -- */}
      {/*
        EVERY FILTER ON ONE LINE, from Rashid's layout note: the four states,
        then search, then the two dropdowns, all in the same row inside one
        panel with a translucent border. The labels those fields used to carry
        are still there for screen readers through aria-label; they are just not
        taking a line each any more.

        The row itself is `FilterBar` now rather than the panel this screen used
        to spell out by hand. This screen is where that component came from, so
        nothing here looks different; what changes is that the other admin
        screens can no longer drift away from it.
      */}
      <FilterBar className="mt-3">
        {/* The four states. Wraps inside the panel on a phone rather than
            pushing the page sideways. */}
        <FilterTabs
          label="Filter contests by state"
          // 44px is the tap target rule in CLAUDE.md and the contests suite
          // asserts it on every control at 375px. `FilterTab` is drawn at the
          // desktop height, so the height comes back here rather than being
          // lost in the move to the shared row.
          className="[&>button]:min-h-[44px]"
        >
          {TABS.map((t) => (
            <FilterTab
              key={t.value}
              active={filters.tab === t.value}
              count={counts?.[t.value]}
              onClick={() => setFilters({ tab: t.value })}
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
              aria-label="Search contests by name or brand"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search contests..."
              className="h-10 rounded-md pl-9 text-[0.875rem]"
            />
          </div>
        </form>

        <Select
          name="brand"
          aria-label="Filter by brand"
          value={filters.brandId}
          onChange={(e) => setFilters({ brandId: e.target.value })}
          className="h-10 w-auto min-w-[8.5rem] shrink-0 rounded-md text-[0.875rem]"
        >
          <option value="">All brands</option>
          {(brands ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>

        <Select
          name="sort"
          aria-label="Order contests"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as AllContestsSort })}
          className="h-10 w-auto min-w-[8.5rem] shrink-0 rounded-md text-[0.875rem]"
        >
          <option value="deadline">Closing soonest</option>
          <option value="newest">Newest first</option>
        </Select>
      </FilterBar>

      {/*
        Ended is a subset of On, and saying so is cheaper than letting somebody
        work out why the four numbers do not add up to the first one.

        This is not the screen's description, which is why it survived the cull
        of those: it only exists while the Ended tab is the one you are on, and
        it sits directly under the tab it is explaining.
      */}
      {filters.tab === 'ended' ? (
        <p className="text-faint mt-2 max-w-prose text-[0.75rem] leading-relaxed">
          Switched on, deadline gone, and nobody has settled or cancelled it yet. These are the
          ones waiting on a person. They are counted under On as well.
        </p>
      ) : null}

      {/* ------------------------------------------------------------ list -- */}
      <div
        className={cn(
          'mt-4 transition-opacity duration-200',
          isPlaceholderData && 'opacity-60'
        )}
      >
        {isLoading ? (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="wx-skeleton h-[196px] rounded-xl" />
            ))}
          </ul>
        ) : isError ? (
          <Panel
            title="That list would not load"
            body={
              (error as Error)?.message ??
              'Something went wrong reaching the database. Nothing has been changed.'
            }
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          filters.tab === 'ended' && !filtering ? (
            <Panel
              title="Nothing is waiting to be settled"
              body="Every contest whose deadline has gone has been settled or cancelled. This pile fills itself the moment one runs out."
            />
          ) : filtering ? (
            <Panel
              title="Nothing matches that"
              body="No contest matches what you are filtering for. Clear the search, pick another brand, or switch tab."
              action={
                <Button
                  variant="secondary"
                  onClick={() => setFilters(DEFAULT_ALL_CONTESTS_FILTERS)}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Panel
              title="No contest has been set up yet"
              body="A contest is an event with a deadline and a prize. They are created inside a brand, and every one of them appears here the moment it exists."
            />
          )
        ) : (
          // Three across on a desktop, two on a tablet, one on a phone, from
          // the design. `items-stretch` is what lets every card's footer line
          // up regardless of how long its title runs.
          <ul className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <li key={row.contest.id} className="flex">
                <ContestRow
                  row={row}
                  now={now}
                  people={people?.[row.contest.id]}
                  peoplePending={peoplePending}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------ pagination -- */}
      {total > ALL_CONTESTS_PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="wx-numeric text-muted font-mono text-[0.8125rem]">
            {(filters.page - 1) * ALL_CONTESTS_PAGE_SIZE + 1} to{' '}
            {Math.min(filters.page * ALL_CONTESTS_PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ page: filters.page - 1 })}
            >
              <ChevronLeft size={15} aria-hidden />
              Back
            </Button>
            <span className="wx-numeric text-muted px-1 font-mono text-[0.75rem]">
              {filters.page} of {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={filters.page >= pages}
              onClick={() => setFilters({ page: filters.page + 1 })}
            >
              Next
              <ChevronRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------- row -- */

function ContestRow({
  row,
  now,
  people,
  peoplePending,
}: {
  row: AllContestsRow;
  now: number;
  people: ContestPeople | undefined;
  peoplePending: boolean;
}) {
  const c = row.contest;
  const state = stateOf(c, now);
  const left = timeLeft(c.expiresAt, now);

  /*
   * REBUILT AS A CARD ON 2026-08-15, from the design Rashid supplied. It was a
   * wide row with four columns of labelled text, which held the same facts and
   * read as a spreadsheet. The design's shape: a brand pill and a status chip
   * on the top line, the name big underneath, then a rule, then the closing
   * date on the left and the entrant count on the right.
   *
   * The glass, the rim light and the gold under-glow on hover are the design's,
   * in Wurx colours, and both themes carry them: see `wx-glass` in global.css.
   */
  return (
    <Link
      to={`/admin/brands/${c.brandId}/contests/${c.id}`}
      className="wx-glass wx-glass-hover group flex h-full flex-col gap-4 rounded-xl p-5"
    >
      {/* --------------------------------------------- brand and status -- */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* The brand is plain text in a pill, not a second link: a link inside
            a link is invalid, and the whole card is already the target. */}
        <span className="bg-surface-2 border-line text-text shrink-0 rounded-full border px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.1em] uppercase">
          {row.brandName ?? 'Unknown brand'}
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!row.brandIsActive ? (
            <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
              Brand retired
            </span>
          ) : null}
          <ContestStateChip state={state} />
        </div>
      </div>

      {/* ------------------------------------------------------ what it is -- */}
      <div>
        <h3 className="font-display text-text group-hover:text-accent text-[1.25rem] leading-tight font-bold break-words transition-colors">
          {c.name}
        </h3>
        <p className="text-muted mt-2 flex items-center gap-2 text-[0.8125rem]">
          <ShieldCheck size={15} aria-hidden className="text-faint shrink-0" />
          {c.needsAdminApproval ? 'You approve entries' : 'Anyone can enter'}
        </p>
      </div>

      {/* --------------------------------- when it closes, and who is in -- */}
      {/*
        `mt-auto` pins this to the bottom, so cards of different title lengths
        line their footers up across the row. That is most of why a grid of
        cards reads as a set rather than as a pile.
      */}
      <div className="border-line mt-auto flex items-end justify-between gap-4 border-t pt-4">
        {/* Always in the zone the admin chose, never the reader's. Rule L6. */}
        <div className="min-w-0">
          <span className="text-faint block text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
            Closing date
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-text text-[0.8125rem] font-semibold">
              {formatDeadline(c.expiresAt, c.expiresAtTimezone)}
            </span>
            <span className="bg-surface-2 text-muted border-line shrink-0 rounded-md border px-2 py-0.5 font-mono text-[0.6875rem]">
              {left}
            </span>
          </span>
        </div>

        {/*
          The number this screen exists for, counted by Postgres in
          `contest_totals` rather than by counting rows in the browser.

          A contest nobody has entered has no row in that view at all, so a
          missing answer is told apart from a real zero: while the read is in
          flight this shows a skeleton, and only once it lands does it say
          nobody is in. Printing 0 early would read as "nobody wanted it".
        */}
        <div className="shrink-0 text-right">
          <span className="text-faint block text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
            Creators
          </span>
          {peoplePending && !people ? (
            <span className="wx-skeleton mt-1.5 ml-auto block h-5 w-16 rounded-md" />
          ) : people && (people.approved > 0 || people.pending > 0) ? (
            <span className="mt-1 flex flex-col items-end gap-1">
              <span className="font-display text-text inline-flex items-center gap-1.5 text-[1.0625rem] font-semibold">
                <span className="wx-numeric font-mono">{people.approved}</span>
                <Users size={15} aria-hidden className="text-accent" />
              </span>
              {people.pending > 0 ? (
                <span className="bg-stage-due-soft text-stage-due inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium">
                  <span className="wx-numeric font-mono">{people.pending}</span> waiting
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted mt-1 block text-[0.8125rem]">Nobody yet</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ----------------------------------------------------------------- panel -- */

function Panel({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-line bg-surface-1 flex flex-col items-start gap-3 rounded-xl border p-6 shadow-md sm:p-8">
      <div className="bg-surface-3 border-line-strong grid size-[44px] place-items-center rounded-lg border">
        <Trophy size={19} className="text-muted" aria-hidden />
      </div>
      <h2 className="font-display text-text text-[1.1875rem] leading-tight font-bold">{title}</h2>
      <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">{body}</p>
      {action}
    </div>
  );
}
