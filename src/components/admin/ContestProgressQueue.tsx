import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Undo2,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import {
  DeliverableProgress,
  type DeliverableType,
} from '@/components/work/DeliverableProgress';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { getSupabase } from '@/lib/supabase';
import { CONTENT_STATUS, type ContentStatus } from '@/lib/content';
import { useManageContest } from '@/lib/admin/useManageContest';
import { ContestVideoDecision } from '@/components/admin/ContestVideoDecision';

/**
 * What creators say they have done, waiting for the team to say it is true.
 *
 * THE ONE SENTENCE THIS SCREEN EXISTS FOR: nothing counts until it is confirmed
 * here. A creator types their own GMV, which is a creator typing their own
 * payslip, so a typed figure is recorded as a CLAIM and money is only ever owed
 * against a confirmed one. Every number on this screen is labelled as one or the
 * other and they are never added together.
 *
 * WHAT ONE ROW SHOWS, which is exactly what is being judged:
 *
 *   who claimed it, and which contest they are in,
 *   what they now say the totals are,
 *   WHAT THEY SAID LAST TIME, and the difference between the two,
 *   what has actually been confirmed on that entry so far,
 *   the videos that arrived with this update,
 *   confirm, or send it back with a message the creator reads.
 *
 * The figures are CUMULATIVE TOTALS, never increments, so "3 videos to 6" is the
 * change and 6 is the claim. Adding two updates together is the single
 * arithmetic error this data can cause, and it is not made here: the confirmed
 * figure comes from `contest_entry_confirmed_totals`, which is the LATEST
 * confirmed row rather than the sum of them.
 *
 * CONFIRMING FIGURES IS NOT A DECISION ABOUT THE VIDEOS. Contest videos are
 * reviewed one at a time, like offer content, and `review_contest_progress`
 * deliberately does not touch them. The videos are listed here as evidence for
 * the figure, with the status each one already carries.
 *
 * NOT LIVE, on purpose. `contest_progress_updates` is deliberately absent from
 * the realtime publication, because row security is not applied to DELETE events
 * and a creator's claimed GMV would broadcast to anybody who opened a channel
 * without a filter. It refetches on a timer instead, which is all a queue needs:
 * a claim changes because a creator typed it, or because somebody here decided
 * it, and a decision invalidates this query directly.
 */

const PAGE_SIZE = 8;

/* ------------------------------------------------------------- the shapes -- */

interface QueueVideo {
  id: string;
  videoUrl: string;
  adCode: string;
  status: ContentStatus;
  videoTitle: string | null;
  createdAt: string;
}

interface QueueTerm {
  id: string;
  type: DeliverableType;
  title: string;
  targetValue: number;
  rewardAmount: number | null;
  currency: string;
}

interface QueueRow {
  id: string;
  entryId: string;
  createdAt: string;
  /** What they now say the totals are. A claim, never a total. */
  gmv: number;
  videoCount: number;
  creatorHandle: string | null;
  creatorName: string | null;
  contestId: string;
  contestName: string | null;
  brandName: string | null;
  currency: string;
  /** The last thing they claimed on this entry, whatever became of it. */
  previous: {
    gmv: number;
    videoCount: number;
    status: 'confirmed' | 'rejected';
    createdAt: string;
  } | null;
  /** Confirmed by the team. The only figure money may be owed against. */
  confirmed: { gmv: number; videoCount: number; at: string | null } | null;
  /** What this entrant was promised, frozen at approval. */
  terms: QueueTerm[];
  /** The videos that came in with THIS update, not everything they have filed. */
  videos: QueueVideo[];
}

/* --------------------------------------------------------------- the read -- */

/*
 * Several small reads rather than one deep nested select, the same choice
 * `useContest` makes and for the same reason: these rows live in five tables
 * with five different policies, and a nested select that silently returns
 * nothing for one of them looks identical to a creator who has claimed nothing.
 * Every read below is bounded by the page, and every one of them rides an index
 * that already exists.
 *
 * It lives in this file rather than in `src/lib/admin/` because it is read by
 * exactly one component and by nothing else, and a hook nobody else calls is
 * easier to keep honest next to the screen that renders it.
 */
