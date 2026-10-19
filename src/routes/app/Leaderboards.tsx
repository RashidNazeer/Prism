import { useEffect, useMemo, useState } from 'react';
import {
  BOARD_PAGE,
  useBoardFaces,
  useLeaderboard,
  useMyStanding,
} from '@/lib/creator/useLeaderboard';
import { useBrandPerformance } from '@/lib/creator/usePerformance';
import { previousWindow } from '@/lib/creator/daily-totals';
import { BoardPanel } from '@/components/creator/leaderboard/BoardPanel';
import {
  ALL_TIME_FROM,
  buildItems,
  placesMoved,
  rangeWindow,
  useBoardSlice,
  type RangeKey,
} from '@/components/creator/leaderboard/board-kit';

/**
 * Leaderboards: what every creator's videos have actually sold.
 *
 * THE NUMBER IS GMV, AND ONLY GMV. Nothing on this screen is anything else.
 *
 * Names and figures are shown here, the one screen where that is so (it amends
 * D7 on Rashid's decision of 2026-08-20; the contest standing stays anonymous).
 * Only creators with real figures appear: the RPC leaves out everybody who is
 * not measured yet rather than ranking them on a zero.
 *
 * One ranked list is the page. If she is not on the part of the board on
 * screen it folds: the top, a gap marker, then the rows around her.
 *
 * `brandId` is optional and still honoured; the page's own brand filter is
 * what matters now that the Brand hub does not embed it.
 */

/** A search box only earns its place once the board needs paging. */
const SEARCH_ABOVE = BOARD_PAGE;

export function Leaderboards({ brandId }: { brandId?: string } = {}) {
  const [range, setRange] = useState<RangeKey>('all');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);

  useEffect(() => {
    setPage(0);
  }, [brandId]);

  const scope = brandId ?? pickedBrand ?? undefined;
  const win = useMemo(() => rangeWindow(range), [range]);
  /* "All time" has no window before it; asking for the same one is the same
     query key, so not a second request. */
  const previous = useMemo(() => (range === 'all' ? win : previousWindow(win)), [range, win]);

  const board = useLeaderboard(win.from, win.to, page, search, scope);
  const mine = useMyStanding(win.from, win.to, scope);
  const minePrev = useMyStanding(previous.from, previous.to, scope);
  const brandSource = useBrandPerformance(
    brandId ? null : ALL_TIME_FROM,
    brandId ? null : win.to
  );

  const brandOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of brandSource.data ?? []) {
      if (b.brand_id && b.brand_name && !seen.has(b.brand_id)) seen.set(b.brand_id, b.brand_name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [brandSource.data]);

  const rows = useMemo(() => board.data ?? [], [board.data]);
  const standing = mine.data ?? null;
  const myRank = standing?.rank ?? null;
  const total = rows[0]?.total_creators ?? standing?.total_creators ?? 0;
  const pages = Math.max(1, Math.ceil(total / BOARD_PAGE));
  const searching = search.trim().length > 0;

  const meOnPage = rows.some((r) => r.is_me);
  const aboveOnPage = myRank !== null && rows.some((r) => r.rank === myRank - 1);

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

  /* The podium is the first three of the first page, and only when nobody is
     searching: a podium built from a filtered list would crown whoever matches. */
  const showPodium = page === 0 && !searching && rows.length >= 3;
  const podium = useMemo(() => (showPodium ? rows.slice(0, 3) : []), [showPodium, rows]);
  const listed = showPodium ? rows.slice(3) : rows;
  const fold = showPodium && myRank !== null && !meOnPage && near.length > 0;
  const items = useMemo(() => buildItems(listed, near, fold), [listed, near, fold]);

  const moved =
    !standing || range === 'all' || !minePrev.data
      ? null
      : placesMoved(standing.rank, minePrev.data.rank);

  return (
    <BoardPanel
      state={board.isPending ? 'loading' : board.isError ? 'error' : 'ready'}
      items={items}
      faces={faces}
      podium={podium}
      moved={moved}
      range={range}
      onRange={(r) => {
        setRange(r);
        setPage(0);
      }}
      brands={brandOptions}
      brand={pickedBrand}
      onBrand={
        brandId
          ? null
          : (id) => {
              setPickedBrand(id);
              setPage(0);
            }
      }
      search={search}
      onSearch={
        searching || total > SEARCH_ABOVE
          ? (s) => {
              setSearch(s);
              setPage(0);
            }
          : null
      }
      page={page}
      pages={pages}
      onPage={setPage}
      fetching={board.isFetching || slice.isFetching}
      onRetry={() => void board.refetch()}
    />
  );
}
