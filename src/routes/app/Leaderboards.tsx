import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Trophy } from 'lucide-react';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { CreatorFace } from '@/components/work/CreatorFace';
import {
  BOARD_PAGE,
  useBoardFaces,
  useLeaderboard,
  useMyStanding,
  type LeaderboardRow,
} from '@/lib/creator/useLeaderboard';
import { cn } from '@/lib/utils';
import { NeoCardSkeleton } from '@/components/brand/NeoSkeleton';

/**
 * The leaderboard: what every creator's videos have actually sold.
 *
 * THE NUMBER IS GMV, AND ONLY GMV. Rashid, unprompted and twice: "please make
 * sure that money means gmv here not money we need to show creators the gmv of
 * their own and also of other creators." Nothing on this screen is a payment,
 * a reward or a fee, and none of those words appear on it. What somebody is
 * paid is on their own home screen and is nobody else's business.
 *
 * IT AMENDS D7, and only here. The contest standing stays anonymous, because
 * that screen promises in words that nobody can see who anybody else is. This
 * one never made that promise, and Rashid chose names and figures when asked
 * in exactly those terms.
 *
 * ONLY CREATORS WITH REAL FIGURES APPEAR, which was the other half of that
 * decision. Today only one brand has ad data, so a board that showed everybody
 * would be three quarters zeros, and a zero here does not mean "sold nothing",
 * it means "not measured yet". Somebody not on it is told so, warmly, at the
 * top.
 *
 * THE SHAPE IS FROM `MY UI/LeaderBoard/`: a band saying where you stand, a
 * podium for the top three with first place raised, then a searchable ranked
 * table with a bar behind each figure. The COLOURS are not: that file is a
 * purple Material palette with Sora type and hardcoded hex, which would fail
 * `pnpm check:contrast` on the first run. Every colour here is a `--wx-*`
 * token and every size is a rem, so it scales with the top bar control like
 * the rest of the signed-in app.
 */

/** All time is the default, because "who has sold the most" is not a fortnight. */
const RANGES = [
  { key: 'all', label: 'All time', from: '2000-01-01' },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: '30', label: 'Last 30 days', days: 30 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/*
 * A NULL CURRENCY MEANS THE SUM SPANS MORE THAN ONE, so it gets no symbol.
 * `private.leaderboard_totals` returns null rather than picking one off the
 * set (20260820230000), because a board that ranks dollars against pounds under
 * one symbol is not a ranking. USD only is the decision; this is what makes the
 * day it changes visible instead of silent.
 */
const fmt = (n: number, currency: string | null, digits: number) =>
  currency
    ? new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: digits,
      }).format(n)
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n);

const gmv = (n: number, currency: string | null) => fmt(n, currency, 0);
const gmvExact = (n: number, currency: string | null) => fmt(n, currency, 2);

/**
 * `brandId` renders this board inside a Brand Hub, ranked among that brand's
 * own creators on that brand's money. The rank is computed inside the brand by
 * the RPC, not filtered from a global one.
 */
