import { useState } from 'react';
import { TrendLine, compactMoney, exactMoney, type ChartPoint } from '@/components/charts';
import { CombinedChart } from '@/components/creator/home/CombinedChart';

/**
 * MY NUMBERS' CHART, AGAINST FIXTURES. DEV ONLY.
 *
 * The page itself needs a signed-in session; this renders its chart the way the
 * page now builds it: the series starts at her first measured day (not the
 * window's floor) and a missing day after that stays a gap. `?state=old` draws
 * the previous behaviour for comparison.
 */
const label = (i: number) =>
  new Date(Date.UTC(2026, 8, 9 + i)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const build = (skip: number): { gmv: ChartPoint[]; spend: ChartPoint[] } => {
  const gmv: ChartPoint[] = [];
  const spend: ChartPoint[] = [];
  for (let i = skip; i < 30; i++) {
    const gap = i === skip + 4;
    gmv.push({ label: label(i), value: gap ? null : Math.round(90 + (i - skip) * 55) });
    spend.push({ label: label(i), value: gap ? null : Math.round(20 + (i - skip) * 6) });
  }
  return { gmv, spend };
};

function Pane({ theme, old }: { theme: 'light' | 'dark'; old: boolean }) {
  const { gmv, spend } = build(old ? 0 : 22);
  const sum = (s: ChartPoint[]) => s.reduce((t, p) => t + (p.value ?? 0), 0);
  return (
    <div data-theme={theme} className="bg-bg min-h-screen flex-1 p-4">
      <p className="text-faint mb-3 text-xs font-bold uppercase">{theme}</p>
      <section className="wx-neo-raised rounded-xl p-4">
        <h2 className="text-text mb-3 text-sm font-semibold">Day by day</h2>
        <CombinedChart gmv={gmv} spend={spend} currency="USD" days={30} />
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['GMV', sum(gmv)],
            ['Ad spend', sum(spend)],
          ].map(([l, v]) => (
            <div key={l as string} className="wx-neo-raised-sm rounded-lg p-2">
              <dt className="text-muted text-[0.625rem] font-semibold uppercase">{l}</dt>
              <dd className="text-text text-sm font-semibold">{compactMoney(v as number, 'USD')}</dd>
              <dd className="text-faint text-[0.625rem]">{exactMoney(v as number, 'USD')}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted mt-3 text-xs">
          <span className="font-semibold">Commission</span> Not reported
        </p>
      </section>
      <div className="mt-4 hidden">
        <TrendLine data={gmv} currency="USD" ariaLabel="" />
      </div>
    </div>
  );
}

export function NumbersPreview() {
  const [old] = useState(() => new URLSearchParams(window.location.search).get('state') === 'old');
  return (
    <div className="flex min-h-screen flex-col xl:flex-row">
      <Pane theme="light" old={old} />
      <Pane theme="dark" old={old} />
    </div>
  );
}
