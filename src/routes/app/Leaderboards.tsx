import { useEffect, useMemo, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { CreatorSearch } from '@/components/creator/SearchField';
import { BrandFilter } from '@/components/creator/BrandFilter';
import { DataError, EmptyState } from '@/components/ui/DataState';
import { NeoCardSkeleton } from '@/components/brand/NeoSkeleton';
import {
  BOARD_PAGE,
  useBoardFaces,
  useLeaderboard,
  useMyStanding,
} from '@/lib/creator/useLeaderboard';
import { useBrandPerformance, useDailyPerformance } from '@/lib/creator/usePerformance';
import { previousWindow } from '@/lib/creator/daily-totals';
import { BoardList } from '@/components/creator/leaderboard/BoardList';
import { Podium } from '@/components/creator/leaderboard/Podium';
import { YouCard } from '@/components/creator/leaderboard/YouCard';
import {
  ALL_TIME_FROM,
  RANGES,
  dailyGmvSeries,
  num,
  rangeWindow,
  useBoardSlice,
  windowLabel,
  type BoardItem,
  type RangeKey,
} from '@/components/creator/leaderboard/board-kit';

/**
 * Leaderboards: what every creator's videos have actually sold.
 *
 * THE NUMBER IS GMV, AND ONLY GMV. Rashid, unprompted and twice: "please make
 * sure that money means gmv here not money we need to show creators the gmv of
 * their own and also of other creators." Nothing on this screen is a payment, a
 * reward or a fee, and none of those words appears on it.
 *
 * IT AMENDS D7, and only here. The contest standing stays anonymous; this one
 * never made that promise, and Rashid chose names and figures.
 *
 * ONLY CREATORS WITH REAL FIGURES APPEAR. A zero here would not mean "sold
 * nothing", it would mean "not measured yet", so somebody not on the board is
 * told so in the line at the bottom instead of being shown a rank of nothing.
 *
 * THE SHAPE, after the redesign (§7): filter chips, then a podium for the top
 * three with first place raised, then a STICKY card for her own place — which
 * is the centre of this screen, not the top of the board — then the board from
 * rank four down. If she is below the first page, the list folds: the top ten,
 * a divider that says how many it stands for, then the two rows either side of
 * her and her own row.
 *
 * GLASS LAYERING, deliberately flatter than one panel per section. The sticky
 * "You" card is the ONE `wx-neo-raised` on the page, because it is the only
 * surface the page genuinely scrolls underneath; the podium and the board wear
 * `wx-neo-raised-sm`, the same material with no `backdrop-filter`, and the rows
 * inside them are `wx-neo-inset`. That keeps the whole screen inside the
 * three-layer blur budget at phone width (the app chrome, the filter bar, this
 * card) at every scroll position, instead of only at scroll 0 where the guard
 * measures. Nothing here adds a `backdrop-filter` of its own and nothing nests
 * one.
 *
 * WHAT THE DATA CANNOT DO. §7.4 asks for a per-creator sparkline and a rank
 * change arrow on every row. `creator_leaderboard` returns one total per
 * creator and no previous rank, and §7 says to show the board without those
 * pieces rather than change an RPC or invent them — so a row carries a
 * share-of-the-leader bar instead, and the only rank change on the screen is
 * HERS, which is exact: `my_leaderboard_standing` is asked for the window
 * before this one. The only day-by-day line is hers too, from
 * `creator_daily_performance`, which filters on the same approved videos the
 * board ranks, so the sparkline and the GMV beside it are the same figure.
 *
 * NO BORDERS. Edges are carried by the neomorphic shadows, per house rules.
 */

/** How much of the top stays visible when the list folds around her. §7.5 */
const TOP_SHOWN = 10;

/**
 * `brandId` renders this board inside a Brand Hub, ranked among that brand's
 * own creators on that brand's money. The rank is computed inside the brand by
 * the RPC, not filtered from a global one.
 */
export function Leaderboards({ brandId }: { brandId?: string } = {}) {
  /* ALL TIME IS THE DEFAULT, because "who has sold the most" is not a
     fortnight. The other two chips are §7.1's own words. */
  const [range, setRange] = useState<RangeKey>('all');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);
  const quiet = useReducedMotion();

  // Moving between brands must reset paging, or page 3 of a wide board opens
  // as an empty page on a narrow one.
  useEffect(() => {
    setPage(0);
  }, [brandId]);

  /** Inside a hub the brand is fixed; outside it, it is the filter chip. */
  const scope = brandId ?? pickedBrand ?? undefined;

  const win = useMemo(() => rangeWindow(range), [range]);
  /*
   * THE WINDOW BEFORE THIS ONE, for her rank change and her GMV delta.
   *
   * "All time" has no period before it, so it asks for the SAME window — which
   * is the identical query key and therefore not a second request at all — and
   * `comparable` tells the card to show no comparison.
   */
  const previous = useMemo(() => (range === 'all' ? win : previousWindow(win)), [range, win]);

  const board = useLeaderboard(win.from, win.to, page, search, scope);
  const mine = useMyStanding(win.from, win.to, scope);
  const minePrev = useMyStanding(previous.from, previous.to, scope);
  const daily = useDailyPerformance(win.from, win.to, null, scope);
  /* The brands she actually has figures with, over all time so the list does
     not shrink as she moves between periods. Disabled inside a hub, where the
     brand is not hers to change. */
  const brandSource = useBrandPerformance(
    brandId ? null : ALL_TIME_FROM,
    brandId ? null : win.to
  );

  const brandOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of brandSource.data ?? []) {
      if (b.brand_id && b.brand_name && !seen.has(b.brand_id))
        seen.set(b.brand_id, b.brand_name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [brandSource.data]);

  /* Memoised so the folded list below is actually memoised: `data ?? []` is a
     fresh array on every render, which would make every dependency change. */
  const rows = useMemo(() => board.data ?? [], [board.data]);
  const standing = mine.data ?? null;
  /* Bound separately so the closures below narrow cleanly: `standing` is
     nullable and TypeScript does not carry that narrowing into a callback. */
  const myRank = standing?.rank ?? null;
  const total = rows[0]?.total_creators ?? standing?.total_creators ?? 0;
  const pages = Math.max(1, Math.ceil(total / BOARD_PAGE));
  const searching = search.trim().length > 0;

  /** Her own row, and the creator one place above her, on the page on screen. */
  const meOnPage = rows.some((r) => r.is_me);
  const aboveOnPage = myRank !== null && rows.some((r) => r.rank === myRank - 1);

  /*
   * THE FIVE ROWS AROUND HER, asked for only when the page on screen holds
   * neither her row nor the creator one place above her. One of those is
   * §7.5's fold and the other is the row the gap line is measured against.
   */
  const slice = useBoardSlice({
    from: win.from,
    to: win.to,
    offset: myRank === null ? 0 : Math.max(0, myRank - 3),
    limit: 5,
    brandId: scope,
    enabled: myRank !== null && myRank > 1 && !searching && (!meOnPage || !aboveOnPage),
  });
  const near = useMemo(() => slice.data ?? [], [slice.data]);

  const faces = useBoardFaces([
    ...rows.map((r) => r.avatar_path),
    ...near.map((r) => r.avatar_path),
  ]);

  const above = useMemo(() => {
    if (myRank === null || myRank <= 1) return null;
    const want = myRank - 1;
    return rows.find((r) => r.rank === want) ?? near.find((r) => r.rank === want) ?? null;
  }, [myRank, rows, near]);

  /*
   * The podium is the first three of the FIRST page, and only when nobody is
   * searching. A podium built from a filtered list would show "#1" against
   * whoever happens to match, which is a lie told confidently.
   */
  const showPodium = page === 0 && !searching && rows.length >= 3;
  const podium = showPodium ? rows.slice(0, 3) : [];
  const listed = showPodium ? rows.slice(3) : rows;

  /** She is on the board but not on the part of it that is on screen. */
  const folded = showPodium && myRank !== null && !meOnPage && near.length > 0;

  const items: BoardItem[] = useMemo(() => {
    const plain = (): BoardItem[] => listed.map((row) => ({ kind: 'row', row }));
    if (!folded) return plain();

    const top = listed.filter((r) => r.rank <= TOP_SHOWN);
    const lastTop = top.at(-1)?.rank ?? 3;
    const tail = near.filter((r) => r.rank > lastTop);
    if (tail.length === 0) return plain();

    const hidden = tail[0]!.rank - lastTop - 1;
    return [
      ...top.map((row): BoardItem => ({ kind: 'row', row })),
      ...(hidden > 0 ? [{ kind: 'gap', hidden } as BoardItem] : []),
      ...tail.map((row): BoardItem => ({ kind: 'row', row })),
    ];
  }, [folded, listed, near]);

  /* Bars are measured against the leader when the leader is known — the first
     page always holds them — and otherwise against the biggest figure in the
     view, so the shape of what is on screen never overstates a row. */
  const best = items.reduce(
    (max, i) => (i.kind === 'row' ? Math.max(max, num(i.row.gmv) ?? 0) : max),
    num(rows[0]?.gmv) ?? 0
  );

  const period = windowLabel(win, range);
  const rise = (delay: number) => ({
    initial: quiet ? false : ({ opacity: 0, y: '0.5rem' } as const),
    animate: { opacity: 1, y: '0rem' } as const,
    transition: { duration: 0.28, delay: quiet ? 0 : delay, ease: 'easeOut' as const },
  });

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <FilterBar
        action={
          brandId ? null : (
            <BrandFilter
              brands={brandOptions}
              value={pickedBrand}
              onChange={(id) => {
                setPickedBrand(id);
                setPage(0);
              }}
            />
          )
        }
      >
        <FilterTabs label="Over what period">
          {RANGES.map((r) => (
            <FilterTab
              key={r.key}
              active={range === r.key}
              onClick={() => {
                setRange(r.key);
                setPage(0);
              }}
            >
              {r.label}
            </FilterTab>
          ))}
        </FilterTabs>

        {/*
          THE HOUSE SEARCH FIELD, not a copy of it. This was a hand-rolled
          `<input>` 2.5rem tall with `rounded-md`, 0.875rem type and a focus
          RING — and a ring is a `box-shadow`, so focusing it replaced the
          inset that makes `wx-neo-inset` read as a well and the box went flat
          under the cursor. Offers, Contests and My content all draw the same
          control, so there is one of it now; see
          `components/creator/SearchField.tsx` for the three-way drift it
          replaces.
        */}
        <CreatorSearch
          value={search}
          onChange={(next) => {
            setSearch(next);
            setPage(0);
          }}
          placeholder="Find a creator"
          label="Find a creator"
        />
      </FilterBar>

      {board.isPending ? (
        <div className="flex flex-col gap-3">
          <NeoCardSkeleton className="h-44" />
          <NeoCardSkeleton className="h-28" />
          <NeoCardSkeleton className="h-64" />
        </div>
      ) : board.isError ? (
        <DataError
          title="We could not load the board"
          body="Something went wrong on our side, not yours. The board has not changed."
          onRetry={() => board.refetch()}
        />
      ) : rows.length === 0 ? (
        searching ? (
          <EmptyState
            title="Nobody by that name"
            body="Try part of a handle instead."
            className="w-full"
          />
        ) : (
          <EmptyState
            title="The board is empty for now"
            body="Creators appear here once their approved videos start selling. When yours do, you will see your place on it straight away."
            className="w-full"
          />
        )
      ) : (
        <>
          {podium.length === 3 ? (
            <m.div {...rise(0)}>
              <Podium rows={podium} faces={faces} period={period} />
            </m.div>
          ) : null}

          {/*
            PINNED ABOVE THE BOTTOM BAR ON A PHONE, at the top of the list on a
            desktop — §7.3. One element, two sticky edges: below `lg` only
            `bottom` is set, so it settles above the phone nav (whose own offset
            is the safe area plus `--wx-vv-bottom`, the browser toolbar
            MobileNav tracks); from `lg` up only `top` is set, clearing the
            floating header card. `z-30` keeps it under both.
          */}
          <m.div
            {...rise(0.04)}
            className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom)+var(--wx-vv-bottom,0px))] z-30 lg:top-[4.5rem] lg:bottom-auto"
          >
            <YouCard
              standing={standing}
              previous={minePrev.data ?? null}
              comparable={range !== 'all'}
              above={above}
              series={dailyGmvSeries(daily.data, win.to)}
              currency={standing?.currency ?? null}
              loading={mine.isPending}
              failed={mine.isError}
              onRetry={() => mine.refetch()}
            />
          </m.div>

          {items.length > 0 || pages > 1 ? (
            <m.div {...rise(0.08)}>
              <BoardList
                items={items}
                faces={faces}
                best={best}
                page={page}
                pages={pages}
                onPage={setPage}
                fetching={board.isFetching || slice.isFetching}
              />
            </m.div>
          ) : null}

          {/*
            THE LINE §7 ASKS FOR. Somebody missing from this board is not on a
            zero; they are not measured yet, and that difference is the whole
            reason there are no zero rows here.
          */}
          <p className="text-faint px-1 text-[0.75rem] leading-relaxed">
            {period} · <span className="wx-numeric font-mono">{total}</span>{' '}
            {total === 1 ? 'creator' : 'creators'} with figures in it. A creator who is not here
            is not measured yet, which is never the same as a zero.
          </p>
        </>
      )}
    </div>
  );
}
