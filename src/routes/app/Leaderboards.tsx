import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Trophy } from 'lucide-react';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { CreatorFace } from '@/components/work/CreatorFace';
import { DataError, EmptyState } from '@/components/ui/DataState';
import {
  BOARD_PAGE,
  useBoardFaces,
  useLeaderboard,
  useMyStanding,
  type LeaderboardRow,
  type MyStanding,
} from '@/lib/creator/useLeaderboard';
import { cn } from '@/lib/utils';
import { NeoCardSkeleton } from '@/components/brand/NeoSkeleton';

/**
 * The leaderboard: what every creator's videos have actually sold.
 *
 * THE NUMBER IS GMV, AND ONLY GMV. Rashid, unprompted and twice: "please make
 * sure that money means gmv here not money we need to show creators the gmv of
 * their own and also of other creators." Nothing on this screen is a payment,
 * a reward or a fee, and none of those words appear on it.
 *
 * IT AMENDS D7, and only here. The contest standing stays anonymous; this one
 * never made that promise, and Rashid chose names and figures.
 *
 * ONLY CREATORS WITH REAL FIGURES APPEAR. A zero here does not mean "sold
 * nothing", it means "not measured yet", so somebody not on the board is told
 * so, warmly, at the top, instead of being shown a rank of nothing.
 *
 * THE SHAPE: a band saying where you stand, a podium for the top three with
 * first place raised, then a searchable ranked list with a bar behind each
 * figure. Every colour is a `--wx-*` token and every size a rem.
 *
 * NO BORDERS. Edges are carried by the neomorphic shadows, per house rules.
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
 * A board that ranks dollars against pounds under one symbol is not a ranking.
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

const videosLabel = (n: number) => `${n} ${n === 1 ? 'video' : 'videos'}`;

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

  // Moving between brands must reset paging, or page 3 of a wide board opens
  // as an empty page on a narrow one.
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

  // Whoever sits one place above the viewer, when that person is on this page.
  // Never invented: if they are on another page there is simply no line.
  const above =
    mine.data && mine.data.rank > 1
      ? (rows.find((r) => r.rank === mine.data!.rank - 1) ?? null)
      : null;

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
            className="wx-neo-inset placeholder:text-faint focus-visible:ring-accent/50 h-10 w-full rounded-md pr-3 pl-9 text-[0.875rem] focus:outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
          />
        </div>
      </FilterBar>

      <YourStanding
        standing={mine.data ?? null}
        loading={mine.isPending}
        failed={mine.isError}
        onRetry={() => mine.refetch()}
        above={above}
      />

      {board.isPending ? (
        <div className="flex flex-col gap-3">
          <NeoCardSkeleton className="h-40" />
          <NeoCardSkeleton className="h-64" />
        </div>
      ) : board.isError ? (
        <DataError
          title="We could not load the board"
          body="Something went wrong on our side, not yours. The board has not changed."
          onRetry={() => board.refetch()}
        />
      ) : rows.length === 0 ? (
        search.trim() ? (
          <EmptyState
            title="Nobody by that name"
            body="Try part of a handle instead."
            className="w-full"
          />
        ) : (
          <EmptyState
            title="The board is empty for now"
            body="Creators appear here once ads start running behind their approved videos. When yours do, you will see your place on it straight away."
            className="w-full"
          />
        )
      ) : (
        <>
          {podium.length === 3 ? <Podium rows={podium} faces={faces} /> : null}
          {listed.length > 0 || pages > 1 ? (
            <Board
              rows={listed}
              faces={faces}
              best={rows[0]?.gmv ?? 0}
              page={page}
              pages={pages}
              onPage={setPage}
              fetching={board.isFetching}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------- where you stand -- */

