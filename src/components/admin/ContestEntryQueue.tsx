import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, DoorOpen, Loader2, ShieldMinus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase';
import { useAdminContestsLive } from '@/lib/admin/useContests';
import { useManageContest } from '@/lib/admin/useManageContest';

/**
 * WHO IS WAITING TO BE LET INTO A CONTEST.
 *
 * THIS SCREEN DID NOT EXIST UNTIL 2026-08-15 AND THE FEATURE WAS BROKEN WITHOUT
 * IT. `review_contest_entry` shipped with the first contest migration and had
 * no caller but the seed script, so on a contest with "we approve entries" on,
 * a creator applied, saw "With the team", and waited for ever. Rashid found it
 * by hand. The contests suite walked past it because it sets its own contest to
 * auto-approve.
 *
 * IT LIVES ON THE CLAIMS SCREEN, ABOVE THE PROGRESS CLAIMS, because that is
 * where he looked for it. Both are "somebody is waiting on us"; they are just
 * waiting for different things, so they are two sections rather than two
 * screens.
 *
 * IT IS LIVE, and that is the other half of the same bug report. `contest_entries`
 * has been in the realtime publication since the feature shipped and no ADMIN
 * screen ever subscribed, so an application landing, or a creator withdrawing,
 * changed nothing in front of whoever was looking at it. Withdrawals matter as
 * much as arrivals here: answering a request somebody has already pulled is a
 * wasted decision and an odd email.
 */

const PAGE_SIZE = 8;

interface EntryRow {
  id: string;
  contestId: string;
  createdAt: string;
  note: string | null;
  creatorHandle: string | null;
  creatorName: string | null;
  contestName: string | null;
  brandName: string | null;
  /** How many times this person has been in and out of this contest before. */
  earlierTries: number;
}

