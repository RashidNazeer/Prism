import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Plus, Search, Trophy } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { formatDeadline, timeLeft } from '@/lib/contest-time';
import {
  BRAND_CONTESTS_PAGE_SIZE,
  STATE_LABEL,
  stateOf,
  useBrandContestCounts,
  useBrandContests,
  type BrandContestFilters,
  type Contest,
  type ContestState,
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

/** The colour a state earns. Only the three stage tokens say where work has got to. */
const STATE_STYLE: Record<ContestState, string> = {
  open: 'bg-stage-paid-soft text-stage-paid',
  off: 'bg-surface-3 text-muted',
  closed: 'bg-stage-due-soft text-stage-due',
  settled: 'bg-surface-3 text-muted',
  cancelled: 'bg-danger-soft text-danger',
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'On' },
  { key: 'inactive', label: 'Off' },
] as const;

export function BrandContests({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [filters, setFilters] = useState<BrandContestFilters>({
    search: '',
    status: 'all',
    page: 1,
  });

  const { data, isPending, isError } = useBrandContests(brandId, filters);
  const { data: counts } = useBrandContestCounts(brandId);

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
          className="flex rounded-full border border-line p-1"
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
                  'ease-brand min-h-11 rounded-full px-4 text-[13px] font-semibold transition-colors',
                  active ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
                )}
              >
                {t.label}
                {typeof n === 'number' ? (
                  <span className={cn('ml-2 font-mono text-[11px]', active ? 'text-muted' : 'text-faint')}>
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
            <div key={i} className="wx-skeleton h-[104px] rounded-[20px]" />
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
              <ContestRow contest={c} />
            </li>
          ))}
        </ul>
      )}

      {/* ---------------------------------------------------------- page -- */}
      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted text-[13px]">
            {total} contest{total === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              <ChevronLeft size={15} aria-hidden />
              Back
            </Button>
            <span className="text-muted font-mono text-[12px]">
              {filters.page} of {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
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

function ContestRow({ contest }: { contest: Contest }) {
  const state = stateOf(contest);
  const left = timeLeft(contest.expiresAt);

  return (
    <Link
      to={`/admin/brands/${contest.brandId}/contests/${contest.id}`}
      className="ease-brand border-line bg-surface-1 hover:border-line-strong block rounded-[20px] border p-5 shadow-md transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', STATE_STYLE[state])}>
              {STATE_LABEL[state]}
            </span>
            <span className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
              {contest.needsAdminApproval ? 'You approve entries' : 'Anyone can enter'}
            </span>
          </div>

          <h3 className="font-display text-text mt-2 truncate text-[19px] leading-tight font-bold">
            {contest.name}
          </h3>

          {contest.judgingBasis ? (
            <p className="text-muted mt-1 line-clamp-1 text-[13px]">{contest.judgingBasis}</p>
          ) : null}
        </div>

        <div className="text-right">
          <p className="text-text text-[13px] font-semibold">
            {formatDeadline(contest.expiresAt, contest.expiresAtTimezone)}
          </p>
          <p className="text-muted mt-0.5 font-mono text-[12px]">{left}</p>
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
    <div className="border-line bg-surface-1 flex flex-col items-start gap-3 rounded-[20px] border p-8 shadow-md">
      <div className="bg-surface-3 border-line-strong grid size-11 place-items-center rounded-[14px] border">
        <Trophy size={19} className="text-muted" aria-hidden />
      </div>
      <h3 className="font-display text-text text-[21px] leading-tight font-bold">{title}</h3>
      <p className="text-muted max-w-prose text-[14px] leading-relaxed">{body}</p>
      {action}
    </div>
  );
}