export function Leaderboards({ brandId }: { brandId?: string } = {}) {
  const [range, setRange] = useState<RangeKey>('all');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { from, to } = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    return { from: 'days' in r ? daysAgo(r.days) : r.from, to: today() };
  }, [range]);

  // Moving between brands (or ranges) must reset paging, or page 3 of a wide
  // board opens as an empty page on a narrow one.
  useEffect(() => {
    setPage(0);
  }, [brandId]);

  const board = useLeaderboard(from, to, page, search, brandId);
  const mine = useMyStanding(from, to, brandId);

  const rows = board.data ?? [];
  const total = rows[0]?.total_creators ?? mine.data?.total_creators ?? 0;
  const pages = Math.max(1, Math.ceil(total / BOARD_PAGE));

  const faces = useBoardFaces(rows.map((r) => r.avatar_path));

  /*
   * The podium is the first three of the FIRST page, and only when nobody is
   * searching. A podium built from a filtered list would show "#1" against
   * whoever happens to match, which is a lie told confidently.
   */
  const showPodium = page === 0 && !search.trim() && rows.length >= 3;
  const podium = showPodium ? rows.slice(0, 3) : [];
  const listed = showPodium ? rows.slice(3) : rows;

  const change = (next: RangeKey) => {
    setRange(next);
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <FilterTabs label="Over what period">
          {RANGES.map((r) => (
            <FilterTab key={r.key} active={range === r.key} onClick={() => change(r.key)}>
              {r.label}
            </FilterTab>
          ))}
        </FilterTabs>

        <div className="relative min-w-0 flex-1 basis-52">
          <Search
            size={15}
            aria-hidden
            className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            type="search"
            name="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Find a creator"
            aria-label="Find a creator"
            className="wx-neo-inset placeholder:text-faint focus-visible:ring-accent/50 h-10 w-full rounded-md pr-3 pl-9 text-[0.875rem] focus:outline-none focus-visible:ring-2"
          />
        </div>
      </FilterBar>

      <YourStanding standing={mine.data ?? null} loading={mine.isPending} />

      {board.isPending ? (
        <div className="flex flex-col gap-3">
          <NeoCardSkeleton className="h-40" />
          <NeoCardSkeleton className="h-64" />
        </div>
      ) : board.error ? (
        <p role="alert" className="text-danger text-[0.875rem]">
          {(board.error as Error).message}
        </p>
      ) : rows.length === 0 ? (
        <div className="wx-neo-raised rounded-xl p-8 text-center">
          <p className="text-[1.0625rem] font-bold">
            {search.trim() ? 'Nobody by that name' : 'The board is empty for now'}
          </p>
          <p className="text-muted mx-auto mt-1.5 max-w-prose text-[0.875rem] leading-relaxed">
            {search.trim()
              ? 'Try part of a handle instead.'
              : 'Creators appear here once ads start running behind their approved videos.'}
          </p>
        </div>
      ) : (
        <>
          {podium.length === 3 ? <Podium rows={podium} faces={faces} /> : null}
          <Board
            rows={listed}
            faces={faces}
            best={rows[0]?.gmv ?? 0}
            page={page}
            pages={pages}
            onPage={setPage}
            fetching={board.isFetching}
          />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------- where you stand -- */

function YourStanding({
  standing,
  loading,
}: {
  standing: import('@/lib/creator/useLeaderboard').MyStanding | null;
  loading: boolean;
}) {
  if (loading) return <NeoCardSkeleton className="h-24" />;

  /*
   * NOT ON IT YET IS A REAL STATE, not an error and not a zero. A creator whose
   * videos have no figures is deliberately absent from the board, so this says
   * why and what changes it, rather than showing them a rank of nothing.
   */
  if (!standing) {
    return (
      <section className="wx-neo-raised rounded-xl p-5">
        <p className="text-[1.0625rem] font-bold">You are not on the board yet</p>
        <p className="text-muted mt-1 max-w-prose text-[0.875rem] leading-relaxed">
          You appear here once ads start running behind a video the team has approved, and your
          GMV starts counting from the first day they do.
        </p>
      </section>
    );
  }

  return (
    <section className="wx-neo-raised relative overflow-hidden rounded-xl p-5">
      {/* A single wash of the brand accent, behind the numbers rather than on
          them. The design's glow is a purple shadow; ours is the accent we
          already have, at a strength that survives both themes. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(120% 200% at 0% 0%, color-mix(in srgb, var(--wx-accent) 14%, transparent) 0%, transparent 60%)',
        }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex items-center gap-4">
          <span className="wx-neo-inset text-accent grid size-14 shrink-0 place-items-center rounded-full">
            <Trophy size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[1.25rem] font-extrabold">
              You are <span className="wx-numeric font-mono">#{standing.rank}</span> of{' '}
              <span className="wx-numeric font-mono">{standing.total_creators}</span>
            </p>
            {/*
              "TOP 100% OF CREATORS" IS TRUE AND UNKIND, which is what last
              place read before this. A percentile is only worth saying while
              it is worth hearing, so it appears in the top half and the count
              of videos carries the line the rest of the time. Nobody is told
              they are in the bottom anything.
            */}
            <p className="text-muted mt-0.5 text-[0.875rem]">
              {standing.top_percent <= 50
                ? `Top ${standing.top_percent}% of creators, on `
                : 'On '}
              {standing.videos} {standing.videos === 1 ? 'video' : 'videos'}
            </p>
          </div>
        </div>

        <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <Stat label="Your GMV" value={gmvExact(standing.gmv, standing.currency)} strong />
          <Stat label="Orders" value={standing.orders.toLocaleString()} />
          <Stat
            label="Return on spend"
            value={standing.spend > 0 ? `${(standing.gmv / standing.spend).toFixed(2)}x` : '—'}
          />
        </dl>
      </div>
    </section>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-muted font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'wx-numeric mt-1 font-mono font-extrabold',
          strong ? 'text-accent text-[1.5rem]' : 'text-[1.125rem]'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------- the podium -- */

/**
 * First place raised, second and third either side, exactly as in the design.
 *
 * ON A PHONE IT STOPS BEING A PODIUM and becomes three stacked cards, because a
 * three-column podium at 375px gives each face about ninety pixels and the
 * names wrap to three lines. When they stack they are reordered to 1-2-3: a
 * vertical list starting with second place reads as second place winning,
 * which is the one thing this screen must never say.
 */
function Podium({ rows, faces }: { rows: LeaderboardRow[]; faces: Record<string, string> }) {
  const [second, first, third] = [rows[1]!, rows[0]!, rows[2]!];
  const order = [second, first, third];

  return (
    <section aria-label="Top three creators" className="grid gap-3 sm:grid-cols-3 sm:items-end">
      {order.map((row) => {
        const isFirst = row.rank === 1;
        return (
          <article
            key={row.creator_id}
            className={cn(
              'wx-neo-raised relative rounded-xl p-5 text-center',
              isFirst && 'sm:pb-7',
              /*
                A PODIUM IS 2-1-3 SIDE BY SIDE AND 1-2-3 STACKED. The DOM order
                is the podium, because that is what it has to be when the three
                sit next to each other. Stacked on a phone that reads as second
                place winning, so `order` puts them back into rank order there
                and hands it back at `sm`.
              */
              isFirst ? 'order-first sm:order-none' : '',
              row.rank === 3 ? 'order-last sm:order-none' : '',
              row.is_me && 'outline-accent outline-2'
            )}
          >
            <span
              className={cn(
                'absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 font-mono text-[0.6875rem] font-bold',
                isFirst
                  ? 'wx-neo-raised-sm bg-accent! text-on-accent'
                  : 'wx-neo-raised-sm text-muted'
              )}
            >
              #{row.rank}
            </span>

            <div className="flex justify-center pt-1.5">
              <CreatorFace
                src={row.avatar_path ? faces[row.avatar_path] : undefined}
                name={row.display_name}
                size={isFirst ? 80 : 60}
                className={isFirst ? 'ring-accent ring-2' : ''}
              />
            </div>

            <p
              className={cn(
                'mt-3 truncate font-extrabold',
                isFirst ? 'text-accent text-[1.125rem]' : 'text-[1rem]'
              )}
            >
              {row.display_name ?? 'A creator'}
            </p>
            <p className="text-faint mt-0.5 text-[0.75rem]">
              {row.videos} {row.videos === 1 ? 'video' : 'videos'}
            </p>

            <p
              className={cn(
                'wx-neo-inset wx-numeric mt-3 rounded-md py-2 font-mono font-extrabold',
                isFirst ? 'text-accent text-[1.375rem]' : 'text-[1.0625rem]'
              )}
            >
              {gmv(row.gmv, row.currency)}
            </p>
          </article>
        );
      })}
    </section>
  );
}

/* -------------------------------------------------------------- the board -- */

function Board({
  rows,
  faces,
  best,
  page,
  pages,
  onPage,
  fetching,
}: {
  rows: LeaderboardRow[];
  faces: Record<string, string>;
  best: number;
  page: number;
  pages: number;
  onPage: (n: number) => void;
  fetching: boolean;
}) {
  return (
    <section className="wx-neo-raised overflow-hidden rounded-xl">
      {/*
        A HEADER ROW ONLY WHERE THERE IS ROOM FOR ONE. Below `sm` every row
        becomes a stacked card, per the responsive rule: a five column table at
        375px either scrolls the page sideways or shrinks the figure to
        nothing, and the figure is the entire point of the screen.
      */}
      <div className="text-muted border-line hidden border-b px-4 py-2.5 font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase sm:grid sm:grid-cols-[3.5rem_1fr_7rem_9rem] sm:gap-4">
        <span>Rank</span>
        <span>Creator</span>
        <span className="text-right">Videos</span>
        <span className="text-right">GMV</span>
      </div>

      <ul>
        {rows.map((row) => (
          <li
            key={row.creator_id}
            className={cn(
              'border-line relative border-b px-4 py-3 last:border-b-0',
              row.is_me && 'bg-accent-soft/40'
            )}
          >
            {/*
              THE BAR IS BEHIND THE ROW, not a column of its own. It is
              proportional to the leader, so the shape of the board is readable
              at a glance without reading a single number, and it never
              competes with the figure for space on a phone.
            */}
            <div
              aria-hidden
              className="bg-accent/10 pointer-events-none absolute inset-y-0 left-0"
              style={{ width: `${best > 0 ? Math.max(2, (row.gmv / best) * 100) : 0}%` }}
            />

            <div className="relative flex items-center gap-3 sm:grid sm:grid-cols-[3.5rem_1fr_7rem_9rem] sm:gap-4">
              <span className="wx-numeric text-muted shrink-0 font-mono text-[0.875rem] font-bold">
                {String(row.rank).padStart(2, '0')}
              </span>

              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <CreatorFace
                  src={row.avatar_path ? faces[row.avatar_path] : undefined}
                  name={row.display_name}
                  size={32}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[0.875rem] font-semibold">
                    {row.display_name ?? 'A creator'}
                    {row.is_me ? <span className="text-accent"> · you</span> : null}
                  </span>
                  {/* On a phone the two right columns fold under the name. */}
                  <span className="text-faint block text-[0.75rem] sm:hidden">
                    {row.videos} {row.videos === 1 ? 'video' : 'videos'} ·{' '}
                    <span className="wx-numeric text-text font-mono font-bold">
                      {gmv(row.gmv, row.currency)}
                    </span>
                  </span>
                </span>
              </span>

              <span className="wx-numeric text-muted hidden text-right font-mono text-[0.875rem] sm:block">
                {row.videos}
              </span>
              <span className="wx-numeric hidden text-right font-mono text-[1rem] font-extrabold sm:block">
                {gmv(row.gmv, row.currency)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 ? (
        <div className="border-line flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            disabled={page === 0 || fetching}
            onClick={() => onPage(Math.max(0, page - 1))}
            className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 text-[0.8125rem] font-semibold disabled:opacity-30"
          >
            <ChevronLeft size={15} aria-hidden />
            Back
          </button>
          <span className="wx-numeric text-faint font-mono text-[0.75rem]">
            {page + 1} of {pages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pages || fetching}
            onClick={() => onPage(page + 1)}
            className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 text-[0.8125rem] font-semibold disabled:opacity-30"
          >
            Next
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  );
}
