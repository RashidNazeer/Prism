import { useMemo, useState } from 'react';
import {
  BOARD_PAGE,
  useBoardFaces,
  useLeaderboard,
  useMyStanding,
} from '@/lib/creator/useLeaderboard';
import { useCreatorBrands } from '@/lib/creator/useCreatorBrands';
import { useMyWork } from '@/lib/creator/useMyWork';
import { previousWindow } from '@/lib/creator/daily-totals';
import { BoardPanel } from '@/components/creator/leaderboard/BoardPanel';
import {
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

/**
 * A BOARD EXISTS ONLY FOR A BRAND SHE WORKS WITH.
 *
 * Rashid, 2026-10-19, on the reviewers' note that leaderboards should be limited
 * to the creators involved: there is no all-brands board. She sees the boards of
 * brands she has an approved offer with, defaulting to the first, and ranks
 * among that brand's creators. A creator with no brand yet sees one line.
 *
 * This is the screen's rule, not a security boundary: the ranking function
 * still answers for any brand id it is handed. Enforcing it there is a database
 * change and is tracked separately.
 */
export function Leaderboards({ brandId }: { brandId?: string } = {}) {
  const brands = useCreatorBrands();
  const work = useMyWork();
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);

  const options = useMemo(() => {
    const working = new Set<string>();
    for (const r of work.data ?? []) if (r.status === 'approved') working.add(r.brand_id);
    return (brands.data ?? [])
      .filter((b) => working.has(b.id))
      .map((b) => ({ id: b.id, name: b.name }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [brands.data, work.data]);

  const scope =
    brandId ??
    (options.some((o) => o.id === pickedBrand) ? pickedBrand : null) ??
    options[0]?.id ??
    null;

  if (!brandId && (brands.isPending || work.isPending)) {
    return <div aria-busy="true" className="wx-skeleton mx-auto mt-6 h-72 max-w-[26rem] rounded-xl" />;
  }
  if (!scope) {
    return (
      <p className="text-muted px-1 py-16 text-center text-[0.9375rem] font-semibold">
        Work with a brand to see its leaderboard
      </p>
    );
  }
  return (
    <BrandBoard
      brandId={scope}
      options={options}
      onPick={brandId ? null : setPickedBrand}
    />
  );
}

function BrandBoard({
  brandId,
  options,
  onPick,
}: {
  brandId: string;
  options: { id: string; name: string }[];
  onPick: ((id: string | null) => void) | null;
}) {
  const [range, setRange] = useState<RangeKey>('all');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const scope = brandId;
  const win = useMemo(() => rangeWindow(range), [range]);
  /* "All time" has no window before it; asking for the same one is the same
     query key, so not a second request. */
  const previous = useMemo(() => (range === 'all' ? win : previousWindow(win)), [range, win]);

  const board = useLeaderboard(win.from, win.to, page, search, scope);
  const mine = useMyStanding(win.from, win.to, scope);
  const minePrev = useMyStanding(previous.from, previous.to, scope);
  const brandOptions = options;

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
      brand={scope}
      onBrand={
        onPick
          ? (id) => {
              onPick(id);
              setPage(0);
            }
          : null
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
