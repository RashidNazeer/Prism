import { useSearchParams } from 'react-router';
import { VideoCard } from '@/components/creator/content/VideoCard';
import type { JoinedVideo, Sources } from '@/components/creator/content/joined';

/**
 * THE CONTENT GRID, AGAINST MADE-UP VIDEOS. DEV ONLY.
 *
 * Added to check one specific complaint: the cards were portrait posters, and
 * with one or two videos the fixed column count stretched each card across
 * half a desktop. Both are layout faults that only show at a particular COUNT,
 * so `?n=` renders the grid at 1, 2, 3 and many — which is exactly the case a
 * screenshot of a full page never catches.
 */

const SOURCES: Sources = {
  submissions: 'ok',
  performance: 'ok',
  tiktok: 'off',
} as unknown as Sources;

function fake(i: number): JoinedVideo {
  return {
    row: {
      id: String(i),
      status: ['approved', 'submitted', 'needs_another_take'][i % 3],
      video_title: ['Lip Peptide Routine #GRWM', 'Hydrating Glaze Serum review', 'Evening unboxing'][
        i % 3
      ],
      offer: { title: ['Glow Recipe job', 'Rhode Skin job', 'Rare Beauty job'][i % 3] },
      brand: { name: ['Glow Recipe', 'Rhode Skin', 'Rare Beauty'][i % 3] },
      thumbnail_url: null,
      created_at: '2026-10-01',
    },
    gmv: i % 4 === 3 ? null : 1400 * (i + 1),
    spend: i % 2 === 0 ? 120 : 0,
    currency: 'USD',
    views: null,
    likes: null,
    comments: null,
    tiktok: null,
    perf: null,
  } as unknown as JoinedVideo;
}

function Pane({ theme, n }: { theme: 'light' | 'dark'; n: number }) {
  return (
    <div data-theme={theme} className="bg-bg min-h-screen flex-1 p-4">
      <p className="text-faint mb-3 text-xs font-bold uppercase">
        {theme} &middot; {n} video{n === 1 ? '' : 's'}
      </p>
      <div className="wx-neo-raised-sm rounded-xl p-3">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2.5 sm:gap-3">
          {Array.from({ length: n }, (_, i) => (
            <li key={i}>
              <VideoCard video={fake(i)} sources={SOURCES} onOpen={() => {}} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ContentPreview() {
  const [params] = useSearchParams();
  const n = Number(params.get('n') ?? 8);
  return (
    <div className="flex min-h-screen flex-col xl:flex-row">
      <Pane theme="light" n={n} />
      <Pane theme="dark" n={n} />
    </div>
  );
}
