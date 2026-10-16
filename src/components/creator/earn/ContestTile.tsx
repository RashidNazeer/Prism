import { NOT_REPORTED, compactMoney, exactMoney } from '@/components/charts';
import { ContestStateChip } from '@/components/work/ContestStateChip';
import { timeLeft } from '@/lib/contest-time';
import { BrandChip, MiniBar, StatusPill } from './EarnBits';
import { CountdownRing } from './CountdownRing';
import { AnonymousStanding } from './AnonymousStanding';
import { ContestTileAction } from './ContestTileAction';
import { ContestTileDetails } from './ContestTileDetails';
import { countdownOf, filmedOf, prizeTotal } from './contest-math';
import { doorOf, entryStateOf, type CreatorContest } from '@/lib/creator/useCreatorContests';

/**
 * ONE CONTEST, AS A CREATOR SEES IT. §8.1.
 *
 * Brand chip, name, prize line, a countdown ring; and if she is in it, her
 * deliverables as a bar and her anonymous standing. One button under all of it.
 * Everything else is one tap down, in `ContestTileDetails`.
 *
 * NO HERO PHOTOGRAPH ANY MORE, and that is the density change. The old card
 * opened with a 15-to-20rem banner carrying white text on an admin's
 * photograph behind two scrims, then three tabs, then a facts band, then the
 * action: about three screens per contest. A creator scanning this list is
 * comparing exactly three things — which brand, how much, and how long is left
 * — and none of them was the picture. The artwork still has a home: it is on
 * the brand hub the chip links to, and `card_image_url` is unread here rather
 * than deleted, so nothing an admin uploaded is lost.
 *
 * IT IS `wx-neo-raised-sm`, NOT `wx-neo-raised`. Fifteen of these inside one
 * blurred panel is one blur; fifteen blurred cards is fifteen, recomputed on
 * every scroll frame. Same material, same lit rims, no blur. See `EarnPanel`.
 *
 * THE DOOR AND THE WORK. A contest that is switched off or past its deadline
 * closes the DOOR, never the WORK — so this tile never greys itself out and
 * never hides her figures because the deadline passed. `ContestTileAction`
 * carries the branch order that guarantees it.
 */
export function ContestTile({
  contest,
  now,
  canEnterAtAll,
  onEnter,
  onUpdateProgress,
}: {
  contest: CreatorContest;
  /** From the one `useNow` on the page, so every tile ticks together. */
  now: number;
  canEnterAtAll: boolean;
  onEnter: () => void;
  onUpdateProgress: () => void;
}) {
  const door = doorOf(contest, now);
  const state = entryStateOf(contest);
  const inIt = state === 'in';

  const countdown = countdownOf(contest, now);
  const prize = prizeTotal(contest);
  const filmed = filmedOf(contest);

  return (
    <div className="wx-neo-raised-sm flex h-full flex-col overflow-hidden rounded-xl">
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {/* ------------------------------------------------- top row -- */}
        <div className="flex items-start justify-between gap-2">
          <BrandChip brand={contest.brand} className="min-w-0" />
          {/*
            THE ORDER OF THESE BRANCHES IS THE SAME ORDER THE GROUPS ON
            `/app/contests` ARE DERIVED IN, so a pill can never disagree with
            the heading a tile is sitting under.

            `declined` IS ITS OWN PILL, 2026-10-16. It used to fall through to
            the door, so a creator who had been turned down for a contest that
            is still open read "Open to join" in the corner and "Not this time."
            in the action three lines below — on one tile, about one entry. The
            same fix as `pillFor` on the offer card, and the same word on both.

            `withdrawn` still falls through to the door on purpose: she pulled
            out, the contest really is open to her again, and her action says
            "Enter after all". Nothing disagrees there.
          */}
          {inIt ? (
            <StatusPill tone="live">You are in</StatusPill>
          ) : state === 'waiting' ? (
            <StatusPill tone="waiting">Waiting</StatusPill>
          ) : state === 'declined' ? (
            <StatusPill tone="bad">Declined</StatusPill>
          ) : door === 'open' ? (
            <StatusPill tone="open">Open to join</StatusPill>
          ) : (
            <ContestStateChip state={door} />
          )}
        </div>

        {/* ------------------------------------- name, prize and ring -- */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-text text-[1.0625rem] leading-snug font-semibold tracking-[-0.01em] break-words">
              {contest.name}
            </h3>

            {/*
              THE PRIZE LINE: everything on the table if every target is
              reached. WHAT IS ON OFFER, NEVER WHAT IS OWED — money is owed
              against a CONFIRMED figure and nothing else, which is why it is
              labelled as a ceiling and never drawn in the paid token.

              COMPACT ON THE FACE, EXACT IN THE TITLE. `compactMoney` truncates
              rather than rounds, so a figure never looks better than it is;
              `exactMoney` carries the real one for anybody who hovers.

              NULL IS NOT ZERO. A contest with no reward rows has no figure to
              print, so it prints `NOT_REPORTED` in muted text with the reason
              beside it. A 0 would be a claim — "this contest pays nothing" —
              and that is a different and much worse thing to say. A contest
              whose rewards really are 0 is a real zero and prints as one.
            */}
            {prize.amount === null ? (
              <p className="text-muted mt-1 text-[0.8125rem]">
                <span className="text-faint font-medium">{NOT_REPORTED}</span>{' '}
                <span className="text-faint text-[0.75rem]">
                  · no rewards set on this one yet
                </span>
              </p>
            ) : (
              <p
                className="text-muted mt-1 text-[0.75rem]"
                title={exactMoney(prize.amount, prize.currency)}
              >
                <span className="font-display text-text wx-numeric text-[1.125rem] leading-none font-bold">
                  {compactMoney(prize.amount, prize.currency)}
                </span>{' '}
                {inIt ? 'promised to you' : 'if you hit every target'}
              </p>
            )}
          </div>

          {/*
            THE COUNTDOWN RING, only while the door is open. A shut door has no
            countdown to draw, and a ring at zero beside "Closed" is the tile
            saying the same thing twice in two registers.
          */}
          {door === 'open' ? (
            <CountdownRing
              countdown={countdown}
              ariaLabel={`${timeLeft(contest.expiresAt, now)}, out of the whole contest window`}
            />
          ) : null}
        </div>

        {door === 'open' ? (
          <p className="text-faint text-[0.75rem]">
            {timeLeft(contest.expiresAt, now)}
            {contest.needsAdminApproval ? ' · the Wurx team approves entries' : ''}
          </p>
        ) : null}

        {/* ------------------------------------ her work, if she is in -- */}
        {inIt ? (
          <div className="border-line flex flex-col gap-3 border-t pt-3">
            {filmed.label !== null ? (
              <MiniBar share={filmed.share} label={filmed.label} tone="paid" />
            ) : (
              <p className="text-muted text-[0.75rem]">
                No fixed number of videos was agreed, so there is no bar to draw.
              </p>
            )}
            <AnonymousStanding contestId={contest.id} />
          </div>
        ) : null}

        {/* ------------------------------------------------- one button -- */}
        <div className="mt-auto pt-1">
          <ContestTileAction
            contest={contest}
            door={door}
            canEnterAtAll={canEnterAtAll}
            onEnter={onEnter}
            onUpdateProgress={onUpdateProgress}
          />
        </div>
      </div>

      <ContestTileDetails contest={contest} door={door} />
    </div>
  );
}
