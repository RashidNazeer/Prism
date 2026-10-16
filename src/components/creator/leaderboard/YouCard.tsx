import { ArrowDownRight, ArrowRight, ArrowUpRight, Trophy } from 'lucide-react';
import { DeltaChip, SparkArea, type ChartPoint } from '@/components/charts';
import { DataError } from '@/components/ui/DataState';
import { NeoCardSkeleton } from '@/components/brand/NeoSkeleton';
import { cn } from '@/lib/utils';
import type { LeaderboardRow, MyStanding } from '@/lib/creator/useLeaderboard';
import { faceMoney, num, placesMoved, tipMoney, videosLabel } from './board-kit';

/**
 * WHERE SHE STANDS — the centre of this screen, not the top of the board.
 *
 * IT IS THE ONE BLURRED PAGE LAYER. Everything else here is `wx-neo-raised-sm`:
 * the same glass with no `backdrop-filter`. This card is sticky, so it is the
 * only surface the page genuinely scrolls underneath, which is where the
 * stylesheet says blur earns its cost — and it keeps the screen inside the
 * three-layer budget (chrome, the filter bar, this).
 *
 * GMV ONLY. §7 keeps the five money words off this screen entirely, and the
 * figure here is the GMV her videos sold — nothing else.
 *
 * NOT ON THE BOARD IS A REAL STATE, not an error and not a zero. A creator
 * whose videos have no figures yet is deliberately absent rather than ranked
 * last on nothing, so the card says what changes that.
 */
export function YouCard({
  standing,
  previous,
  comparable,
  above,
  series,
  currency,
  loading,
  failed,
  onRetry,
}: {
  standing: MyStanding | null;
  /** Her standing over the window before this one, or null if she had none. */
  previous: MyStanding | null;
  /** False for "All time", which has no period before it to compare with. */
  comparable: boolean;
  /** Whoever is one place above her, when the board can name them. */
  above: LeaderboardRow | null;
  /** Her own GMV day by day. Empty means we have no figures to draw. */
  series: ChartPoint[];
  currency: string | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => Promise<unknown>;
}) {
  if (loading) return <NeoCardSkeleton className="h-28" />;

  // A failed load must never read as "you are not on the board".
  if (failed) {
    return (
      <DataError
        title="We could not load your place"
        body="Something went wrong on our side, not yours. Try again in a moment."
        onRetry={onRetry}
        className="w-full"
      />
    );
  }

  if (!standing) {
    return (
      <section className="wx-neo-raised rounded-xl p-4">
        <p className="text-[0.9375rem] font-semibold">
          Make your first sale to join the board.
        </p>
        <p className="text-muted mt-1 text-[0.8125rem]">
          You appear here as soon as an approved video starts selling, and your GMV counts from
          the first day it does.
        </p>
      </section>
    );
  }

  const mine = num(standing.gmv) ?? 0;
  const target = above ? num(above.gmv) : null;
  const gap = target === null ? null : target - mine;
  const moved = comparable ? placesMoved(standing.rank, previous?.rank) : null;
  // How far along she is between nothing and the figure above her. Never 0%
  // wide, so the track always shows which way the bar grows.
  const share = target && target > 0 ? Math.max(2, Math.min(100, (mine / target) * 100)) : null;

  return (
    <section
      aria-label="Where you stand"
      className="wx-neo-raised relative overflow-hidden rounded-xl p-3 sm:p-4"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(120% 200% at 0% 0%, color-mix(in srgb, var(--wx-accent) 14%, transparent) 0%, transparent 60%)',
        }}
      />

      {/*
        TWO COLUMNS AT EVERY WIDTH, not stacked on a phone. This card is
        sticky, so every extra row it takes is a row of the board she cannot
        see; the rank and the figure sitting side by side keep it to about
        6rem at 375px.
      */}
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-x-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* Hidden below `sm`, where the 2.75rem well is width the figures
              need more than the card needs an emblem. */}
          <span className="wx-neo-inset text-accent hidden size-11 shrink-0 place-items-center rounded-full sm:grid">
            <Trophy size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[1.0625rem] leading-tight font-extrabold sm:text-[1.1875rem]">
              You are <span className="wx-numeric font-mono">#{standing.rank}</span>
              <span className="text-muted font-semibold">
                {' '}
                of <span className="wx-numeric font-mono">{standing.total_creators}</span>
              </span>
            </p>
            <p className="text-muted mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem]">
              <span>
                {standing.top_percent <= 50 ? `Top ${standing.top_percent}% · ` : ''}
                {videosLabel(standing.videos)}
              </span>
              {/* `px-0`: it sits in a line of text here, not on its own. */}
              <MovedChip places={moved} className="px-0" />
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1 sm:justify-start">
            <p
              title={tipMoney(standing.gmv, standing.currency)}
              className="wx-numeric text-accent font-mono text-[1.375rem] font-extrabold sm:text-[1.5rem]"
            >
              {faceMoney(standing.gmv, standing.currency)}
            </p>
            <span className="text-muted font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
              your GMV
            </span>
            {comparable ? (
              <DeltaChip
                now={num(standing.gmv)}
                before={previous ? num(previous.gmv) : null}
                suffix="vs before"
              />
            ) : null}
          </div>

          {/* The trend is HERS, from her own daily rows — the only day-by-day
              series this screen can honestly draw. Hidden on a phone to keep
              the sticky card short; the figures above it carry the same story
              at that width. */}
          <SparkArea
            data={series}
            token="--chart-1"
            currency={currency}
            height="2.75rem"
            ariaLabel="Your GMV day by day over the selected period"
            className="mt-1 hidden sm:block"
          />
        </div>
      </div>

      {standing.rank === 1 ? (
        <p className="text-accent relative mt-3 text-[0.8125rem] font-semibold">
          You are leading the board.
        </p>
      ) : gap !== null && above && share !== null ? (
        <div className="relative mt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-[0.8125rem] font-semibold">
              <span className="text-accent">{faceMoney(gap, standing.currency)} GMV</span>
              <span className="text-muted"> to pass </span>
              <span className="wx-numeric font-mono">#{above.rank}</span>
            </p>
            <p className="text-faint truncate text-[0.75rem]">
              {above.display_name ?? 'the creator above you'}
            </p>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share)}
            aria-label={`Your GMV is ${Math.round(share)}% of the creator one place above you`}
            className="wx-neo-inset mt-1.5 h-1.5 overflow-hidden rounded-full"
          >
            <div className="bg-accent h-full rounded-full" style={{ width: `${share}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * HOW MANY PLACES SHE MOVED, in words and with an arrow.
 *
 * NEVER COLOUR ALONE, like `DeltaChip`: the arrow and the word carry it. No
 * chip at all when there is nothing to compare with — a creator who was not
 * measured last period has not "stayed level", and printing 0 would say she
 * had.
 */
function MovedChip({ places, className }: { places: number | null; className?: string }) {
  if (places === null) return null;

  const up = places > 0;
  const down = places < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : ArrowRight;
  const n = Math.abs(places);
  const word = n === 1 ? 'place' : 'places';
  const said = up ? `up ${n} ${word}` : down ? `down ${n} ${word}` : 'level';

  return (
    <span
      title="Against the period before this one"
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
        up ? 'text-success' : down ? 'text-danger' : 'text-muted',
        className
      )}
    >
      <Icon aria-hidden className="size-3" />
      {said}
    </span>
  );
}
