import { Check, ChevronDown, ExternalLink, Store, Ticket, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { DeliverableRows } from '@/components/creator/ContestEntryDialog';
import { ContestProgressSummary } from '@/components/creator/ContestProgressDialog';
import { formatDeadline } from '@/lib/contest-time';
import { TargetControl, VideosFiled, WithdrawEntry } from './ContestTileAction';
import { rowsFor } from './contest-math';
import { entryStateOf, type ContestDoor, type CreatorContest } from '@/lib/creator/useCreatorContests';

/**
 * EVERYTHING THE TILE FACE DOES NOT CARRY, behind one disclosure.
 *
 * THIS IS WHY THE REDESIGN LOSES NOTHING. The old card printed the rewards, the
 * three facts, the perks, the products, the brief, her frozen terms against her
 * confirmed figures, her private target and Pull out, all stacked — about three
 * screens per contest, so a creator scrolled past two blocks they did not want
 * to reach the one they did, on every contest in the list. §8.1 asks for a
 * dense tile; nothing a creator could see before has been taken away, it has
 * been moved one tap down.
 *
 * A `<details>` RATHER THAN STATE AND A DIV: it opens and closes for free, is
 * keyboard operable for free, and is findable by the browser's own
 * find-on-page even while shut, which a hand-rolled accordion is not.
 */
export function ContestTileDetails({
  contest,
  door,
}: {
  contest: CreatorContest;
  door: ContestDoor;
}) {
  const { rows, promised } = rowsFor(contest);
  const inIt = entryStateOf(contest) === 'in';

  // One reason per line, as typed, capped at four. The cap is here rather than
  // on the column so a long list is trimmed on screen instead of being refused
  // at save time.
  const perks = (contest.perks ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <details className="group border-line border-t">
      <summary className="text-muted hover:text-text ease-brand flex min-h-[2.75rem] cursor-pointer list-none items-center gap-1.5 px-3.5 text-[0.8125rem] font-semibold transition-colors marker:content-none sm:min-h-[2.25rem] pointer-coarse:min-h-[2.75rem] [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={14}
          aria-hidden
          className="shrink-0 transition-transform duration-200 group-open:rotate-180"
        />
        <span className="group-open:hidden">What this asks for</span>
        <span className="hidden group-open:inline">Hide the detail</span>
      </summary>

      <div className="border-line flex flex-col gap-4 border-t p-3.5">
        {contest.description ? (
          <p className="text-muted text-[0.8125rem] leading-relaxed">{contest.description}</p>
        ) : null}

        {/* ------------------------------------------- what it pays for -- */}
        {rows.length > 0 ? (
          <div>
            <Eyebrow>{promised ? 'Promised to you' : 'Rewards'}</Eyebrow>
            <DeliverableRows rows={rows} currency={contest.currency} className="mt-2" />
          </div>
        ) : null}

        {/* ------------------------------ her figures against the target -- */}
        {/*
          NO LOADING STATE. The entry, its frozen terms, its claims and its
          confirmed totals all arrive in the same query as the contest, so a
          tile with an entry to draw always has these.
        */}
        {inIt ? (
          <div>
            <Eyebrow>Where you have got to</Eyebrow>
            <ContestProgressSummary contest={contest} className="mt-2" />
            {contest.progress ? (
              <div className="mt-3">
                <VideosFiled progress={contest.progress} />
              </div>
            ) : null}
            {contest.entry?.decisionNote ? (
              <p className="text-muted mt-2 text-[0.8125rem]">{contest.entry.decisionNote}</p>
            ) : null}
          </div>
        ) : null}

        {/* ------------------------------------------------------ facts -- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Fact icon={<Store size={14} aria-hidden />} label="Brand">
            {contest.brand?.name ?? 'Unknown brand'}
          </Fact>
          <Fact icon={<Ticket size={14} aria-hidden />} label="Entries">
            {door === 'open'
              ? 'Open to enter'
              : door === 'off'
                ? 'Not running'
                : door === 'settled'
                  ? 'Settled'
                  : door === 'cancelled'
                    ? 'Cancelled'
                    : 'Closed'}
          </Fact>
          <Fact icon={<UserRound size={14} aria-hidden />} label="Approved by">
            {contest.needsAdminApproval ? 'The Wurx team' : 'Nobody, it is automatic'}
          </Fact>
          {/* The exact moment, in the zone the admin set it in. Rule L6: a
              deadline that renders in the reader's zone closes at three
              different times for three people. */}
          <Fact icon={<Ticket size={14} aria-hidden />} label="Deadline">
            {formatDeadline(contest.expiresAt, contest.expiresAtTimezone)}
          </Fact>
        </div>

        {/* ---------------------------------------------------- why join -- */}
        {perks.length > 0 ? (
          <div>
            <Eyebrow>Why join</Eyebrow>
            <ul className="mt-2 flex flex-col gap-1.5">
              {perks.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check size={14} aria-hidden className="text-accent mt-0.5 shrink-0" />
                  <span className="text-muted text-[0.8125rem] leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {contest.products.length > 0 ? (
          <p className="text-muted text-[0.8125rem] leading-relaxed">
            <span className="text-text font-semibold">Products: </span>
            {contest.products.map((p) => p.productName).join(', ')}
          </p>
        ) : null}

        {contest.briefUrl ? (
          <a
            href={contest.briefUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent inline-flex min-h-[2.75rem] items-center gap-1.5 self-start text-[0.8125rem] font-semibold hover:underline sm:min-h-0 pointer-coarse:min-h-[2.75rem]"
          >
            Read the full brief
            <ExternalLink size={13} aria-hidden />
          </a>
        ) : null}

        {/* Her private target, and pulling out. Both only while she is in and
            the contest can still take a change. */}
        {inIt && contest.entry && !contest.settledAt && !contest.cancelledAt ? (
          <div className="border-line flex flex-col gap-2 border-t pt-3">
            <TargetControl entryId={contest.entry.id} target={contest.target} />
            <WithdrawEntry contest={contest} />
          </div>
        ) : null}
      </div>
    </details>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-faint text-[0.625rem] font-semibold tracking-[0.14em] uppercase">
      {children}
    </p>
  );
}

/** One labelled fact. */
function Fact({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="wx-neo-inset text-accent mt-0.5 grid size-6 shrink-0 place-items-center rounded-full">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-faint block text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
          {label}
        </span>
        <span className="text-text mt-0.5 block text-[0.8125rem] font-medium break-words">
          {children}
        </span>
      </span>
    </div>
  );
}
