import { CombinedChart } from '@/components/creator/home/CombinedChart';
import {
  DeltaChip,
  Donut,
  RingProgress,
  SparkArea,
  SparkBars,
  StackedBar,
  TrendLine,
  type ChartPoint,
} from '@/components/charts';

/**
 * EVERY CHART, BOTH THEMES, ON ONE PAGE — including the cases nobody
 * screenshots.
 *
 * DEV ONLY. The route is registered behind `import.meta.env.DEV`, so this
 * never reaches a production bundle and nobody can stumble onto it. Open it at
 * `/dev/charts` with `pnpm dev`.
 *
 * It exists because the hard part of these charts is not the happy path. Real
 * data draws itself; what needs looking at every time something changes is a
 * series that is ALL nulls, one with a null in the middle, one that is
 * genuinely all zeros, and a single lone day. Those four are the difference
 * between "null is not zero" being a rule in a document and a rule on screen.
 *
 * BOTH THEMES SIDE BY SIDE, by nesting `data-theme`, because the tokens are
 * declared per theme and several bugs this month existed in one theme only.
 */

const DAYS = 30;
const day = (i: number) => `Oct ${((i % 31) + 1).toString()}`;

/** A believable GMV curve: it wanders, it does not sweep. */
const real: ChartPoint[] = Array.from({ length: DAYS }, (_, i) => ({
  label: day(i),
  value: Math.round(800 + Math.sin(i / 3) * 420 + i * 34 + (i % 5) * 90),
}));

/** The same shape with a four-day hole in the middle: TikTok withheld them. */
const gapped: ChartPoint[] = real.map((p, i) => (i > 12 && i < 17 ? { ...p, value: null } : p));

/** Measured, and it was nothing. NOT the same as the one below. */
const zeros: ChartPoint[] = Array.from({ length: DAYS }, (_, i) => ({
  label: day(i),
  value: 0,
}));

/** Nothing measured at all. */
const nulls: ChartPoint[] = Array.from({ length: DAYS }, (_, i) => ({
  label: day(i),
  value: null,
}));

/** One real day in a month of silence — the case that draws no path at all. */
const lone: ChartPoint[] = nulls.map((p, i) => (i === 14 ? { ...p, value: 1240 } : p));

const spend: ChartPoint[] = real.map((p, i) => ({
  label: p.label,
  value: i % 7 === 3 ? null : Math.round(40 + (i % 6) * 22),
}));

const brands = [
  { label: 'Glow Recipe', value: 14230 },
  { label: 'Rare Beauty', value: 9120 },
  { label: 'Rhode Skin', value: 6400 },
  { label: 'Sol de Janeiro', value: 3980 },
  { label: 'Summer Fridays', value: 2100 },
  { label: 'Tower 28', value: 1400 },
  { label: 'Kosas', value: 900 },
];

function Case({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="wx-neo-raised-sm rounded-lg p-4">
      <div className="mb-2">
        <h3 className="text-text text-sm font-semibold">{title}</h3>
        {note && <p className="text-muted text-xs">{note}</p>}
      </div>
      {children}
    </div>
  );
}

