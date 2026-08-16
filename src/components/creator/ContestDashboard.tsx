import { Link } from 'react-router';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDeadline, timeLeft } from '@/lib/contest-time';
import { DeliverableDonut, DeliverableProgress } from '@/components/work/DeliverableProgress';
import {
  claimedTotalsOf,
  useMyContestStanding,
  type CreatorContest,
  type CreatorContestDeliverable,
} from '@/lib/creator/useCreatorContests';

/**
 * Where a creator stands, across every contest they are in.
 *
 * THE ONE RULE THIS SCREEN IS BUILT AROUND: a creator types their own GMV, so
 * every figure here is either CONFIRMED, meaning the team checked it and money
 * may be owed against it, or CLAIMED, meaning it is a sentence somebody typed.
 * The two are never added together and never drawn the same, because the moment
 * they are, this screen starts telling people they have earned things nobody
 * agreed to.
 *
 * So: money "earned" counts only targets reached on CONFIRMED figures. Anything
 * resting on a claim is described as waiting, in words, next to the number.
 *
 * Nothing here is a chart for the sake of one. The bars exist because comparing
 * lengths is something people are good at, the single ring exists because one
 * contest has one headline, and the four figures at the top are figures rather
 * than a chart because a single number is not improved by being drawn.
 */

/** Reached, on confirmed figures only. Never on a claim. */
function isReached(d: CreatorContestDeliverable, gmv: number, videos: number): boolean {
  const have = d.type === 'gmv' ? gmv : videos;
  return d.targetValue > 0 && have >= d.targetValue;
}

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
    maximumFractionDigits: 0,
  }).format(n);

