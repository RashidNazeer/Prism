import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldAlert,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { getSupabase } from '@/lib/supabase';
import { useManageContest } from '@/lib/admin/useManageContest';
import type { DeliverableType } from '@/components/work/DeliverableProgress';

/**
 * WHAT WE OWE, AND WHAT WE HAVE PAID.
 *
 * The twin of the claims queue, and the other half of the same job. Confirming
 * a claim is where money becomes owed; this is where it stops being owed. They
 * are separate screens because they are separate sittings: one is checking
 * figures against the seller centre, the other is sending money.
 *
 * A REWARD IS OWED THE MOMENT STAFF CONFIRM THE FIGURE THAT EARNS IT. Rashid,
 * 2026-08-14. Nothing on this screen decides whether somebody earned something:
 * that was decided in the claims queue and written into `contest_awards` in the
 * same transaction. Everything here is about money that is already owed.
 *
 * SO THERE IS NO "AWARD" BUTTON, deliberately, and there must never be one.
 * A reward somebody could grant by hand on this screen would be a reward with no
 * confirmed figure behind it, which is the exact thing the whole claim flow
 * exists to prevent.
 *
 * ONE ROW SHOWS: who, which contest, what they were promised, THE TARGET AND
 * WHAT THEY ACTUALLY REACHED, and the money. The reached figure is frozen on the
 * award, not read live, so a row still says what we paid on even after the
 * creator's totals move again.
 *
 * SUSPENDED ACCOUNTS ARE FLAGGED RATHER THAN HIDDEN. They keep everything they
 * earned; the database refuses to pay one unless somebody says so out loud, so
 * the row says so and the confirm step asks (rule S8).
 *
 * NOT LIVE, the same as the claims queue. Money appearing here is caused by
 * somebody on this team confirming a claim, and that already invalidates this
 * query. A timer covers the case of two admins working at once.
 */

const PAGE_SIZE = 12;

export type RewardsView = 'owed' | 'paid';

/* ------------------------------------------------------------- the shapes -- */

interface RewardRow {
  id: string;
  createdAt: string;
  paidAt: string | null;
  amount: number;
  currency: string;
  reachedValue: number | null;
  message: string | null;
  creatorId: string;
  creatorHandle: string | null;
  creatorName: string | null;
  creatorActive: boolean;
  contestId: string;
  contestName: string | null;
  contestClosed: boolean;
  brandName: string | null;
  termTitle: string | null;
  termType: DeliverableType | null;
  termTarget: number | null;
}

interface Totals {
  owed: number;
  paid: number;
  owedCount: number;
  paidCount: number;
  currency: string;
}

/* --------------------------------------------------------------- the read -- */

/*
 * Several small reads rather than one nested select, the same choice the claims
 * queue makes and for the same reason: these rows live in five tables with five
 * different policies, and a nested select that silently returns nothing for one
 * of them is indistinguishable from a creator who has earned nothing. Every read
 * is bounded by the page.
 */
