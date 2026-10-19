import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { BoardPanel } from '@/components/creator/leaderboard/BoardPanel';
import { buildItems, type RangeKey } from '@/components/creator/leaderboard/board-kit';
import type { LeaderboardRow } from '@/lib/creator/useLeaderboard';

/**
 * THE LEADERBOARD AGAINST MADE-UP DATA. DEV ONLY (`/dev/leaderboards`).
 *
 * Draws the real `BoardPanel`. `?case=` picks one: first (her real case, #1 of
 * 10), mid, far (#47 of 120, folded), absent (not on the board), empty.
 */

const NAMES = [
  'rudely',
  'Selena',
  'Gunnar',
  'Nikki Wilson',
  'Graycie-Lea J Kosz',
  'Aaron Finds',
  'Dana Smith',
  'John',
  'Victoria Sternu',
  'Sarah Hilliard',
];
const GMV = [3200, 1300, 611, 419, 74, 44, 31, 16, 14, 13];

function row(rank: number, name: string, gmv: number, total: number, me: boolean): LeaderboardRow {
  return {
    rank,
    creator_id: `c-${rank}`,
    display_name: name,
    avatar_path: null,
    gmv,
    spend: 0,
    orders: 0,
    videos: 3,
    currency: 'USD',
    is_me: me,
    total_creators: total,
  };
}

/** Her real case: she is first of ten, with the leader's figure above the rest. */
function firstBoard(): LeaderboardRow[] {
  const sorted = [...NAMES.keys()].sort((a, b) => GMV[b]! - GMV[a]!);
  return sorted.map((i, r) => row(r + 1, NAMES[i]!, GMV[i]!, 10, i === 0));
}

function midBoard(): LeaderboardRow[] {
  return NAMES.slice(1)
    .concat('Priya Nair')
    .map((n, i) => row(i + 1, i === 5 ? 'rudely' : n, 4200 - i * 380, 10, i === 5));
}

function longBoard(): { rows: LeaderboardRow[]; near: LeaderboardRow[] } {
  const rows = Array.from({ length: 25 }, (_, i) =>
    row(i + 1, `Creator ${i + 1}`, 9000 - i * 260, 120, false)
  );
  const near = [45, 46, 47, 48, 49].map((r) =>
    row(r, r === 47 ? 'rudely' : `Creator ${r}`, 2100 - (r - 45) * 55, 120, r === 47)
  );
  return { rows, near };
}

type Case = {
  rows: LeaderboardRow[];
  near: LeaderboardRow[];
  moved: number | null;
  pages: number;
  brands: { id: string; name: string }[];
};

function build(which: string): Case {
  if (which === 'mid')
    return {
      rows: midBoard(),
      near: [],
      moved: 2,
      pages: 1,
      brands: [
        { id: 'a', name: 'Vitauthority' },
        { id: 'b', name: 'Swisse' },
      ],
    };
  if (which === 'far') return { ...longBoard(), moved: -3, pages: 5, brands: [] };
  if (which === 'absent')
    return { rows: firstBoard().filter((r) => !r.is_me), near: [], moved: null, pages: 1, brands: [] };
  if (which === 'empty') return { rows: [], near: [], moved: null, pages: 1, brands: [] };
  return {
    rows: firstBoard(),
    near: [],
    moved: null,
    pages: 1,
    brands: [{ id: 'a', name: 'Vitauthority' }],
  };
}

export function LeaderboardsPreview() {
  const [params] = useSearchParams();
  const which = params.get('case') ?? 'first';
  const c = build(which);
  const [range, setRange] = useState<RangeKey>('all');
  const [brand, setBrand] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const podium = c.rows.length >= 3 ? c.rows.slice(0, 3) : [];
  const listed = podium.length ? c.rows.slice(3) : c.rows;
  const st = params.get('state');
  return (
    <div className="p-3 sm:p-6">
      <BoardPanel
        state={st === 'loading' ? 'loading' : st === 'error' ? 'error' : 'ready'}
        podium={podium}
        items={buildItems(listed, c.near, which === 'far')}
        faces={{}}
        moved={c.moved}
        range={range}
        onRange={setRange}
        brands={c.brands}
        brand={brand}
        onBrand={setBrand}
        search={search}
        onSearch={c.rows[0] && c.rows[0].total_creators > 25 ? setSearch : null}
        page={0}
        pages={c.pages}
        onPage={() => {}}
        fetching={false}
        onRetry={() => {}}
      />
    </div>
  );
}