export function ContestDashboard({ contests }: { contests: CreatorContest[] }) {
  // Only the ones they are actually in. A contest they have not entered has no
  // progress to show, and padding this screen with them would bury the work.
  const mine = contests.filter((c) => c.entry?.status === 'approved');

  if (mine.length === 0) {
    return (
      <div className="border-line bg-surface-1 mt-6 flex flex-col items-start gap-3 rounded-xl border p-8 shadow-md">
        <div className="bg-surface-3 border-line-strong grid size-[44px] place-items-center rounded-lg border">
          <Trophy size={19} className="text-muted" aria-hidden />
        </div>
        <h2 className="font-display text-text text-[1.3125rem] leading-tight font-bold">
          You are not in a contest yet
        </h2>
        <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
          Enter one and this becomes the screen that tells you how close you are to each target,
          what has been confirmed, and where you sit against everybody else in it.
        </p>
      </div>
    );
  }

  /* -------------------------------------------------------- the headline -- */

  /*
   * THE MONEY COMES OFF THE BILL, NOT OFF THIS SCREEN'S ARITHMETIC.
   *
   * Until 2026-08-14 "earned" was computed here by walking the contest's
   * deliverables and asking which targets looked reached. That was the best
   * available answer while nothing recorded rewards, and it was wrong in two
   * ways it could never fix: it read the deliverables AS THEY ARE TODAY rather
   * than the frozen terms somebody agreed to, and it could not tell earned from
   * paid because nothing knew.
   *
   * A reward is now written the moment staff confirm the figure that crosses
   * its target, so `contest.awards` IS what they have earned, and it splits
   * into the two states money actually has here.
   */
  let owed = 0;
  let paid = 0;
  let reachable = 0;
  let waiting = 0;
  const currency = mine[0]?.currency ?? 'USD';

  for (const c of mine) {
    const confirmedGmv = c.confirmed?.confirmedGmv ?? 0;
    const confirmedVideos = c.confirmed?.confirmedVideoCount ?? 0;
    if (c.pendingClaim) waiting += 1;

    for (const w of c.awards) {
      if (w.paidAt) paid += w.amount;
      else owed += w.amount;
    }

    // Still to play for stays on the deliverables, because it is about what is
    // on offer rather than about what has been earned, and a target nobody has
    // reached has no award row to read.
    for (const d of c.deliverables) {
      if (!isReached(d, confirmedGmv, confirmedVideos)) reachable += d.rewardAmount;
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Four figures, not four charts. A single number is not improved by being drawn. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Owed to you"
          value={money(owed, currency)}
          tone={owed > 0 ? 'due' : undefined}
          note="Earned and confirmed. Waiting to be paid."
        />
        <Figure
          label="Paid to you"
          value={money(paid, currency)}
          tone="paid"
          note="From contests, and already sent"
        />
        <Figure
          label="Still to play for"
          value={money(reachable, currency)}
          note="Across every target you have not reached yet"
        />
        <Figure
          label="Waiting on the team"
          value={String(waiting)}
          tone={waiting > 0 ? 'due' : undefined}
          note={waiting === 1 ? 'One claim being checked' : 'Claims being checked'}
        />
      </div>

      {mine.map((c) => (
        <ContestCard key={c.id} contest={c} />
      ))}
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'paid' | 'due';
}) {
  return (
    <div className="border-line bg-surface-1 rounded-xl border p-4 shadow-md">
      <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">{label}</p>
      <p
        className={cn(
          'font-display mt-1.5 text-[1.625rem] leading-none font-bold',
          tone === 'paid' ? 'text-stage-paid' : tone === 'due' ? 'text-stage-due' : 'text-text'
        )}
      >
        {value}
      </p>
      {note ? <p className="text-faint mt-1.5 text-[0.75rem] leading-snug">{note}</p> : null}
    </div>
  );
}

function ContestCard({ contest }: { contest: CreatorContest }) {
  const { data: standing } = useMyContestStanding(contest.id);

  const confirmedGmv = contest.confirmed?.confirmedGmv ?? 0;
  const confirmedVideos = contest.confirmed?.confirmedVideoCount ?? 0;
  const claimed = claimedTotalsOf(contest.progressUpdates, contest.confirmed);

  // The headline is the biggest target they have NOT reached yet, because that
  // is the one still worth chasing. Everything reached, and it is the largest.
  const unreached = contest.deliverables.filter(
    (d) => !isReached(d, confirmedGmv, confirmedVideos)
  );
  const headline =
    (unreached.length > 0
      ? unreached.reduce((a, b) => (a.rewardAmount >= b.rewardAmount ? a : b))
      : contest.deliverables.reduce((a, b) => (a.rewardAmount >= b.rewardAmount ? a : b), contest.deliverables[0]!)) ??
    null;

  return (
    <section className="border-line bg-surface-1 rounded-xl border p-5 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            {contest.brand?.name ?? 'Contest'}
          </p>
          <h2 className="font-display text-text mt-1 text-[1.3125rem] leading-tight font-bold">
            {contest.name}
          </h2>
          <p className="text-muted mt-1 text-[0.8125rem]">
            Closes {formatDeadline(contest.expiresAt, contest.expiresAtTimezone)}
            <span className="text-faint"> · {timeLeft(contest.expiresAt)}</span>
          </p>
        </div>

        {headline ? (
          <DeliverableDonut
            type={headline.type}
            target={headline.targetValue}
            confirmed={headline.type === 'gmv' ? confirmedGmv : confirmedVideos}
            claimed={headline.type === 'gmv' ? claimed.gmv : claimed.videoCount}
            currency={contest.currency}
          />
        ) : null}
      </div>

      {/* Where they stand. Never a name, never anybody else's figures. */}
      {standing && standing.entrants > 1 ? (
        <div className="border-line bg-surface-2 mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border p-3.5">
          <Standing label="On GMV" place={standing.gmvPlace} of={standing.entrants} />
          <Standing label="On videos" place={standing.videoPlace} of={standing.entrants} />
          <p className="text-faint basis-full text-[0.75rem] leading-snug">
            Ranked on confirmed figures only, so it moves when the team confirms a claim rather
            than when somebody posts. Nobody can see who anybody else is.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-5">
        {contest.deliverables.map((d) => (
          <DeliverableProgress
            key={d.id}
            type={d.type}
            title={d.title}
            target={d.targetValue}
            confirmed={d.type === 'gmv' ? confirmedGmv : confirmedVideos}
            claimed={d.type === 'gmv' ? claimed.gmv : claimed.videoCount}
            reward={d.rewardAmount}
            currency={contest.currency}
          />
        ))}
      </div>

      {/*
       * WHAT THIS CONTEST HAS ACTUALLY EARNED THEM. Separate from the bars
       * above on purpose: a bar is about a target, and this is about money that
       * exists. A reward appears the moment the team confirms the figure that
       * crosses its target, and changes to paid when it has been sent.
       */}
      {contest.awards.length > 0 ? (
        <div className="border-line mt-5 border-t pt-4">
          <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            What you have earned
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {contest.awards.map((w) => {
              const term = contest.terms.find((t) => t.id === w.termId);
              return (
                <li
                  key={w.id}
                  className="border-line bg-surface-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-xl border px-3.5 py-3"
                >
                  <span className="min-w-0 flex-1 basis-44">
                    <span className="text-text block text-[0.8125rem] font-semibold break-words">
                      {term?.title ?? 'A reward you earned'}
                    </span>
                    {w.message ? (
                      <span className="text-muted mt-0.5 block text-[0.75rem] leading-relaxed">
                        {w.message}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'wx-numeric font-display text-[1.0625rem] leading-none font-bold',
                        w.paidAt ? 'text-stage-paid' : 'text-stage-due'
                      )}
                    >
                      {money(w.amount, w.currency)}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold',
                        w.paidAt
                          ? 'bg-stage-paid-soft text-stage-paid'
                          : 'bg-stage-due-soft text-stage-due'
                      )}
                    >
                      {w.paidAt ? 'Paid' : 'Owed to you'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {contest.pendingClaim ? (
        <p className="text-stage-due mt-4 text-[0.8125rem] font-medium">
          One claim is with the team. Nothing moves above until they confirm it.
        </p>
      ) : null}

      <Link
        to="/app/contests"
        className="text-accent ease-brand mt-4 inline-flex min-h-[44px] items-center text-[0.8125rem] font-semibold transition-colors hover:underline"
      >
        Open this contest
      </Link>
    </section>
  );
}

function Standing({ label, place, of }: { label: string; place: number; of: number }) {
  const ordinal =
    place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
  return (
    <p className="text-[0.8125rem]">
      <span className="text-muted">{label}: </span>
      <span className="text-text font-display font-bold">{ordinal}</span>
      <span className="text-muted"> closest of {of}</span>
    </p>
  );
}
