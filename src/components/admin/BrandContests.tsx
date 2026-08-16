import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Plus, Search, Trophy } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ContestStateChip } from '@/components/work/ContestStateChip';
import { cn } from '@/lib/utils';
import { formatDeadline, timeLeft } from '@/lib/contest-time';
import {
  BRAND_CONTESTS_PAGE_SIZE,
  stateOf,
  useBrandContestCounts,
  useBrandContests,
  type BrandContestFilters,
  type Contest,
} from '@/lib/admin/useContests';

/**
 * The Contests tab inside a brand.
 *
 * A list, and a way to make a new one. The setup form is its own full screen
 * rather than a dialog, ruled 2026-08-13: a contest carries a dozen fields plus
 * three lists inside it, which is past what a dialog can hold honestly.
 *
 * Sorted by which deadline runs out first, because that is what somebody opened
 * this tab to deal with.
 */

/*
 * The chip, its words and its colours all live in
 * `src/components/work/ContestStateChip.tsx`, shared with the cross brand list
 * and with the creator's own screen. Rule C1 is enforced there in one place
 * rather than in three private copies of the same map.
 */

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'On' },
  { key: 'inactive', label: 'Off' },
] as const;

/**
 * The ticking clock rule L5 asks for.
 *
 * Expiry writes no row, so it fires no realtime event and no query
 * invalidation: a tab left open across a deadline would otherwise still be
 * showing "Closes in 2 hours" and a green chip an hour after the contest shut.
 * Thirty seconds is fine because the tightest thing this drives is a ceiled
 * minute. `now` is then passed into both `stateOf` and `timeLeft` rather than
 * read inside them, which is also what makes both testable (rule L15).
 */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function BrandContests({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [filters, setFilters] = useState<BrandContestFilters>({
    search: '',
    status: 'all',
    page: 1,
  });

  const now = useNow();
  const { data, isPending, isError } = useBrandContests(brandId, filters);
  const { data: counts } = useBrandContestCounts(brandId, filters.search);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / BRAND_CONTESTS_PAGE_SIZE));
  const countFor = (k: (typeof TABS)[number]['key']) =>
    k === 'all' ? counts?.all : k === 'active' ? counts?.active : counts?.inactive;

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------------------------------- controls -- */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="border-line flex rounded-full border p-1"
          role="tablist"
          aria-label="Filter contests"
        >
          {TABS.map((t) => {
            const active = filters.status === t.key;
            const n = countFor(t.key);
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilters((f) => ({ ...f, status: t.key, page: 1 }))}
                className={cn(
                  'ease-brand min-h-[44px] rounded-full px-4 text-[0.8125rem] font-semibold transition-colors',
                  active ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
                )}
              >
                {t.label}
                {typeof n === 'number' ? (
                  <span
                    className={cn(
                      'ml-2 font-mono text-[0.6875rem]',
                      active ? 'text-muted' : 'text-faint'
                    )}
                  >
                    {n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
            placeholder="Search contests"
            aria-label="Search contests"
            className="pl-9"
          />
        </div>

        <ButtonLink to={`/admin/brands/${brandId}/contests/new`} size="md">
          <Plus size={16} aria-hidden />
          New contest
        </ButtonLink>
      </div>

      {/* ---------------------------------------------------------- rows -- */}
      {isPending ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="wx-skeleton h-[104px] rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Empty
          title="That did not load"
          body="Something went wrong reading this brand's contests. Refreshing usually sorts it."
        />
      ) : rows.length === 0 ? (
        filters.search || filters.status !== 'all' ? (
          <Empty
            title="Nothing matches that"
            body="No contest here matches what you are filtering for. Clear the search or switch tab."
          />
        ) : (
          <Empty
            title={`${brandName} has never run a contest`}
            body="A contest is an event with a deadline and a prize. Set one up and it appears here, and to every creator who works with this brand once you switch it on."
            action={
              <ButtonLink to={`/admin/brands/${brandId}/contests/new`}>
                <Plus size={16} aria-hidden />
                Set one up
              </ButtonLink>
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((c) => (
            <li key={c.id}>
              <ContestRow contest={c} now={now} />
            </li>
          ))}
        </ul>
      )}

      {/* ---------------------------------------------------------- page -- */}
      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted text-[0.8125rem]">
            {total} contest{total === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              <ChevronLeft size={15} aria-hidden />
              Back
            </Button>
            <span className="text-muted font-mono text-[0.75rem]">
              {filters.page} of {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={filters.page >= pages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next
              <ChevronRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContestRow({ contest, now }: { contest: Contest; now: number }) {
  const state = stateOf(contest, now);
  const left = timeLeft(contest.expiresAt, now);

  return (
    <Link
      to={`/admin/brands/${contest.brandId}/contests/${contest.id}`}
      className="ease-brand border-line bg-surface-1 hover:border-line-strong block rounded-xl border p-5 shadow-md transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ContestStateChip state={state} />
            <span className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {contest.needsAdminApproval ? 'You approve entries' : 'Anyone can enter'}
            </span>
          </div>

          <h3 className="font-display text-text mt-2 truncate text-[1.1875rem] leading-tight font-bold">
            {contest.name}
          </h3>

          {/*
            "How it is judged" used to sit here. It is gone with the placings:
            what a contest asks for is now a list of deliverables, each with a
            target and what reaching it pays, and those are read on the contest
            itself rather than summarised in a sentence on a list row.
          */}
          {contest.description ? (
            <p className="text-muted mt-1 line-clamp-1 text-[0.8125rem]">{contest.description}</p>
          ) : null}
        </div>

        <div className="text-right">
          <p className="text-text text-[0.8125rem] font-semibold">
            {formatDeadline(contest.expiresAt, contest.expiresAtTimezone)}
          </p>
          <p className="text-muted mt-0.5 font-mono text-[0.75rem]">{left}</p>
        </div>
      </div>
    </Link>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-line bg-surface-1 flex flex-col items-start gap-3 rounded-xl border p-8 shadow-md">
      <div className="bg-surface-3 border-line-strong grid size-[44px] place-items-center rounded-lg border">
        <Trophy size={19} className="text-muted" aria-hidden />
      </div>
      <h3 className="font-display text-text text-[1.3125rem] leading-tight font-bold">{title}</h3>
      <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">{body}</p>
      {action}
    </div>
  );
}
