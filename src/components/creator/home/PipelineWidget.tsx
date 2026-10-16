import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { exactMoney } from '@/components/charts';
import { OFFER_STAGES, STAGE_META } from '@/lib/offer-stages';
import type { WorkSummary } from '@/lib/creator/useMyWork';

/**
 * WHAT SHE HAS BEEN PROMISED, AND HOW FAR IT HAS TRAVELLED.
 *
 * Brought back at Rashid's request after the Home rewrite dropped it: "older
 * version had this as well make a widget to display this in home as well".
 *
 * IT IS NOT THE SAME MONEY AS THE TILES ABOVE IT, which is why it earns a
 * place on a screen whose rule is that everything must lead to more money. The
 * four tiles are MEASURED money — GMV TikTok reported, ad spend actually
 * spent. This is AGREED money: what a brand committed to her, and how close it
 * is to being paid. "How am I doing" is the first; "what am I owed" is this,
 * and nothing else on Home answers it.
 *
 * THREE TILES, NOT A RIBBON. The first build drew one stacked bar across the
 * full width with a legend under it and a row of stage chips under that.
 * Rashid: "this does.nt look good as well." He was right — on a desktop that
 * is a 1500px-wide, 8px-tall bar carrying three numbers, with the stage chips
 * repeating the same three amounts a second time, because with a small
 * pipeline each bucket holds exactly one stage. It now uses the same tile
 * language as the four metric tiles directly above it: three equal cards, each
 * with its own figure, its own count, and a short bar showing its share. One
 * row, no stretching, nothing said twice.
 *
 * IT COSTS NO QUERY. `useMyWork` is already fetched on Home for "Up next", and
 * `summarise` is the same pure function the jobs screen uses, so these figures
 * cannot drift from the ones there.
 */

const BUCKETS = [
  { key: 'working', label: 'In progress', token: '--chart-3' },
  { key: 'due', label: 'Awaiting payment', token: '--chart-4' },
  { key: 'paid', label: 'Paid', token: '--chart-2' },
] as const;

export function PipelineWidget({ summary }: { summary: WorkSummary }) {
  const { money, byStage } = summary;

  /* NOTHING AGREED MEANS NO WIDGET. An empty pipeline panel is a box
     apologising for itself; she has not been given a job yet, and Offers is
     the place that fixes that. */
  if (money.total <= 0) return null;

  /* How many JOBS sit in each bucket, not just how much money — "1 job" and
     "$360" answer different questions, and a creator with four jobs in
     progress wants the count. */
  const countFor = (bucket: 'working' | 'due' | 'paid') =>
    OFFER_STAGES.filter((s) => STAGE_META[s].bucket === bucket).reduce(
      (n, s) => n + byStage[s].count,
      0
    );

  return (
    <section className="wx-neo-raised rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-text text-sm font-semibold">
          Your pipeline
          <span className="text-muted ms-2 text-xs font-normal">
            {exactMoney(money.total, money.currency)} agreed with you
          </span>
        </h2>
        <Link
          to="/app/content?view=dashboard"
          className="text-accent inline-flex min-h-11 items-center gap-1 text-xs font-medium"
        >
          See your jobs
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>

      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {BUCKETS.map((b) => {
          const amount = money[b.key];
          const jobs = countFor(b.key);
          const share = money.total > 0 ? (amount / money.total) * 100 : 0;
          return (
            <li key={b.key} className="wx-neo-raised-sm rounded-lg p-3">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(${b.token})` }}
                />
                <span className="text-muted text-[0.6875rem] font-medium">{b.label}</span>
              </div>
              <p className="text-text mt-1 text-lg leading-none font-bold tabular-nums">
                {exactMoney(amount, money.currency)}
              </p>
              <p className="text-faint mt-1 text-[0.625rem]">
                {jobs === 0 ? 'nothing here' : `${jobs} job${jobs === 1 ? '' : 's'}`}
              </p>
              {/* The share, as a short bar inside its own tile rather than one
                  long ribbon across the page. */}
              <div
                className="mt-2 h-1 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--chart-grid)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${share}%`, backgroundColor: `var(${b.token})` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
