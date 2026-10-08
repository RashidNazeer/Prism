import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Flag, Loader2, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CreatorFace } from '@/components/work/CreatorFace';
import { ContestVideoDecision } from '@/components/admin/ContestVideoDecision';
import { useCreatorAvatars } from '@/lib/admin/useCreatorAvatars';
import { useContestContent, CONTEST_CONTENT_PAGE } from '@/lib/admin/useContestContent';
import { CONTENT_STATUS, type ContentStatus } from '@/lib/content';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';

const TONE_CHIP: Record<'live' | 'due' | 'paid', string> = {
  live: 'bg-stage-live-soft text-stage-live',
  due: 'bg-stage-due-soft text-stage-due',
  paid: 'bg-stage-paid-soft text-stage-paid',
};

const FILTERS: { key: ContentStatus | 'all'; label: string }[] = [
  { key: 'submitted', label: 'To watch' },
  { key: 'approved', label: 'Approved' },
  { key: 'needs_another_take', label: 'Sent back' },
  { key: 'all', label: 'All' },
];

/**
 * Every contest video, and the only screen that can decide one.
 *
 * IT DID NOT EXIST UNTIL 2026-08-20, and its absence was two bugs at once.
 * `review_contest_content` had been finished, audited and granted since
 * 2026-08-13 with no caller anywhere, so `contest_submissions.status` could
 * never leave 'submitted': the progress queue's chip read "With the team" on
 * every contest video in the product, and the creator's own list carried fully
 * styled "Counted" and "Sent back" states that nothing could ever produce. And
 * the only place a contest video appeared at all was inside a PENDING claim, so
 * deciding a claim made its videos unreachable for good.
 *
 * WHY IT SITS ON THE CLAIMS SCREEN rather than under a contest. The same reason
 * the other two queues do: "what is running" and "who is waiting on me" are
 * different questions worked at different times, and somebody sitting down to
 * clear a backlog wants every contest at once. The filter narrows by decision,
 * not by contest.
 *
 * IT SAYS WHAT THE CLICK WILL COST. Since 2026-08-20 approving the video that
 * reaches a video target owes the reward there and then, so a row about to do
 * that says so BEFORE the button, exactly as the offer queue says "approving
 * this finishes the job". It is a label, never a confirmation step: reviewing
 * at speed was a deliberate decision and both directions are reversible while
 * the money is only owed.
 */
export function ContestVideoQueue() {
  const [filter, setFilter] = useState<ContentStatus | 'all'>('submitted');
  const [page, setPage] = useState(0);

  const query = useContestContent(filter, page);
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / CONTEST_CONTENT_PAGE));

  const faces = useCreatorAvatars(rows.map((r) => r.creatorId));

  const pick = (key: ContentStatus | 'all') => {
    setFilter(key);
    setPage(0);
  };

  return (
    <section className="wx-neo-raised rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[1.0625rem] font-bold">Contest videos</h2>
        <p className="text-faint text-[0.8125rem]">
          {query.isLoading ? 'Loading' : `${total.toLocaleString()} here`}
        </p>
      </div>

      <p className="text-muted mt-1 max-w-prose text-[0.8125rem] leading-relaxed">
        Every video filed against a contest, watched one at a time. A video only counts towards
        a contest target once it is approved, and the reward is owed the moment the last one is.
      </p>

      {/* Row one is the work, per the screen chrome rules. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => pick(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              'rounded-md px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors',
              filter === f.key
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:text-text hover:bg-surface-2'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="mt-4 flex flex-col gap-2">
          <div className="wx-skeleton h-24 rounded-xl" />
          <div className="wx-skeleton h-24 rounded-xl" />
        </div>
      ) : query.error ? (
        <p role="alert" className="text-danger mt-4 text-[0.8125rem]">
          {(query.error as Error).message}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-faint mt-4 max-w-prose text-[0.8125rem] leading-relaxed">
          {filter === 'submitted'
            ? 'Nothing waiting. Every contest video that has come in has been decided.'
            : 'No videos in this state.'}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {rows.map((row) => {
            const tone = CONTENT_STATUS[row.status];
            /*
             * Would THIS approval cross a paying target? It copies the database
             * rule: the smallest video target above what is already approved,
             * reached by one more. Getting it wrong would promise money that
             * does not move, or stay silent while money does.
             */
            const wouldPay =
              row.status !== 'approved' &&
              row.nextTarget !== null &&
              row.approved + 1 >= row.nextTarget;

            return (
              <li key={row.id} className="wx-neo-inset rounded-xl px-3.5 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-1 basis-64 items-start gap-2.5">
                    <CreatorFace
                      src={faces[row.creatorId]}
                      name={row.creatorName}
                      handle={row.creatorHandle}
                      size={34}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[0.875rem] font-semibold">
                        {row.creatorName ?? `@${row.creatorHandle ?? 'someone'}`}
                      </p>
                      <p className="text-muted truncate text-[0.78125rem]">
                        {row.contestName}
                        {row.brandName ? ` · ${row.brandName}` : ''}
                      </p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold',
                      TONE_CHIP[tone.tone]
                    )}
                  >
                    {tone.label}
                  </span>
                </div>

                <div className="mt-2.5">
                  <a
                    href={row.videoUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent inline-flex min-h-[44px] items-center gap-1.5 text-[0.8125rem] font-semibold hover:underline"
                  >
                    <Video size={14} aria-hidden />
                    <span className="break-all">{row.videoTitle ?? 'Watch this one'}</span>
                    <ExternalLink size={13} aria-hidden />
                  </a>
                  <span className="text-muted mt-0.5 block font-mono text-[0.75rem] break-all">
                    {row.adCode}
                  </span>
                </div>

                {/* Where this entry stands, so nobody decides blind. */}
                <p className="text-faint mt-1.5 text-[0.75rem]">
                  {row.approved} approved on this entry
                  {row.nextTarget !== null ? `, next reward at ${row.nextTarget}` : ''}
                </p>

                {row.decisionNote ? (
                  <p className="text-muted mt-1.5 max-w-prose text-[0.78125rem] leading-relaxed">
                    Sent back: {row.decisionNote}
                  </p>
                ) : null}

                {wouldPay ? (
                  <p className="text-stage-paid mt-2 flex items-start gap-1.5 text-[0.75rem] leading-relaxed font-medium">
                    <Flag size={13} aria-hidden className="mt-0.5 shrink-0" />
                    Approving this reaches {row.nextRewardTitle ?? 'their target'} and owes them{' '}
                    {money(row.nextReward, row.currency)}.
                  </p>
                ) : null}

                <div className="mt-2.5">
                  <ContestVideoDecision
                    contentId={row.id}
                    status={row.status}
                    variant="block"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0 || query.isFetching}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft size={14} aria-hidden />
            Back
          </Button>
          <span className="text-muted font-mono text-[0.75rem]">
            {page + 1} of {pages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page + 1 >= pages || query.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight size={14} aria-hidden />
          </Button>
          {query.isFetching ? (
            <Loader2 size={14} aria-hidden className="text-faint animate-spin" />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