async function fetchQueue(
  contestId: string | undefined,
  page: number
): Promise<{ rows: QueueRow[]; total: number }> {
  const sb = getSupabase();
  const from = (page - 1) * PAGE_SIZE;

  /*
   * Scoping to one contest costs one extra read, because a claim belongs to an
   * ENTRY and `contest_progress_updates` deliberately carries no contest_id of
   * its own. Bounded at 500 entrants, which is far past anything this product
   * has seen, and the queue itself is paged underneath it.
   */
  let entryScope: string[] | null = null;
  if (contestId) {
    const { data, error } = await sb
      .from('contest_entries')
      .select('id')
      .eq('contest_id', contestId)
      .eq('status', 'approved')
      .limit(500);
    if (error) throw error;
    entryScope = ((data ?? []) as unknown as { id: string }[]).map((r) => r.id);
    if (entryScope.length === 0) return { rows: [], total: 0 };
  }

  let pending = sb
    .from('contest_progress_updates')
    .select('id, entry_id, creator_id, gmv, video_count, created_at', { count: 'exact' })
    .eq('status', 'pending');

  if (entryScope) pending = pending.in('entry_id', entryScope);

  // Oldest first. The person who has been waiting longest is the one this queue
  // is open to deal with.
  const {
    data: updateData,
    error: updateErr,
    count,
  } = await pending.order('created_at', { ascending: true }).range(from, from + PAGE_SIZE - 1);

  if (updateErr) throw updateErr;

  const updates = (updateData ?? []) as unknown as {
    id: string;
    entry_id: string;
    creator_id: string;
    gmv: number | string;
    video_count: number;
    created_at: string;
  }[];

  if (updates.length === 0) return { rows: [], total: count ?? 0 };

  const entryIds = [...new Set(updates.map((u) => u.entry_id))];
  const updateIds = updates.map((u) => u.id);

  const [entriesRes, previousRes, totalsRes, termsRes, videosRes] = await Promise.all([
    sb
      .from('contest_entries')
      .select('id, contest_id, brand_id, creator_handle, creator_name, currency')
      .in('id', entryIds),
    // Every earlier claim on these entries. There can only ever be ONE pending
    // row per entry, so everything that is not this claim has been decided.
    sb
      .from('contest_progress_updates')
      .select('id, entry_id, gmv, video_count, status, created_at')
      .in('entry_id', entryIds)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200),
    sb
      .from('contest_entry_confirmed_totals')
      .select('entry_id, confirmed_gmv, confirmed_video_count, confirmed_at')
      .in('entry_id', entryIds),
    sb
      .from('contest_entry_terms')
      .select('id, entry_id, type, title, target_value, reward_amount, currency')
      .in('entry_id', entryIds),
    sb
      .from('contest_submissions')
      .select('id, progress_update_id, video_url, ad_code, status, video_title, created_at')
      .in('progress_update_id', updateIds)
      .order('created_at', { ascending: true }),
  ]);

  for (const res of [entriesRes, previousRes, totalsRes, termsRes, videosRes]) {
    if (res.error) throw res.error;
  }

  const entries = (entriesRes.data ?? []) as unknown as {
    id: string;
    contest_id: string;
    brand_id: string;
    creator_handle: string | null;
    creator_name: string | null;
    currency: string;
  }[];

  const contestIds = [...new Set(entries.map((e) => e.contest_id))];
  const brandIds = [...new Set(entries.map((e) => e.brand_id))];

  const [contestsRes, brandsRes] = await Promise.all([
    sb.from('contests').select('id, name, currency').in('id', contestIds),
    sb.from('brands').select('id, name').in('id', brandIds),
  ]);
  if (contestsRes.error) throw contestsRes.error;
  if (brandsRes.error) throw brandsRes.error;

  const entryById = new Map(entries.map((e) => [e.id, e]));
  const contestById = new Map(
    (
      (contestsRes.data ?? []) as unknown as { id: string; name: string; currency: string }[]
    ).map((c) => [c.id, c])
  );
  const brandById = new Map(
    ((brandsRes.data ?? []) as unknown as { id: string; name: string }[]).map((b) => [b.id, b])
  );

  /** The most recent decided claim per entry, which is "what they said last time". */
  const previousByEntry = new Map<
    string,
    { gmv: number; videoCount: number; status: 'confirmed' | 'rejected'; createdAt: string }
  >();
  for (const row of (previousRes.data ?? []) as unknown as {
    entry_id: string;
    gmv: number | string;
    video_count: number;
    status: 'confirmed' | 'rejected';
    created_at: string;
  }[]) {
    // Already newest first, so the first one seen for an entry is the latest.
    if (previousByEntry.has(row.entry_id)) continue;
    previousByEntry.set(row.entry_id, {
      gmv: Number(row.gmv),
      videoCount: row.video_count,
      status: row.status,
      createdAt: row.created_at,
    });
  }

  const confirmedByEntry = new Map<
    string,
    { gmv: number; videoCount: number; at: string | null }
  >();
  for (const row of (totalsRes.data ?? []) as unknown as {
    entry_id: string;
    confirmed_gmv: number | string;
    confirmed_video_count: number;
    confirmed_at: string | null;
  }[]) {
    confirmedByEntry.set(row.entry_id, {
      gmv: Number(row.confirmed_gmv),
      videoCount: row.confirmed_video_count,
      at: row.confirmed_at,
    });
  }

  const termsByEntry = new Map<string, QueueTerm[]>();
  for (const row of (termsRes.data ?? []) as unknown as {
    id: string;
    entry_id: string;
    type: DeliverableType;
    title: string;
    target_value: number | string;
    reward_amount: number | string | null;
    currency: string;
  }[]) {
    const list = termsByEntry.get(row.entry_id) ?? [];
    list.push({
      id: row.id,
      type: row.type,
      title: row.title,
      targetValue: Number(row.target_value),
      rewardAmount: row.reward_amount === null ? null : Number(row.reward_amount),
      currency: row.currency,
    });
    termsByEntry.set(row.entry_id, list);
  }

  const videosByUpdate = new Map<string, QueueVideo[]>();
  for (const row of (videosRes.data ?? []) as unknown as {
    id: string;
    progress_update_id: string | null;
    video_url: string;
    ad_code: string;
    status: ContentStatus;
    video_title: string | null;
    created_at: string;
  }[]) {
    if (!row.progress_update_id) continue;
    const list = videosByUpdate.get(row.progress_update_id) ?? [];
    list.push({
      id: row.id,
      videoUrl: row.video_url,
      adCode: row.ad_code,
      status: row.status,
      videoTitle: row.video_title,
      createdAt: row.created_at,
    });
    videosByUpdate.set(row.progress_update_id, list);
  }

  const rows: QueueRow[] = updates.map((u) => {
    const entry = entryById.get(u.entry_id);
    const contest = entry ? contestById.get(entry.contest_id) : undefined;
    const brand = entry ? brandById.get(entry.brand_id) : undefined;

    return {
      id: u.id,
      entryId: u.entry_id,
      createdAt: u.created_at,
      gmv: Number(u.gmv),
      videoCount: u.video_count,
      creatorHandle: entry?.creator_handle ?? null,
      creatorName: entry?.creator_name ?? null,
      contestId: entry?.contest_id ?? '',
      contestName: contest?.name ?? null,
      brandName: brand?.name ?? null,
      // The entry's own currency, which is what they were promised in, and never
      // the contest's currency today.
      currency: entry?.currency ?? contest?.currency ?? 'USD',
      previous: previousByEntry.get(u.entry_id) ?? null,
      confirmed: confirmedByEntry.get(u.entry_id) ?? null,
      terms: termsByEntry.get(u.entry_id) ?? [],
      videos: videosByUpdate.get(u.id) ?? [],
    };
  });

  return { rows, total: count ?? 0 };
}

