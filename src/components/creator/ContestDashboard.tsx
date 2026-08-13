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
      <div className="border-line bg-surface-1 mt-6 flex flex-col items-start gap-3 rounded-[20px] border p-8 shadow-md">
        <div className="bg-surface-3 border-line-strong grid size-11 place-items-center rounded-[14px] border">
          <Trophy size={19} className="text-muted" aria-hidden />
        </div>
        <h2 className="font-display text-text text-[21px] leading-tight font-bold">
          You are not in a contest yet
        </h2>
        <p className="text-muted max-w-prose text-[14px] leading-relaxed">
          Enter one and this becomes the screen that tells you how close you are to each target,
          what has been confirmed, and where you sit against everybody else in it.
        </p>
      </div>
    );
  }

  /* -------------------------------------------------------- the headline -- */

  let earned = 0;
  let reachable = 0;
  let waiting = 0;
  const currency = mine[0]?.currency ?? 'USD';

  for (const c of mine) {
    const confirmedGmv = c.confirmed?.confirmedGmv ?? 0;
    const confirmedVideos = c.confirmed?.confirmedVideoCount ?? 0;
    if (c.pendingClaim) waiting += 1;

    for (const d of c.deliverables) {
      if (isReached(d, confirmedGmv, confirmedVideos)) earned += d.rewardAmount;
      else reachable += d.rewardAmount;
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Four figures, not four charts. A single number is not improved by being drawn. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Contests you are in" value={String(mine.length)} />
        <Figure
          label="Earned so far"
          value={money(earned, currency)}
          tone="paid"
          note="Targets you have reached on confirmed figures"
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
    <div className="border-line bg-surface-1 rounded-[20px] border p-4 shadow-md">
      <p className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">{label}</p>
      <p
        className={cn(
          'font-display mt-1.5 text-[26px] leading-none font-bold',
          tone === 'paid' ? 'text-stage-paid' : tone === 'due' ? 'text-stage-due' : 'text-text'
        )}
      >
        {value}
      </p>
      {note ? <p className="text-faint mt-1.5 text-[12px] leading-snug">{note}</p> : null}
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
    <section className="border-line bg-surface-1 rounded-[20px] border p-5 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
            {contest.brand?.name ?? 'Contest'}
          </p>
          <h2 className="font-display text-text mt-1 text-[21px] leading-tight font-bold">
            {contest.name}
          </h2>
          <p className="text-muted mt-1 text-[13px]">
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
        <div className="border-line bg-surface-2 mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-[14px] border p-3.5">
          <Standing label="On GMV" place={standing.gmvPlace} of={standing.entrants} />
          <Standing label="On videos" place={standing.videoPlace} of={standing.entrants} />
          <p className="text-faint basis-full text-[12px] leading-snug">
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

      {contest.pendingClaim ? (
        <p className="text-stage-due mt-4 text-[13px] font-medium">
          One claim is with the team. Nothing moves above until they confirm it.
        </p>
      ) : null}

      <Link
        to="/app/contests"
        className="text-accent ease-brand mt-4 inline-flex min-h-11 items-center text-[13px] font-semibold transition-colors hover:underline"
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
    <p className="text-[13px]">
      <span className="text-muted">{label}: </span>
      <span className="text-text font-display font-bold">{ordinal}</span>
      <span className="text-muted"> closest of {of}</span>
    </p>
  );
}
