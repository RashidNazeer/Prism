import { useSearchParams } from 'react-router';
import { CreatorHomeView } from '@/components/creator/home/CreatorHome';
import { ApplicantHome } from '@/components/creator/home/ApplicantHome';
import { HomeSkeleton } from '@/components/creator/home/HomeSkeleton';
import type { HomeData } from '@/lib/creator/useHomeData';
import type { ChartPoint } from '@/components/charts';
import type { UpNextAction } from '@/components/creator/home/UpNext';
import { EMPTY_STAGES_FOR_PREVIEW } from '@/components/creator/home/preview-fixtures';

/**
 * HOME, RENDERED AGAINST MADE-UP FIGURES, SO IT CAN BE LOOKED AT.
 *
 * DEV ONLY — registered behind `import.meta.env.DEV`, absent from any
 * production bundle.
 *
 * The reason it exists: nobody on this machine has a creator login, so
 * `/app` cannot be opened signed in. Without this, every claim about the
 * spacing, the dark theme, the phone layout and the empty states would be a
 * claim about code that had never been rendered. `CreatorHomeView` is the real
 * component — not a copy — so what appears here is what a creator gets.
 *
 * `?state=` switches between the cases worth looking at:
 *   (default) a working creator, `empty`, `gaps`, `applicant`, `loading`.
 */

const DAYS = 30;
const day = (i: number) =>
  new Date(Date.UTC(2026, 8, 17 + i)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const gmv: ChartPoint[] = Array.from({ length: DAYS }, (_, i) => ({
  label: day(i),
  value: Math.round(900 + Math.sin(i / 3.2) * 380 + i * 41 + (i % 4) * 70),
}));
const spend: ChartPoint[] = Array.from({ length: DAYS }, (_, i) => ({
  label: day(i),
  value: i % 9 === 4 ? null : Math.round(35 + (i % 6) * 18),
}));
const orders: ChartPoint[] = Array.from({ length: DAYS }, (_, i) => ({
  label: day(i),
  value: Math.round(8 + Math.sin(i / 2.6) * 4 + i / 4),
}));

const withGaps = (s: ChartPoint[]): ChartPoint[] =>
  s.map((p, i) => (i > 11 && i < 17 ? { ...p, value: null } : p));

const actions: UpNextAction[] = [
  {
    id: '1',
    brand: 'Glow Recipe',
    title: 'Dewy Skin Cream routine',
    detail: 'Accepted · no video filed yet · 9d',
    cta: 'File your video',
    to: '/app/offers',
    urgency: -9,
    badge: { text: '9d waiting', tone: 'warning' },
  },
  {
    id: '2',
    brand: 'Rhode Skin',
    title: 'Peptide Lip Tint',
    detail: 'Sample on its way · 2d',
    cta: 'View',
    to: '/app/offers',
    urgency: -2,
  },
];

function mock(kind: 'full' | 'empty' | 'gaps'): HomeData {
  const empty = kind === 'empty';
  const g = kind === 'gaps';
  const total = (s: ChartPoint[]) => s.reduce((t, p) => t + (p.value ?? 0), 0);

  return {
    period: {
      key: '30',
      from: '2026-09-17',
      to: '2026-10-16',
      prevFrom: '2026-08-18',
      prevTo: '2026-09-16',
      days: 30,
      brandId: null,
      label: '30D',
      setPeriod: () => {},
      setBrand: () => {},
    },
    window: { earliest: '2026-07-01', latest: '2026-10-16', videos: 14 },
    loading: false,
    neverAnyData: false,
    emptyPeriodButHasHistory: empty,
    totals: {
      gmv: empty ? 0 : total(gmv),
      spend: empty ? 0 : total(spend),
      orders: empty ? 0 : total(orders),
      currency: 'USD',
    },
    previous: empty
      ? null
      : { gmv: total(gmv) * 0.84, spend: total(spend) * 1.04, orders: total(orders) * 0.79, currency: 'USD' },
    gmvSeries: empty ? [] : g ? withGaps(gmv) : gmv,
    spendSeries: empty ? [] : spend,
    ordersSeries: empty ? [] : orders,
    videosWithAds: empty ? 0 : 8,
    brands: empty
      ? []
      : [
          { label: 'Glow Recipe', value: 14230, id: 'a' },
          { label: 'Rare Beauty', value: 9120, id: 'b' },
          { label: 'Rhode Skin', value: 6400, id: 'c' },
          { label: 'Sol de Janeiro', value: 3980, id: 'd' },
          { label: 'Summer Fridays', value: 2100, id: 'e' },
          { label: 'Tower 28', value: 1400, id: 'f' },
        ],
    topVideos: empty
      ? []
      : ([
          {
            item_id: '1',
            video_title: 'Lip Peptide Routine #GRWM',
            brand_name: 'Rhode Skin',
            gross_revenue: 14200,
            cost: 420,
            currency: 'USD',
            thumbnail_url: null,
          },
          {
            item_id: '2',
            video_title: 'Hydrating Glaze Serum review',
            brand_name: 'Glow Recipe',
            gross_revenue: 9100,
            cost: 0,
            currency: 'USD',
            thumbnail_url: null,
          },
          {
            item_id: '3',
            video_title: null,
            submitted_at: '2026-10-03T10:00:00Z',
            brand_name: 'Rare Beauty',
            gross_revenue: 5300,
            cost: 180,
            currency: 'USD',
            thumbnail_url: null,
          },
        ] as unknown as HomeData['topVideos']),
    currency: 'USD',
  };
}

function Pane({ theme, children }: { theme: 'light' | 'dark'; children: React.ReactNode }) {
  return (
    <div data-theme={theme} className="bg-bg min-h-screen flex-1 p-4">
      <p className="text-faint mb-3 text-xs font-bold uppercase">{theme}</p>
      {children}
    </div>
  );
}

export function HomePreview() {
  const [params] = useSearchParams();
  const state = params.get('state') ?? 'full';

  const body = (theme: 'light' | 'dark') => {
    if (state === 'loading') return <HomeSkeleton />;
    if (state === 'applicant')
      return (
        <ApplicantHome
          name="Alex"
          tiktokConnected={false}
          application={
            {
              id: '1',
              tiktok_handle: '@alex',
              status: 'pending',
              review_note: null,
              created_at: '2026-10-01',
            } as never
          }
        />
      );
    return (
      <CreatorHomeView
        key={theme}
        name="Alex"
        tier="rising"
        home={mock(state === 'empty' ? 'empty' : state === 'gaps' ? 'gaps' : 'full')}
        actions={state === 'empty' ? [] : actions}
        pipeline={state === 'empty' ? null : EMPTY_STAGES_FOR_PREVIEW}
      />
    );
  };

  return (
    <div className="flex min-h-screen flex-col xl:flex-row">
      <Pane theme="light">{body('light')}</Pane>
      <Pane theme="dark">{body('dark')}</Pane>
    </div>
  );
}