async function fetchRewards(
  view: RewardsView,
  contestId: string | undefined,
  page: number
): Promise<{ rows: RewardRow[]; total: number }> {
  const sb = getSupabase();
  const from = (page - 1) * PAGE_SIZE;

  let q = sb
    .from('contest_awards')
    .select(
      'id, contest_id, entry_id, creator_id, term_id, awarded_amount, awarded_currency, reached_value, message, created_at, paid_at',
      { count: 'exact' }
    );

  q = view === 'owed' ? q.is('paid_at', null) : q.not('paid_at', 'is', null);
  if (contestId) q = q.eq('contest_id', contestId);

  // Owed: oldest first, because the person waiting longest is why this screen is
  // open. Paid: newest first, because it is a record rather than a queue.
  const { data, error, count } =
    view === 'owed'
      ? await q.order('created_at', { ascending: true }).range(from, from + PAGE_SIZE - 1)
      : await q.order('paid_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);

  if (error) throw error;

  const awards = (data ?? []) as unknown as {
    id: string;
    contest_id: string;
    entry_id: string;
    creator_id: string;
    term_id: string;
    awarded_amount: number | string;
    awarded_currency: string;
    reached_value: number | string | null;
    message: string | null;
    created_at: string;
    paid_at: string | null;
  }[];

  if (awards.length === 0) return { rows: [], total: count ?? 0 };

  const termIds = [...new Set(awards.map((a) => a.term_id))];
  const entryIds = [...new Set(awards.map((a) => a.entry_id))];
  const contestIds = [...new Set(awards.map((a) => a.contest_id))];
  const creatorIds = [...new Set(awards.map((a) => a.creator_id))];

  const [termsRes, entriesRes, contestsRes, profilesRes] = await Promise.all([
    sb.from('contest_entry_terms').select('id, title, type, target_value').in('id', termIds),
    sb
      .from('contest_entries')
      .select('id, creator_handle, creator_name')
      .in('id', entryIds),
    sb.from('contests').select('id, name, brand_id, settled_at, cancelled_at').in('id', contestIds),
    // is_active, because a suspended creator cannot be paid without somebody
    // saying so out loud and the row has to warn before the click, not after.
    sb.from('profiles').select('id, is_active').in('id', creatorIds),
  ]);

  for (const res of [termsRes, entriesRes, contestsRes, profilesRes]) {
    if (res.error) throw res.error;
  }

  const contests = (contestsRes.data ?? []) as unknown as {
    id: string;
    name: string;
    brand_id: string;
    settled_at: string | null;
    cancelled_at: string | null;
  }[];

  const brandsRes = await sb
    .from('brands')
    .select('id, name')
    .in('id', [...new Set(contests.map((c) => c.brand_id))]);
  if (brandsRes.error) throw brandsRes.error;

  const termById = new Map(
    (
      (termsRes.data ?? []) as unknown as {
        id: string;
        title: string;
        type: DeliverableType;
        target_value: number | string;
      }[]
    ).map((t) => [t.id, t])
  );
  const entryById = new Map(
    (
      (entriesRes.data ?? []) as unknown as {
        id: string;
        creator_handle: string | null;
        creator_name: string | null;
      }[]
    ).map((e) => [e.id, e])
  );
  const contestById = new Map(contests.map((c) => [c.id, c]));
  const brandById = new Map(
    ((brandsRes.data ?? []) as unknown as { id: string; name: string }[]).map((b) => [b.id, b])
  );
  const activeById = new Map(
    ((profilesRes.data ?? []) as unknown as { id: string; is_active: boolean }[]).map((p) => [
      p.id,
      p.is_active,
    ])
  );

  const rows: RewardRow[] = awards.map((a) => {
    const term = termById.get(a.term_id);
    const entry = entryById.get(a.entry_id);
    const contest = contestById.get(a.contest_id);
    const brand = contest ? brandById.get(contest.brand_id) : undefined;

    return {
      id: a.id,
      createdAt: a.created_at,
      paidAt: a.paid_at,
      amount: Number(a.awarded_amount),
      currency: a.awarded_currency,
      reachedValue: a.reached_value === null ? null : Number(a.reached_value),
      message: a.message,
      creatorId: a.creator_id,
      creatorHandle: entry?.creator_handle ?? null,
      creatorName: entry?.creator_name ?? null,
      // Absent means we could not read the profile, which for staff means the
      // account is gone. Treated as suspended, which is the cautious way round.
      creatorActive: activeById.get(a.creator_id) ?? false,
      contestId: a.contest_id,
      contestName: contest?.name ?? null,
      contestClosed: Boolean(contest?.settled_at || contest?.cancelled_at),
      brandName: brand?.name ?? null,
      termTitle: term?.title ?? null,
      termType: term?.type ?? null,
      termTarget: term ? Number(term.target_value) : null,
    };
  });

  return { rows, total: count ?? 0 };
}

function useRewards(view: RewardsView, contestId: string | undefined, page: number) {
  return useQuery({
    queryKey: ['admin', 'contest-awards', view, contestId ?? 'all', page],
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: () => fetchRewards(view, contestId, page),
  });
}

/**
 * The money, per currency, from the staff-only rollup rather than from the page.
 *
 * A total computed from twelve visible rows would be a total of this page, which
 * on a screen about what we owe is the one number nobody may get wrong.
 */
function useRewardTotals(contestId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'contest-awards', 'totals', contestId ?? 'all'],
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Totals[]> => {
      let q = getSupabase()
        .from('contest_award_totals')
        .select('currency, owed, paid, awards_owed, awards_paid');
      if (contestId) q = q.eq('contest_id', contestId);

      const { data, error } = await q;
      if (error) throw error;

      // One row per contest AND currency, so several contests in one currency
      // have to be added up before they mean anything.
      const byCurrency = new Map<string, Totals>();
      for (const row of (data ?? []) as unknown as {
        currency: string;
        owed: number | string;
        paid: number | string;
        awards_owed: number;
        awards_paid: number;
      }[]) {
        const at = byCurrency.get(row.currency) ?? {
          owed: 0,
          paid: 0,
          owedCount: 0,
          paidCount: 0,
          currency: row.currency,
        };
        at.owed += Number(row.owed);
        at.paid += Number(row.paid);
        at.owedCount += row.awards_owed;
        at.paidCount += row.awards_paid;
        byCurrency.set(row.currency, at);
      }
      return [...byCurrency.values()].sort((a, b) => b.owed - a.owed);
    },
  });
}

