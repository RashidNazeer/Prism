import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Search, ShieldCheck, Trophy, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
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
    <AppShell>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-[clamp(1.4rem,3.5vw,1.9rem)] font-extrabold">
          Contests
        </h1>
        <p className="text-muted text-[14px]">
          Every contest we run, across every brand, soonest deadline first.
        </p>
      </div>

      {/* ------------------------------------------------------------ tabs -- */}
      {/* Scrolls inside its own container on a phone. The page itself never
          scrolls sideways at any width. */}
      <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Filter contests"
          className="border-line bg-surface-1 inline-flex min-w-max rounded-xl border p-1"
        >
          {TABS.map((t) => {
            const n = counts?.[t.value];
            const active = filters.tab === t.value;
            return (
              <button
                key={t.value}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setFilters({ tab: t.value })}
                className={cn(
                  'ease-brand min-h-11 shrink-0 rounded-lg px-3.5 text-[13px] font-medium transition-colors duration-200',
                  active ? 'bg-accent text-on-accent' : 'text-muted hover:text-accent'
                )}
              >
                {t.label}
                {typeof n === 'number' ? (
                  <span
                    className={cn(
                      'wx-numeric ml-1.5 font-mono text-[12px]',
                      active ? 'text-on-accent/80' : 'text-faint'
                    )}
                  >
                    {n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ended is a subset of On, and saying so is cheaper than letting somebody
          work out why the four numbers do not add up to the first one. */}
      {filters.tab === 'ended' ? (
        <p className="text-faint mt-2 max-w-prose text-[12px] leading-relaxed">
          Switched on, deadline gone, and nobody has settled or cancelled it yet. These are the
          ones waiting on a person. They are counted under On as well.
        </p>
      ) : null}

      {/* --------------------------------------------------------- filters -- */}
      {/* One glass panel holding all three, from the design, rather than three
          controls floating on the page. It reads as a toolbar, which is what it
          is. */}
      <div className="wx-glass-panel mt-3 grid gap-3 rounded-xl p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_15rem_13rem]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ search: searchDraft });
          }}
        >
          <Field label="Search" hint="Contest name or brand name. Press enter.">
            {({ id, describedBy, invalid }) => (
              <div className="relative">
                <Search
                  size={15}
                  aria-hidden
                  className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
                />
                <Input
                  id={id}
                  type="search"
                  name="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="e.g. Back to school, or Lumi"
                  className="pl-9"
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              </div>
            )}
          </Field>
        </form>

        <Field label="Brand">
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="brand"
              value={filters.brandId}
              onChange={(e) => setFilters({ brandId: e.target.value })}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              <option value="">All brands</option>
              {(brands ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Order">
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="sort"
              value={filters.sort}
              onChange={(e) => setFilters({ sort: e.target.value as AllContestsSort })}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              <option value="deadline">Closing soonest</option>
              <option value="newest">Newest first</option>
            </Select>
          )}
        </Field>
      </div>

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
              <li key={i} className="wx-skeleton h-[196px] rounded-[20px]" />
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
          <p className="wx-numeric text-muted font-mono text-[13px]">
            {(filters.page - 1) * ALL_CONTESTS_PAGE_SIZE + 1} to{' '}
            {Math.min(filters.page * ALL_CONTESTS_PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ page: filters.page - 1 })}
            >
              <ChevronLeft size={15} aria-hidden />
              Back
            </Button>
            <span className="wx-numeric text-muted px-1 font-mono text-[12px]">
              {filters.page} of {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              disabled={filters.page >= pages}
              onClick={() => setFilters({ page: filters.page + 1 })}
            >
              Next
              <ChevronRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
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
      className="wx-glass wx-glass-hover group flex h-full flex-col gap-4 rounded-[20px] p-5"
    >
      {/* --------------------------------------------- brand and status -- */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* The brand is plain text in a pill, not a second link: a link inside
            a link is invalid, and the whole card is already the target. */}
        <span className="bg-surface-2 border-line text-text shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.1em] uppercase">
          {row.brandName ?? 'Unknown brand'}
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!row.brandIsActive ? (
            <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase">
              Brand retired
            </span>
          ) : null}
          <ContestStateChip state={state} />
        </div>
      </div>

      {/* ------------------------------------------------------ what it is -- */}
      <div>
        <h3 className="font-display text-text group-hover:text-accent text-[20px] leading-tight font-bold break-words transition-colors">
          {c.name}
        </h3>
        <p className="text-muted mt-2 flex items-center gap-2 text-[13px]">
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
          <span className="text-faint block text-[10px] font-semibold tracking-[0.14em] uppercase">
            Closing date
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-text text-[13px] font-semibold">
              {formatDeadline(c.expiresAt, c.expiresAtTimezone)}
            </span>
            <span className="bg-surface-2 text-muted border-line shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px]">
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
          <span className="text-faint block text-[10px] font-semibold tracking-[0.14em] uppercase">
            Creators
          </span>
          {peoplePending && !people ? (
            <span className="wx-skeleton mt-1.5 ml-auto block h-5 w-16 rounded-md" />
          ) : people && (people.approved > 0 || people.pending > 0) ? (
            <span className="mt-1 flex flex-col items-end gap-1">
              <span className="font-display text-text inline-flex items-center gap-1.5 text-[17px] font-semibold">
                <span className="wx-numeric font-mono">{people.approved}</span>
                <Users size={15} aria-hidden className="text-accent" />
              </span>
              {people.pending > 0 ? (
                <span className="bg-stage-due-soft text-stage-due inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                  <span className="wx-numeric font-mono">{people.pending}</span> waiting
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted mt-1 block text-[13px]">Nobody yet</span>
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
    <div className="border-line bg-surface-1 flex flex-col items-start gap-3 rounded-[20px] border p-6 shadow-md sm:p-8">
      <div className="bg-surface-3 border-line-strong grid size-11 place-items-center rounded-[14px] border">
        <Trophy size={19} className="text-muted" aria-hidden />
      </div>
      <h2 className="font-display text-text text-[19px] leading-tight font-bold">{title}</h2>
      <p className="text-muted max-w-prose text-[14px] leading-relaxed">{body}</p>
      {action}
    </div>
  );
}