function Gallery({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div data-theme={theme} className="bg-bg min-h-full flex-1 p-6">
      <h2 className="text-text mb-4 text-lg font-bold capitalize">{theme}</h2>

      <div className="wx-neo-raised space-y-4 rounded-xl p-4">
        <Case title="SparkArea — real" note="GMV trend, no axes, gradient under the line">
          <SparkArea data={real} ariaLabel="GMV over 30 days" currency="USD" />
        </Case>

        <Case title="SparkArea — a hole in the middle" note="Four withheld days. The line BREAKS; it does not dip.">
          <SparkArea data={gapped} ariaLabel="GMV with missing days" currency="USD" />
        </Case>

        <Case title="SparkArea — one lone day" note="A single measured day still shows, as a dot.">
          <SparkArea data={lone} ariaLabel="GMV with one measured day" currency="USD" />
        </Case>

        <Case title="SparkArea — all zero" note="Measured, and it was nothing. A real flat line at the floor.">
          <SparkArea data={zeros} ariaLabel="GMV, all zero" currency="USD" />
        </Case>

        <Case title="SparkArea — nothing reported" note="Not a flat line: dashes and the words.">
          <SparkArea data={nulls} ariaLabel="GMV, nothing reported" currency="USD" />
        </Case>

        <Case title="SparkBars — real, with a missing day" note="A missing day has NO bar. A zero day has a sliver.">
          <SparkBars data={spend} ariaLabel="Ad spend by day" currency="USD" />
        </Case>

        <Case title="SparkBars — all zero" note="Every day measured at zero: slivers, not absence.">
          <SparkBars data={zeros} ariaLabel="Ad spend, all zero" currency="USD" />
        </Case>

        <div className="grid grid-cols-2 gap-4">
          <Case title="RingProgress — 16%">
            <RingProgress value={0.16} centre="16%" sub="of GMV" ariaLabel="Commission is 16% of GMV" />
          </Case>
          <Case title="RingProgress — complete">
            <RingProgress value={1} centre="Top tier" token="--chart-2" ariaLabel="Top tier reached" complete />
          </Case>
          <Case title="RingProgress — zero">
            <RingProgress value={0} centre="0%" sub="of GMV" ariaLabel="Commission is 0% of GMV" />
          </Case>
          <Case title="RingProgress — not reported">
            <RingProgress value={null} centre="" ariaLabel="Commission not reported" />
          </Case>
        </div>

        <Case title="Donut — 7 brands" note="Top 5 plus Other. The rows are the legend.">
          <Donut slices={brands} currency="USD" ariaLabel="GMV share by brand" onPick={() => {}} />
        </Case>

        <Case title="Donut — nothing yet">
          <Donut slices={[]} currency="USD" ariaLabel="GMV share by brand, empty" />
        </Case>

        <Case title="StackedBar — ad-backed vs organic">
          <StackedBar
            parts={[
              { label: 'Organic', value: 33400, token: '--chart-1' },
              { label: 'Ad-backed', value: 9400, token: '--chart-3' },
            ]}
            currency="USD"
            ariaLabel="GMV split: 78 percent organic, 22 percent ad-backed"
          />
        </Case>

        <Case title="TrendLine — shared axis" note="GMV and ad spend in the same money. Honest, and the bars are small.">
          <TrendLine
            data={real}
            spend={spend}
            currency="USD"
            ariaLabel="GMV and ad spend by day"
          />
        </Case>

        <Case title="TrendLine — second scale, stated" note="The right-hand label names the bars' own maximum.">
          <TrendLine
            data={real}
            spend={spend}
            spendScale="own"
            currency="USD"
            ariaLabel="GMV by day with ad spend on its own scale"
          />
        </Case>

        <Case title="TrendLine — gaps" note="Four withheld days, and a missing spend day with no bar.">
          <TrendLine data={gapped} spend={spend} currency="USD" ariaLabel="GMV by day with gaps" />
        </Case>

        <Case title="TrendLine — nothing reported">
          <TrendLine data={nulls} currency="USD" ariaLabel="GMV by day, nothing reported" />
        </Case>

        <Case
          title="CombinedChart — the merged view"
          note="GMV and ad spend share one money axis; orders gets its own strip, with its own maximum named."
        >
          <CombinedChart gmv={real} spend={spend} currency="USD" days={30} />
        </Case>

        <Case title="DeltaChip — every state" note="Arrow and sign always; colour only reinforces.">
          <div className="flex flex-wrap items-center gap-2">
            <DeltaChip now={42800} before={36100} suffix="vs prev 30d" />
            <DeltaChip now={1840} before={1920} suffix="vs prev 30d" />
            <DeltaChip now={500} before={500} />
            <DeltaChip now={500} before={0} />
            <DeltaChip now={null} before={500} />
          </div>
        </Case>
      </div>
    </div>
  );
}

/* A NAMED export: `lazyRoute` resolves routes by name, not by default. */
export function ChartGallery() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Gallery theme="light" />
      <Gallery theme="dark" />
    </div>
  );
}