function YourStanding({
  standing,
  loading,
  failed,
  onRetry,
  above,
}: {
  standing: MyStanding | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => Promise<unknown>;
  above: LeaderboardRow | null;
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

  /*
   * NOT ON IT YET IS A REAL STATE, not an error and not a zero. A creator whose
   * videos have no figures is deliberately absent from the board, so this says
   * why and what changes it, rather than showing them a rank of nothing.
   */
  if (!standing) {
    return (
      <EmptyState
        title="You are not on the board yet"
        body="You appear here once ads start running behind an approved video, and your GMV counts from the first day they do."
        className="w-full"
      />
    );
  }

  const gap = above ? above.gmv - standing.gmv : 0;

  /*
   * ONE LINE OF MOTIVATION, from real figures only. The percentile is only
   * worth saying while it is worth hearing, so it appears in the top half and
   * is otherwise left out. Nobody is told they are in the bottom anything.
   */
  const line =
    standing.rank === 1
      ? 'You are leading the board'
      : above && gap > 0
        ? `${gmv(gap, standing.currency)} of GMV to pass ${above.display_name ?? 'the creator above you'}`
        : null;

  const tiles: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Your GMV', value: gmvExact(standing.gmv, standing.currency), strong: true },
  ];
  if (standing.orders > 0)
    tiles.push({ label: 'Orders', value: standing.orders.toLocaleString() });
  if (standing.spend > 0) {
    tiles.push({
      label: 'Return on spend',
      value: `${(standing.gmv / standing.spend).toFixed(2)}x`,
    });
  }

  return (
    <section className="wx-neo-raised relative overflow-hidden rounded-xl p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(120% 200% at 0% 0%, color-mix(in srgb, var(--wx-accent) 14%, transparent) 0%, transparent 60%)',
        }}
      />
      <div className="relative grid items-center gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex items-center gap-4">
          <span className="wx-neo-inset text-accent grid size-14 shrink-0 place-items-center rounded-full">
            <Trophy size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[1.25rem] font-extrabold">
              You are <span className="wx-numeric font-mono">#{standing.rank}</span> of{' '}
              <span className="wx-numeric font-mono">{standing.total_creators}</span>
            </p>
            <p className="text-muted mt-0.5 text-[0.875rem]">
              {standing.top_percent <= 50
                ? `Top ${standing.top_percent}% of creators, on `
                : 'On '}
              {videosLabel(standing.videos)}
            </p>
            {line ? (
              <p className="text-accent mt-1 text-[0.8125rem] font-semibold">{line}</p>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2.5">
          {tiles.map((t) => (
            <div key={t.label} className="wx-neo-inset rounded-md px-3.5 py-3">
              <dt className="text-muted font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
                {t.label}
              </dt>
              <dd
                className={cn(
                  'wx-numeric mt-1 font-mono font-extrabold',
                  t.strong ? 'text-accent text-[1.5rem]' : 'text-[1.125rem]'
                )}
              >
                {t.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- the podium -- */

/**
 * First place raised, second and third either side.
 *
 * ON A PHONE IT STOPS BEING A PODIUM and becomes three stacked cards, in rank
 * order: a vertical list starting with second place reads as second place
 * winning, which is the one thing this screen must never say.
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
              'wx-neo-raised relative rounded-xl p-5 pt-6 text-center',
              isFirst && 'sm:pb-8',
              // 2-1-3 side by side, 1-2-3 stacked.
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
              {row.is_me ? <span className="text-muted font-semibold"> · you</span> : null}
            </p>
            <p className="text-muted mt-0.5 text-[0.75rem]">{videosLabel(row.videos)}</p>

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
    <section className="wx-neo-raised overflow-hidden rounded-xl p-2">
      {/* A header row only where there is room for one. Below `sm` the videos
          count folds under the name so nothing pushes the page sideways. */}
      <div className="text-muted hidden px-3 py-2.5 font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase sm:grid sm:grid-cols-[3rem_minmax(0,1fr)_6rem_9rem] sm:gap-4">
        <span>Rank</span>
        <span>Creator</span>
        <span className="text-right">Videos</span>
        <span className="text-right">GMV</span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li
            key={row.creator_id}
            className={cn(
              'relative overflow-hidden rounded-md px-3 py-2.5',
              row.is_me ? 'bg-accent-soft outline-accent outline-2' : 'wx-neo-inset'
            )}
          >
            {/* The bar sits behind the row, proportional to the leader, so the
                shape of the board reads at a glance without a single number. */}
            <div
              aria-hidden
              className="bg-accent/10 pointer-events-none absolute inset-y-0 left-0"
              style={{ width: `${best > 0 ? Math.max(2, (row.gmv / best) * 100) : 0}%` }}
            />

            <div className="relative grid min-h-11 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[3rem_minmax(0,1fr)_6rem_9rem] sm:gap-4">
              <span className="wx-numeric text-muted font-mono text-[0.875rem] font-bold">
                {String(row.rank).padStart(2, '0')}
              </span>

              <span className="flex min-w-0 items-center gap-2.5">
                <CreatorFace
                  src={row.avatar_path ? faces[row.avatar_path] : undefined}
                  name={row.display_name}
                  size={36}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[0.875rem] font-semibold">
                    {row.display_name ?? 'A creator'}
                    {row.is_me ? <span className="text-accent"> · you</span> : null}
                  </span>
                  <span className="text-muted block text-[0.75rem] sm:hidden">
                    {videosLabel(row.videos)}
                  </span>
                </span>
              </span>

              <span className="wx-numeric text-muted hidden text-right font-mono text-[0.875rem] sm:block">
                {row.videos}
              </span>
              <span className="wx-numeric text-right font-mono text-[1rem] font-extrabold">
                {gmv(row.gmv, row.currency)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 px-1 pt-3 pb-1">
          <button
            type="button"
            disabled={page === 0 || fetching}
            onClick={() => onPage(Math.max(0, page - 1))}
            className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-[0.8125rem] font-semibold disabled:opacity-30"
          >
            <ChevronLeft size={15} aria-hidden />
            Back
          </button>
          <span className="wx-numeric text-muted font-mono text-[0.75rem]">
            {page + 1} of {pages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pages || fetching}
            onClick={() => onPage(page + 1)}
            className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-[0.8125rem] font-semibold disabled:opacity-30"
          >
            Next
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  );
}
