import { useSearchParams } from 'react-router';
import { ContentView } from '@/routes/app/Content';
import type { Sources } from '@/components/creator/content/joined';
import type { ContentRow } from '@/lib/content';
import type { MyWorkRow } from '@/lib/creator/useMyWork';
import type { VideoPerformance } from '@/lib/creator/usePerformance';
import type { TikTokVideo } from '@/lib/creator/useTikTokAccount';
import type { JobProgress } from '@/lib/work/job-progress';

/**
 * THE WHOLE MY CONTENT PAGE, AGAINST MADE-UP DATA. DEV ONLY (`/dev/content-page`).
 *
 * It renders the real `ContentView` (the page minus its data hooks), so what
 * you see is the page. Pick a case with `?case=` and a theme with `?theme=`:
 *
 *   rudely   the real test creator: 16 videos, 14 approved, 2 with the team,
 *            TikTok not connected, no thumbnails, ads behind all but one.
 *   tiktok   the same, TikTok connected; three videos have figures, one has a
 *            figure missing, the rest are not in TikTok's answer.
 *   covers   pictures present (data-URI art, no network).
 *   failed   the TikTok request broke.
 *   few      three videos: no search, no sort.
 *   empty    nothing filed and no jobs.
 *
 * Add `&view=dashboard` for the Jobs view, and `&many=60` to test paging.
 */

const BRANDS = [
  { id: 'b1', name: 'Swisse', slug: 'swisse', logo_url: null },
  { id: 'b2', name: 'Dr Tobias', slug: 'dr-tobias', logo_url: null },
  { id: 'b3', name: 'Aurelia', slug: 'aurelia', logo_url: null },
];

const art = (i: number) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${(i * 47) % 360} 55% 45%)"/><stop offset="1" stop-color="hsl(${(i * 47 + 70) % 360} 60% 22%)"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/></svg>`
  );

function row(i: number, covers: boolean): ContentRow {
  const brand = BRANDS[i < 5 ? 0 : i < 10 ? 1 : 2]!;
  return {
    id: `s${i}`,
    application_id: `a${i % 3}`,
    creator_id: 'me',
    brand_id: brand.id,
    offer_id: `o${i % 3}`,
    creator_handle: 'rudely',
    creator_name: 'rudely',
    video_url: `https://www.tiktok.com/@rudely/video/${7000 + i}`,
    ad_code: `AD-${1000 + i}`,
    ad_authorized: true,
    status: i < 2 ? 'submitted' : 'approved',
    decision_note: null,
    decided_at: null,
    thumbnail_url: covers ? art(i) : null,
    video_title: null,
    video_author: null,
    embed_id: String(7000 + i),
    created_at: `2026-10-${String(10 - (i % 5)).padStart(2, '0')}T10:00:00Z`,
    brand,
    offer: { id: `o${i % 3}`, title: `${brand.name} launch job`, video_count: 5 },
  } as ContentRow;
}

function perfFor(r: ContentRow, i: number): VideoPerformance {
  return {
    item_id: r.id,
    submission_id: r.id,
    source: 'offer',
    video_url: r.video_url,
    video_title: null,
    thumbnail_url: null,
    brand_id: r.brand_id,
    brand_name: r.brand?.name ?? null,
    submitted_at: r.created_at,
    cost: 20,
    gross_revenue: 400,
    orders: 9,
    roi: 2,
    cost_per_order: 2,
    currency: 'USD',
    days_with_data: 6,
    ads_ever: true,
    last_active_date: '2026-10-17',
    lifetime_cost: 120,
    lifetime_revenue: 435 - i * 17,
  };
}

function tt(i: number): TikTokVideo {
  return {
    video_id: String(7000 + i),
    title: null,
    cover_image_url: null,
    share_url: null,
    duration: 20,
    posted_at: '2026-10-10',
    view_count: i === 3 ? null : 12400 - i * 900,
    like_count: i === 3 ? null : 910 - i * 40,
    comment_count: i === 3 ? null : 42 - i,
    share_count: 5,
    fetched_at: '2026-10-18',
  };
}

const jobs = [
  { id: 'a0', status: 'approved', brand: { name: 'Swisse' }, offer: { title: 'Swisse launch job' } },
  { id: 'a1', status: 'approved', brand: { name: 'Dr Tobias' }, offer: { title: 'Dr Tobias launch job' } },
  { id: 'a2', status: 'approved', brand: { name: 'Aurelia' }, offer: { title: 'Aurelia launch job' } },
] as unknown as MyWorkRow[];

const progress = new Map<string, JobProgress>(
  [
    ['a0', 5, 4, 1],
    ['a1', 5, 3, 0],
    ['a2', 3, 3, 0],
  ].map(([id, required, approved, waiting]) => {
    const req = required as number;
    const ap = approved as number;
    return [
      id as string,
      {
        application_id: id as string,
        creator_id: 'me',
        brand_id: 'b',
        offer_id: 'o',
        required: req,
        approved: ap,
        waiting: waiting as number,
        needs_another_take: 0,
        posted: ap + (waiting as number),
        remaining: Math.max(0, req - ap),
        done: ap >= req,
        untouched: false,
        fraction: Math.min(1, ap / req),
      } satisfies JobProgress,
    ];
  })
);

export function ContentPagePreview() {
  const [params] = useSearchParams();
  const c = params.get('case') ?? 'rudely';
  const theme = params.get('theme') === 'light' ? 'light' : 'dark';
  const n = Number(params.get('many') ?? (c === 'few' ? 3 : 16));
  const covers = c === 'covers';
  const empty = c === 'empty';

  const rows = empty ? [] : Array.from({ length: n }, (_, i) => row(i, covers));
  // One approved video (index 6) has no ad behind it, so the exception is tagged.
  const perfRows = rows
    .map((r, i) => (r.status === 'approved' && i !== 6 ? perfFor(r, i) : null))
    .filter((p): p is VideoPerformance => p !== null);
  const connected = c === 'tiktok';
  const failed = c === 'failed';
  const sources: Sources = { ads: 'ok', tiktok: connected ? 'ok' : failed ? 'failed' : 'off' };
  const tiktokRows = connected ? [2, 3, 4, 5].map(tt) : undefined;

  return (
    <div data-theme={theme} className="bg-bg text-text min-h-screen p-4 sm:p-6">
      <ContentView
        approved
        loading={false}
        failed={false}
        onRetry={() => {}}
        work={empty ? [] : jobs}
        rows={rows}
        progress={empty ? new Map() : progress}
        perfRows={perfRows}
        tiktokRows={tiktokRows}
        sources={sources}
        latest="2026-10-17"
        onRetryAds={() => {}}
        onRetryTikTok={() => {}}
      />
    </div>
  );
}