async function fetchEntries(
  contestId: string | undefined,
  page: number
): Promise<{ rows: EntryRow[]; total: number }> {
  const sb = getSupabase();
  const from = (page - 1) * PAGE_SIZE;

  let q = sb
    .from('contest_entries')
    .select('id, contest_id, creator_id, creator_handle, creator_name, note, created_at', {
      count: 'exact',
    })
    .eq('status', 'pending');

  if (contestId) q = q.eq('contest_id', contestId);

  // Oldest first. The person who has been waiting longest is why this is open.
  const { data, error, count } = await q
    .order('created_at', { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw error;

  const entries = (data ?? []) as unknown as {
    id: string;
    contest_id: string;
    creator_id: string;
    creator_handle: string | null;
    creator_name: string | null;
    note: string | null;
    created_at: string;
  }[];

  if (entries.length === 0) return { rows: [], total: count ?? 0 };

  const contestIds = [...new Set(entries.map((e) => e.contest_id))];

  /*
   * EVERY EARLIER ENTRY THESE PEOPLE HAVE HAD ON THESE CONTESTS, so a repeat
   * application says so. Rashid hit exactly this: enter, withdraw, enter again.
   * A second request that looks identical to a first one is how somebody gets
   * approved twice or refused for a reason that no longer applies.
   */
  const [contestsRes, historyRes] = await Promise.all([
    sb.from('contests').select('id, name, brand_id').in('id', contestIds),
    sb
      .from('contest_entries')
      .select('creator_id, contest_id, status')
      .in('contest_id', contestIds)
      .in('creator_id', [...new Set(entries.map((e) => e.creator_id))])
      .neq('status', 'pending')
      .limit(500),
  ]);
  if (contestsRes.error) throw contestsRes.error;
  if (historyRes.error) throw historyRes.error;

  const contests = (contestsRes.data ?? []) as unknown as {
    id: string;
    name: string;
    brand_id: string;
  }[];

  const brandsRes = await sb
    .from('brands')
    .select('id, name')
    .in('id', [...new Set(contests.map((c) => c.brand_id))]);
  if (brandsRes.error) throw brandsRes.error;

  const contestById = new Map(contests.map((c) => [c.id, c]));
  const brandById = new Map(
    ((brandsRes.data ?? []) as unknown as { id: string; name: string }[]).map((b) => [b.id, b])
  );

  const tries = new Map<string, number>();
  for (const h of (historyRes.data ?? []) as unknown as {
    creator_id: string;
    contest_id: string;
  }[]) {
    const key = `${h.creator_id}:${h.contest_id}`;
    tries.set(key, (tries.get(key) ?? 0) + 1);
  }

  const rows: EntryRow[] = entries.map((e) => {
    const contest = contestById.get(e.contest_id);
    const brand = contest ? brandById.get(contest.brand_id) : undefined;
    return {
      id: e.id,
      contestId: e.contest_id,
      createdAt: e.created_at,
      note: e.note,
      creatorHandle: e.creator_handle,
      creatorName: e.creator_name,
      contestName: contest?.name ?? null,
      brandName: brand?.name ?? null,
      earlierTries: tries.get(`${e.creator_id}:${e.contest_id}`) ?? 0,
    };
  });

  return { rows, total: count ?? 0 };
}

function useEntryQueue(contestId: string | undefined, page: number) {
  /*
   * LIVE, unlike the progress claims beside it, and the difference is not an
   * inconsistency. `contest_progress_updates` is deliberately outside the
   * realtime publication because a creator's claimed GMV would broadcast on a
   * DELETE. `contest_entries` has always been IN it, and no admin screen ever
   * listened, which is the second half of the bug this component fixes.
   *
   * Through the SHARED admin contest channel rather than one of its own, so a
   * screen showing this queue and a contest list beside it holds one
   * subscription rather than two over the same table.
   */
  useAdminContestsLive();

  return useQuery({
    queryKey: ['admin', 'contest-entries', contestId ?? 'all', page],
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    queryFn: () => fetchEntries(contestId, page),
  });
}

/** How long they have been waiting. Never a deadline, so never a timezone. */
function waitingFor(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? '' : 's'} ago`;
}

export function ContestEntryQueue({
  contestId,
  className,
}: {
  /** Given, this is one contest's queue. Left out, it is every contest's. */
  contestId?: string;
  className?: string;
}) {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, isPlaceholderData, refetch } = useEntryQueue(
    contestId,
    page
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const now = Date.now();

  return (
    <section
      className={cn('bg-surface-1 flex flex-col gap-4 rounded-xl p-5 shadow-md', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Waiting to be let in
          </h2>
          <p className="text-faint mt-1.5 max-w-prose text-[0.75rem] leading-relaxed">
            Creators who have asked to join a contest that you approve entries for. Until you
            answer, they are sitting on "With the team" and nothing about their contest moves.
          </p>
        </div>

        {total > 0 ? (
          <span className="bg-stage-live-soft text-stage-live shrink-0 rounded-full px-3 py-1 text-[0.75rem] font-semibold">
            <span className="wx-numeric font-mono">{total}</span> waiting
          </span>
        ) : null}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2.5">
          <div className="wx-skeleton h-[120px] rounded-2xl" />
          <div className="wx-skeleton h-[120px] rounded-2xl" />
        </div>
      ) : isError ? (
        <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <h3 className="font-display text-text text-[1.1875rem] leading-tight font-bold">
            That queue would not load
          </h3>
          <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
            {(error as Error)?.message ?? 'Something went wrong. Nothing has been changed.'}
          </p>
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <div className="wx-neo-inset grid size-[44px] place-items-center rounded-lg">
            <DoorOpen size={19} className="text-muted" aria-hidden />
          </div>
          <h3 className="font-display text-text text-[1.1875rem] leading-tight font-bold">
            Nobody is waiting to get in
          </h3>
          <p className="text-muted text=[14px] max-w-prose text-[0.875rem] leading-relaxed">
            {contestId
              ? 'Nobody has asked to join this contest and been left waiting. A request lands here the moment somebody applies.'
              : 'No creator is waiting on a decision about joining a contest. Contests that let people in automatically never appear here.'}
          </p>
        </div>
      ) : (
        <ul
          className={cn(
            'flex flex-col gap-2.5 transition-opacity duration-200',
            isPlaceholderData && 'opacity-60'
          )}
        >
          {rows.map((row) => (
            <li key={row.id}>
              <EntryCard row={row} now={now} showContest={!contestId} />
            </li>
          ))}
        </ul>
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
              className="min-h-[44px]"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EntryCard({
  row,
  now,
  showContest,
}: {
  row: EntryRow;
  now: number;
  showContest: boolean;
}) {
  const review = useManageContest();
  const [note, setNote] = useState('');
  const [block, setBlock] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [serverError, setServerError] = useState('');

  const busy = review.isPending;
  const who = row.creatorHandle ? `@${row.creatorHandle}` : (row.creatorName ?? 'A creator');

  async function decide(decision: 'approved' | 'rejected') {
    setServerError('');
    try {
      await review.mutateAsync({
        action: 'entry.review',
        entryId: row.id,
        decision,
        // The creator reads this one.
        note: note.trim() || null,
        block: decision === 'rejected' && block,
        // And nobody outside the team reads this one.
        blockReason: decision === 'rejected' && block ? blockReason.trim() || null : null,
      });
      // A decided entry leaves the queue on the refetch this triggers.
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'That decision did not go through');
    }
  }

  return (
    <article className="wx-neo-inset rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-display text-text text-[1rem] leading-tight font-bold break-words">
              {who}
            </h3>
            {/*
              A repeat application says so. Enter, withdraw, enter again is a
              real path a creator can walk, and a second request that looks
              exactly like a first one is how it gets answered on stale reasons.
            */}
            {row.earlierTries > 0 ? (
              <span className="bg-stage-due-soft text-stage-due rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
                Asked before
              </span>
            ) : null}
          </div>
          {row.creatorHandle && row.creatorName ? (
            <p className="text-muted mt-1 text-[0.8125rem] break-words">{row.creatorName}</p>
          ) : null}
          <p className="text-faint mt-0.5 text-[0.75rem] break-words">
            {showContest
              ? [row.brandName, row.contestName].filter(Boolean).join(', ') || 'A contest'
              : (row.brandName ?? 'This contest')}
          </p>
        </div>
        <span className="text-faint shrink-0 font-mono text-[0.75rem]">
          Asked {waitingFor(row.createdAt, now)}
        </span>
      </div>

      {row.note ? (
        <p className="wx-neo-raised text-muted mt-3 rounded-xl px-3.5 py-2.5 text-[0.8125rem] leading-relaxed">
          {row.note}
        </p>
      ) : null}

      <div className="border-line mt-4 border-t pt-4">
        <Field
          label="Message to the creator"
          hint="They read this. Optional either way, and worth writing on a refusal."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name={`entry-note-${row.id}`}
              rows={2}
              maxLength={500}
              value={note}
              disabled={busy}
              onChange={(e) => {
                setNote(e.target.value);
                if (serverError) setServerError('');
              }}
              placeholder="e.g. You are in. Read the brief before you start filming."
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        {/*
          Barring somebody is a SECOND decision, deliberately behind its own
          switch. A refusal on its own leaves them free to ask again, which is
          usually what a refusal means. An exclusion is scoped to this one
          contest by decision D5.
        */}
        <label className="text-muted mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[0.8125rem] font-medium">
          <input
            type="checkbox"
            className="size-[18px] cursor-pointer accent-[var(--wx-accent)]"
            checked={block}
            disabled={busy}
            onChange={(e) => setBlock(e.target.checked)}
          />
          Also bar them from this contest, so they cannot ask again
        </label>

        {block ? (
          <div className="mt-2">
            <Field
              label="Why, for the team"
              hint="Staff only. No creator can ever read this, here or anywhere else."
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  name={`entry-block-${row.id}`}
                  rows={2}
                  maxLength={500}
                  value={blockReason}
                  disabled={busy}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g. Two chargebacks on the last campaign."
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
          </div>
        ) : null}

        {serverError ? (
          <p
            role="alert"
            className="bg-danger-soft text-danger mt-3 rounded-xl px-3 py-2 text-[0.8125rem] font-medium"
          >
            {serverError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button type="button" disabled={busy} onClick={() => void decide('approved')}>
            {busy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Check size={16} aria-hidden />
            )}
            Let them in
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px]"
            disabled={busy}
            onClick={() => void decide('rejected')}
          >
            {block ? <ShieldMinus size={15} aria-hidden /> : <Undo2 size={15} aria-hidden />}
            {block ? 'Refuse and bar' : 'Not this time'}
          </Button>
        </div>

        <p className="text-faint mt-3 max-w-prose text-[0.75rem] leading-relaxed">
          One decision only: once this is answered it cannot be answered again, even by somebody
          else looking at it right now.
        </p>
      </div>
    </article>
  );
}