function useProgressQueue(contestId: string | undefined, page: number) {
  return useQuery({
    queryKey: ['admin', 'contest-progress', contestId ?? 'all', page],
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    // Not realtime, on purpose. See the note at the top of this file.
    refetchInterval: 30_000,
    queryFn: () => fetchQueue(contestId, page),
  });
}

/* --------------------------------------------------------------- helpers -- */

const TONE_CHIP: Record<'live' | 'due' | 'paid', string> = {
  live: 'bg-stage-live-soft text-stage-live',
  due: 'bg-stage-due-soft text-stage-due',
  paid: 'bg-stage-paid-soft text-stage-paid',
};

const videos = (n: number) => `${n.toLocaleString()} video${n === 1 ? '' : 's'}`;

/** How long this has been sitting here. Never a deadline, so never a timezone. */
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

  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/* ----------------------------------------------------------------- queue -- */

export function ContestProgressQueue({
  contestId,
  className,
}: {
  /** Given, this is one contest's queue. Left out, it is every contest's. */
  contestId?: string;
  className?: string;
}) {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, isPlaceholderData, refetch } = useProgressQueue(
    contestId,
    page
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = Date.now();

  return (
    <section
      className={cn(
        'border-line bg-surface-1 flex flex-col gap-4 rounded-xl border p-5 shadow-md',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Progress waiting on you
          </h2>
          <p className="text-faint mt-1.5 max-w-prose text-[0.75rem] leading-relaxed">
            Creators type what they have achieved so far. Nothing counts until somebody here
            confirms it, and nothing is owed against a figure that has not been confirmed.
          </p>
        </div>

        {total > 0 ? (
          <span className="bg-stage-due-soft text-stage-due shrink-0 rounded-full px-3 py-1 text-[0.75rem] font-semibold">
            <span className="wx-numeric font-mono">{total}</span> waiting
          </span>
        ) : null}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-3">
          <div className="wx-skeleton h-[220px] rounded-xl" />
          <div className="wx-skeleton h-[220px] rounded-xl" />
        </div>
      ) : isError ? (
        <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <h3 className="font-display text-text text-[1.1875rem] leading-tight font-bold">
            That queue would not load
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
        /*
         * Confirming the last claim on page two empties the page rather than the
         * queue. Saying "nothing is waiting" here would be a lie with the count
         * still showing beside it.
         */
        <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <h3 className="font-display text-text text-[1.1875rem] leading-tight font-bold">
            This page is empty now
          </h3>
          <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
            The claims that were on it have been answered. There are still others waiting.
          </p>
          <Button type="button" variant="secondary" onClick={() => setPage(1)}>
            Back to the first page
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <div className="bg-surface-3 border-line-strong grid size-[44px] place-items-center rounded-lg border">
            <Check size={19} className="text-muted" aria-hidden />
          </div>
          <h3 className="font-display text-text text-[1.1875rem] leading-tight font-bold">
            Nothing is waiting to be confirmed
          </h3>
          <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
            {contestId
              ? 'Nobody in this contest has sent figures we have not answered. The moment somebody updates their progress, it lands here.'
              : 'No creator is waiting on a decision about their figures. The moment somebody updates their progress, it lands here.'}
          </p>
        </div>
      ) : (
        <ul
          className={cn(
            'flex flex-col gap-3 transition-opacity duration-200',
            isPlaceholderData && 'opacity-60'
          )}
        >
          {rows.map((row) => (
            <li key={row.id}>
              <ClaimCard row={row} now={now} showContest={!contestId} />
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
              className="min-h-[44px]"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Next
              <ChevronRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ card -- */

function ClaimCard({
  row,
  now,
  showContest,
}: {
  row: QueueRow;
  now: number;
  showContest: boolean;
}) {
  /*
   * The one door, `useManageContest`, exactly like every other staff write in
   * this feature. It is instantiated PER CARD so that a decision in flight
   * disables the card it belongs to and nothing else, and because it already
   * invalidates this queue, a confirmed claim leaves the list on its own.
   *
   * `review_contest_progress` is granted to service_role alone and
   * `contest_progress_updates` has no insert, update or delete policy at all,
   * so the browser could not do this even if it tried.
   */
  const review = useManageContest();
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState('');
  const [serverError, setServerError] = useState('');

  const busy = review.isPending;
  const who = row.creatorHandle ? `@${row.creatorHandle}` : (row.creatorName ?? 'A creator');

  const gmvBefore = row.previous?.gmv ?? null;
  const videosBefore = row.previous?.videoCount ?? null;

  async function decide(status: 'confirmed' | 'rejected') {
    setServerError('');
    const text = message.trim();

    // The same refusal the database makes, said before the round trip. A
    // rejection with nothing said is a creator with nothing to act on.
    if (status === 'rejected' && !text) {
      setMessageError('Say what was wrong with these figures, the creator reads it');
      return;
    }
    setMessageError('');

    try {
      await review.mutateAsync({
        action: 'progress.review',
        updateId: row.id,
        status,
        // MESSAGE, not reason. The creator reads it. See decision D14.
        message: text || null,
      });
      // Nothing to reset: a decided claim leaves the queue on the refetch this
      // triggers, and this card goes with it.
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'That decision did not go through');
    }
  }

  return (
    <article className="border-line bg-surface-1 rounded-xl border p-4 sm:p-5">
      {/* ------------------------------------------------------------ who -- */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-display text-text text-[1.0625rem] leading-tight font-bold break-words">
            {who}
          </h3>
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
          Claimed {waitingFor(row.createdAt, now)}
        </span>
      </div>

      {/* ------------------------------------------------ what changed ---- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Change
          label="GMV, in total"
          now={money(row.gmv, row.currency)}
          before={gmvBefore === null ? null : money(gmvBefore, row.currency)}
          delta={
            gmvBefore === null
              ? null
              : row.gmv >= gmvBefore
                ? `up ${money(row.gmv - gmvBefore, row.currency)}`
                : `down ${money(gmvBefore - row.gmv, row.currency)}`
          }
        />
        <Change
          label="Videos, in total"
          now={videos(row.videoCount)}
          before={videosBefore === null ? null : videos(videosBefore)}
          delta={
            videosBefore === null
              ? null
              : row.videoCount === videosBefore
                ? 'no change'
                : `${row.videoCount - videosBefore} more`
          }
        />
      </div>

      {/* ------------------------------------------- what is real so far -- */}
      <p className="text-muted mt-3 text-[0.8125rem] leading-relaxed">
        {row.confirmed && (row.confirmed.gmv > 0 || row.confirmed.videoCount > 0) ? (
          <>
            <span className="text-text font-semibold">Confirmed so far: </span>
            {money(row.confirmed.gmv, row.currency)} and {videos(row.confirmed.videoCount)}. The
            figures above are a claim until you confirm them.
          </>
        ) : (
          <>
            <span className="text-text font-semibold">
              Nothing confirmed on this entry yet.{' '}
            </span>
            The figures above are a claim, and nothing is owed against them.
          </>
        )}
      </p>

      {row.previous?.status === 'rejected' ? (
        <p className="text-faint mt-1.5 text-[0.75rem] leading-relaxed">
          Their last update was sent back, so the figures it carried were never counted.
        </p>
      ) : null}

      {/* ------------------------------------------- against the targets -- */}
      {row.terms.length > 0 ? (
        <div className="border-line mt-4 flex flex-col gap-3 border-t pt-4">
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Against what they were promised
          </p>
          {row.terms.map((term) => (
            <DeliverableProgress
              key={term.id}
              type={term.type}
              target={term.targetValue}
              confirmed={
                term.type === 'gmv'
                  ? (row.confirmed?.gmv ?? 0)
                  : (row.confirmed?.videoCount ?? 0)
              }
              claimed={term.type === 'gmv' ? row.gmv : row.videoCount}
              currency={term.currency}
              reward={term.rewardAmount}
              title={term.title}
            />
          ))}
        </div>
      ) : null}

      {/* -------------------------------------------------- the evidence -- */}
      <div className="border-line mt-4 border-t pt-4">
        <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Videos with this update
        </p>

        {row.videos.length === 0 ? (
          <p className="text-faint mt-2 max-w-prose text-[0.8125rem] leading-relaxed">
            No new videos came with this one. Only the videos a creator adds are asked for, so
            an update that raises GMV alone carries none.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {row.videos.map((video) => {
              const tone = CONTENT_STATUS[video.status];
              return (
                <li
                  key={video.id}
                  className="border-line bg-surface-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-3.5 py-3"
                >
                  <span className="min-w-0 flex-1 basis-52">
                    <a
                      href={video.videoUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent inline-flex min-h-[44px] items-center gap-1.5 text-[0.8125rem] font-semibold hover:underline"
                    >
                      <Video size={14} aria-hidden />
                      <span className="break-all">{video.videoTitle ?? 'Watch this one'}</span>
                      <ExternalLink size={13} aria-hidden />
                    </a>
                    <span className="text-muted mt-0.5 block font-mono text-[0.75rem] break-all">
                      {video.adCode}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold',
                      TONE_CHIP[tone.tone]
                    )}
                  >
                    {tone.label}
                  </span>

                  {/*
                    DECIDE IT HERE TOO, from 2026-08-20. The reviewer is already
                    watching this video to judge the figures; making them find
                    the same row again in another queue is how a video sits
                    undecided. The same component draws it there, so the two
                    cannot drift apart.
                  */}
                  <span className="w-full">
                    <ContestVideoDecision contentId={video.id} status={video.status} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-faint mt-2 max-w-prose text-[0.75rem] leading-relaxed">
          Confirming these figures is not a decision about the videos, and it is not what pays for
          them either. Each video is watched on its own, and a video reward is owed once the last
          one is approved.
        </p>
      </div>

      {/* -------------------------------------------------- the decision -- */}
      <div className="border-line mt-4 border-t pt-4">
        <Field
          label="Message to the creator"
          error={messageError || undefined}
          hint="They read this. Required when you send it back, optional when you confirm."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name={`message-${row.id}`}
              rows={2}
              maxLength={500}
              value={message}
              disabled={busy}
              onChange={(e) => {
                setMessage(e.target.value);
                if (messageError) setMessageError('');
                if (serverError) setServerError('');
              }}
              placeholder="e.g. Checked against the seller centre, all six videos are live."
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        {serverError ? (
          <p
            role="alert"
            className="bg-danger-soft text-danger mt-3 rounded-xl px-3 py-2 text-[0.8125rem] font-medium"
          >
            {serverError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button type="button" disabled={busy} onClick={() => void decide('confirmed')}>
            {busy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Check size={16} aria-hidden />
            )}
            Confirm these figures
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px]"
            disabled={busy}
            onClick={() => void decide('rejected')}
          >
            <Undo2 size={15} aria-hidden />
            Send it back
          </Button>
        </div>

        <p className="text-faint mt-3 max-w-prose text-[0.75rem] leading-relaxed">
          Confirming is what makes these figures real. One decision only: once this is answered
          it cannot be answered again, even by somebody else looking at it right now.
        </p>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- change -- */

/**
 * One measure, as a change rather than as a figure.
 *
 * The claim is the big number because it is what is being judged, and what they
 * said last time sits under it because the difference is the whole question. A
 * first claim says so in words: printing "from 0" would invent a figure nobody
 * ever typed.
 */
function Change({
  label,
  now,
  before,
  delta,
}: {
  label: string;
  now: string;
  before: string | null;
  delta: string | null;
}) {
  return (
    <div className="bg-surface-2 border-line rounded-xl border px-3.5 py-3">
      <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        {label}
      </span>
      <span className="wx-numeric font-display text-text mt-1 block text-[1.375rem] leading-none font-bold">
        {now}
      </span>
      <span className="text-muted mt-1.5 block text-[0.75rem]">
        {before === null ? (
          'Their first claim on this entry'
        ) : (
          <>
            was <span className="text-text font-semibold">{before}</span>
            {delta ? <span className="text-faint">, {delta}</span> : null}
          </>
        )}
      </span>
    </div>
  );
}