/* --------------------------------------------------------------- helpers -- */

const targetLabel = (type: DeliverableType | null, value: number | null, currency: string) => {
  if (value === null) return null;
  if (type === 'video_count') return `${Math.round(value)} video${value === 1 ? '' : 's'}`;
  return money(value, currency);
};

/** How long this has been owed. Never a deadline, so never a timezone. */
function ago(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/* ----------------------------------------------------------------- queue -- */

export function ContestRewardsQueue({
  contestId,
  view,
  onViewChange,
  className,
}: {
  /** Given, this is one contest's money. Left out, it is every contest's. */
  contestId?: string;
  view: RewardsView;
  onViewChange: (view: RewardsView) => void;
  className?: string;
}) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [serverError, setServerError] = useState('');

  const { data, isPending, isError, error, isPlaceholderData, refetch } = useRewards(
    view,
    contestId,
    page
  );
  const totals = useRewardTotals(contestId);
  const pay = useManageContest();

  // Memoised rather than `data?.rows ?? []`, because that expression is a NEW
  // empty array on every render while the query is in flight, which makes the
  // selection memo below recompute forever.
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = Date.now();

  /*
   * The selection only ever means rows on THIS page. Paging away drops it,
   * because a hidden selection is how somebody pays eleven people believing
   * they paid three.
   */
  const chosen = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const chosenTotalByCurrency = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of chosen) by.set(r.currency, (by.get(r.currency) ?? 0) + r.amount);
    return [...by.entries()];
  }, [chosen]);
  const anySuspended = chosen.some((r) => !r.creatorActive);

  function switchView(next: RewardsView) {
    if (next === view) return;
    setSelected(new Set());
    setConfirming(false);
    setServerError('');
    setPage(1);
    onViewChange(next);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirming(false);
    setServerError('');
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
    setConfirming(false);
    setServerError('');
  }

  async function markPaid() {
    setServerError('');
    try {
      await pay.mutateAsync({
        action: 'award.pay',
        awardIds: chosen.map((r) => r.id),
        message: message.trim() || null,
        // Asked out loud rather than sent by default. The database refuses
        // without it, and the confirm step above says whose account it is.
        allowSuspended: anySuspended,
      });
      setSelected(new Set());
      setConfirming(false);
      setMessage('');
      void totals.refetch();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'That did not go through');
    }
  }

  const busy = pay.isPending;

  return (
    <section className={cn('flex flex-col gap-4', className)}>
      {/* ------------------------------------------------------ the money -- */}
      <div className="grid gap-3 sm:grid-cols-2">
        {totals.isPending ? (
          <>
            <div className="wx-skeleton h-[104px] rounded-xl" />
            <div className="wx-skeleton h-[104px] rounded-xl" />
          </>
        ) : (totals.data ?? []).length === 0 ? (
          <div className="border-line text-muted sm:col-span-2 rounded-xl border border-dashed p-5 text-[0.8125rem] leading-relaxed">
            No contest reward has been earned yet. A reward appears here the moment somebody on
            this team confirms the figures that earn it.
          </div>
        ) : (
          <>
            <MoneyCard
              tone="due"
              label="Owed to creators"
              lines={(totals.data ?? []).map((t) => ({
                amount: money(t.owed, t.currency),
                count: t.owedCount,
              }))}
              hint="Earned and confirmed. Not sent yet."
            />
            <MoneyCard
              tone="paid"
              label="Paid out"
              lines={(totals.data ?? []).map((t) => ({
                amount: money(t.paid, t.currency),
                count: t.paidCount,
              }))}
              hint="Marked paid by somebody on this team."
            />
          </>
        )}
      </div>

      {/* ---------------------------------------------------- the switch -- */}
      <div
        role="tablist"
        aria-label="Which rewards to show"
        className="border-line bg-surface-2 flex w-full max-w-[380px] gap-1 rounded-xl border p-1"
      >
        {(['owed', 'paid'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={view === tab}
            onClick={() => switchView(tab)}
            className={cn(
              'min-h-11 flex-1 rounded-lg px-3 text-[0.8125rem] font-semibold transition-colors duration-200',
              view === tab
                ? 'bg-surface-1 text-text shadow-sm'
                : 'text-muted hover:text-accent'
            )}
          >
            {tab === 'owed' ? 'Owed' : 'Paid'}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------ the list -- */}
      <div className="border-line bg-surface-1 flex flex-col gap-4 rounded-xl border p-4 shadow-md sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {view === 'owed' ? 'Rewards waiting to be paid' : 'Rewards already paid'}
            </h2>
            <p className="text-faint mt-1.5 max-w-prose text-[0.75rem] leading-relaxed">
              {view === 'owed'
                ? 'Every one of these was earned against a figure this team confirmed. Marking one paid cannot be undone.'
                : 'What has gone out, newest first. Each row names the reward it settled.'}
            </p>
          </div>
          {total > 0 ? (
            <span
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-[0.75rem] font-semibold',
                view === 'owed'
                  ? 'bg-stage-due-soft text-stage-due'
                  : 'bg-stage-paid-soft text-stage-paid'
              )}
            >
              <span className="wx-numeric font-mono">{total}</span>{' '}
              {view === 'owed' ? 'waiting' : 'paid'}
            </span>
          ) : null}
        </div>

        {isPending ? (
          <div className="flex flex-col gap-2.5">
            <div className="wx-skeleton h-[92px] rounded-2xl" />
            <div className="wx-skeleton h-[92px] rounded-2xl" />
            <div className="wx-skeleton h-[92px] rounded-2xl" />
          </div>
        ) : isError ? (
          <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
            <h3 className="font-display text-text text-[1.1875rem] leading-tight font-bold">
              That would not load
            </h3>
            <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
              {(error as Error)?.message ??
                'Something went wrong reaching the database. Nothing has been changed.'}
            </p>
            <Button type="button" variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 && total > 0 ? (
          <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
            <h3 className="font-display text-text text-[1.1875rem] leading-tight font-bold">
              This page is empty now
            </h3>
            <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
              The rewards that were on it have been paid. There are still others.
            </p>
            <Button type="button" variant="secondary" onClick={() => setPage(1)}>
              Back to the first page
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState view={view} scoped={Boolean(contestId)} />
        ) : (
          <>
            {view === 'owed' ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="text-muted inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.8125rem] font-medium">
                  <input
                    type="checkbox"
                    className="size-[18px] cursor-pointer accent-[var(--wx-accent)]"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                  />
                  Everything on this page
                </label>
                {selected.size > 0 ? (
                  <span className="text-faint text-[0.75rem]">
                    {selected.size} selected. Paging away clears it.
                  </span>
                ) : null}
              </div>
            ) : null}

            <ul
              className={cn(
                'flex flex-col gap-2.5 transition-opacity duration-200',
                isPlaceholderData && 'opacity-60'
              )}
            >
              {rows.map((row) => (
                <li key={row.id}>
                  <RewardCard
                    row={row}
                    now={now}
                    view={view}
                    showContest={!contestId}
                    selected={selected.has(row.id)}
                    onToggle={() => toggle(row.id)}
                    disabled={busy}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {total > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="wx-numeric text-muted font-mono text-[0.8125rem]">
              {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                disabled={page <= 1}
                onClick={() => {
                  setSelected(new Set());
                  setPage((p) => Math.max(1, p - 1));
                }}
              >
                <ChevronLeft size={15} aria-hidden />
                Back
              </Button>
              <span className="wx-numeric text-muted px-1 font-mono text-[0.75rem]">
                {page} of {pages}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                disabled={page >= pages}
                onClick={() => {
                  setSelected(new Set());
                  setPage((p) => Math.min(pages, p + 1));
                }}
              >
                Next
                <ChevronRight size={15} aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ----------------------------------------------------- the action -- */}
      {view === 'owed' && chosen.length > 0 ? (
        <div className="border-line-strong bg-surface-2 sticky bottom-3 z-10 flex flex-col gap-3 rounded-xl border p-4 shadow-md sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-text text-[0.875rem] font-semibold">
              {chosen.length} reward{chosen.length === 1 ? '' : 's'},{' '}
              <span className="wx-numeric font-mono">
                {chosenTotalByCurrency.map(([c, amount]) => money(amount, c)).join(' + ')}
              </span>
            </p>
            {!confirming ? (
              <div className="flex flex-wrap gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
                <Button type="button" size="sm" className="min-h-11" onClick={() => setConfirming(true)}>
                  <Banknote size={15} aria-hidden />
                  Mark paid
                </Button>
              </div>
            ) : null}
          </div>

          {confirming ? (
            <>
              {anySuspended ? (
                <p
                  role="alert"
                  className="bg-stage-due-soft text-stage-due flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[0.8125rem] leading-relaxed font-medium"
                >
                  <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    One of these belongs to a creator whose account is switched off. They keep
                    everything they earned, but paying them is a decision. Going ahead pays them.
                  </span>
                </p>
              ) : null}

              <Field
                label="Message to the creators"
                hint="They read this on every reward in the list. Optional."
              >
                {({ id, describedBy, invalid }) => (
                  <Textarea
                    id={id}
                    name="reward-message"
                    rows={2}
                    maxLength={500}
                    value={message}
                    disabled={busy}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. Paid on the 14th with the rest of this month's run."
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              {serverError ? (
                <p
                  role="alert"
                  className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-[0.8125rem] font-medium"
                >
                  {serverError}
                </p>
              ) : null}

              <p className="text-muted max-w-prose text-[0.8125rem] leading-relaxed">
                This says the money has been sent. It cannot be undone, and every creator in the
                list sees their reward change to paid straight away.
              </p>

              <div className="flex flex-wrap gap-2.5">
                <Button type="button" disabled={busy} onClick={() => void markPaid()}>
                  {busy ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                  ) : (
                    <BadgeCheck size={16} aria-hidden />
                  )}
                  Yes, mark {chosen.length === 1 ? 'it' : 'them'} paid
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    setServerError('');
                  }}
                >
                  Not yet
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------ money card -- */

function MoneyCard({
  tone,
  label,
  lines,
  hint,
}: {
  tone: 'due' | 'paid';
  label: string;
  lines: { amount: string; count: number }[];
  hint: string;
}) {
  return (
    <div className="border-line bg-surface-1 rounded-xl border p-5 shadow-md">
      <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        {label}
      </span>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {lines.map((line) => (
          <span
            key={line.amount}
            className={cn(
              'wx-numeric font-display text-[1.625rem] leading-none font-bold',
              tone === 'due' ? 'text-stage-due' : 'text-stage-paid'
            )}
          >
            {line.amount}
          </span>
        ))}
      </div>
      <p className="text-faint mt-2 text-[0.75rem] leading-relaxed">
        {lines.reduce((n, l) => n + l.count, 0)} reward
        {lines.reduce((n, l) => n + l.count, 0) === 1 ? '' : 's'}. {hint}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ card -- */

function RewardCard({
  row,
  now,
  view,
  showContest,
  selected,
  onToggle,
  disabled,
}: {
  row: RewardRow;
  now: number;
  view: RewardsView;
  showContest: boolean;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const who = row.creatorHandle ? `@${row.creatorHandle}` : (row.creatorName ?? 'A creator');
  const target = targetLabel(row.termType, row.termTarget, row.currency);
  const reached = targetLabel(row.termType, row.reachedValue, row.currency);

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-text text-[1rem] leading-tight font-bold break-words">
            {who}
          </span>
          {!row.creatorActive ? (
            <span className="bg-stage-due-soft text-stage-due inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
              <ShieldAlert size={12} aria-hidden />
              Account off
            </span>
          ) : null}
          {row.contestClosed ? (
            <span className="bg-surface-3 text-muted rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
              Contest closed
            </span>
          ) : null}
        </div>

        <p className="text-muted mt-1 text-[0.8125rem] break-words">
          {row.termTitle ?? 'A contest reward'}
        </p>

        <p className="text-faint mt-0.5 text-[0.75rem] break-words">
          {showContest
            ? [row.brandName, row.contestName].filter(Boolean).join(', ') || 'A contest'
            : (row.brandName ?? 'This contest')}
        </p>

        {/*
         * The target and what they actually reached, frozen on the award. This
         * is the receipt: it says what we are paying for, and it stays true
         * after the creator's totals move on.
         */}
        {target ? (
          <p className="text-muted mt-2 font-mono text-[0.75rem]">
            Target <span className="text-text font-semibold">{target}</span>
            {reached ? (
              <>
                {' · '}reached <span className="text-stage-paid font-semibold">{reached}</span>
              </>
            ) : null}
          </p>
        ) : null}

        {row.message ? (
          <p className="text-muted mt-2 max-w-prose text-[0.75rem] leading-relaxed italic">
            &ldquo;{row.message}&rdquo;
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <span
          className={cn(
            'wx-numeric font-display text-[1.25rem] leading-none font-bold',
            view === 'owed' ? 'text-stage-due' : 'text-stage-paid'
          )}
        >
          {money(row.amount, row.currency)}
        </span>
        <span className="text-faint font-mono text-[0.6875rem]">
          {view === 'owed'
            ? `owed ${ago(row.createdAt, now)}`
            : row.paidAt
              ? `paid ${ago(row.paidAt, now)}`
              : 'paid'}
        </span>
      </div>
    </>
  );

  // Paid rows are a record, not a queue, so they carry no checkbox and no label
  // wrapper: nothing on them is selectable and a cursor saying otherwise lies.
  if (view === 'paid') {
    return (
      <div className="border-line bg-surface-2 flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4">
        {body}
      </div>
    );
  }

  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-3 rounded-2xl border px-4 py-3.5 transition-colors duration-200 sm:flex-row sm:items-start sm:gap-4',
        selected ? 'border-accent bg-surface-3' : 'border-line bg-surface-2 hover:border-line-strong'
      )}
    >
      <input
        type="checkbox"
        className="mt-1 size-[18px] shrink-0 cursor-pointer accent-[var(--wx-accent)]"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
      />
      {body}
    </label>
  );
}

/* ----------------------------------------------------------------- empty -- */

function EmptyState({ view, scoped }: { view: RewardsView; scoped: boolean }) {
  return (
    <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
      <div className="bg-surface-3 border-line-strong grid size-11 place-items-center rounded-lg border">
        <Trophy size={19} className="text-muted" aria-hidden />
      </div>
      <h3 className="font-display text-text text-[1.1875rem] leading-tight font-bold">
        {view === 'owed' ? 'Nothing is owed right now' : 'Nothing has been paid yet'}
      </h3>
      <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
        {view === 'owed'
          ? scoped
            ? 'Nobody in this contest has crossed a target on figures we have confirmed. A reward lands here the moment somebody does.'
            : 'Every reward that has been earned has been paid. A new one lands here the moment somebody confirms figures that cross a target.'
          : 'Once a reward is marked paid it moves here and stays as the record of it.'}
      </p>
    </div>
  );
}
