import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import { ArrowRight, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { useContestEarnings } from '@/lib/creator/useContestEarnings';

/**
 * Contest money on the creator's home screen, BESIDE their offer money.
 *
 * WHY THIS IS A SEPARATE CARD AND NOT A FOURTH CELL IN THE MONEY BLOCK. Rule
 * M10, settled by Rashid on 2026-08-12: a contest pot is its own allocation and
 * is shown beside offer money on every surface, in its own labelled block,
 * never added into the offer figure and never left off. The card above this one
 * leads with "Agreed with you so far", and its three cells add up to that
 * headline BY CONSTRUCTION, which is the property that lets a creator check our
 * arithmetic. A contest reward dropped into that block would break the addition
 * and quietly make the headline a lie.
 *
 * So the separation is structural rather than a label: two cards cannot be
 * added together by accident, and the footer says so in words for anybody
 * reading it rather than looking at it.
 *
 * IT RENDERS NOTHING UNTIL THERE IS MONEY. Most creators are in no contest, and
 * a permanent empty block on the first screen they open is clutter that teaches
 * them to skip that part of the page. The contests screen is where an empty
 * state belongs, because that screen is about contests; this one is about
 * money, and no money means nothing to say.
 *
 * OWED LEADS, NOT PAID. It is the figure they are waiting on, and the whole
 * reason this card exists is that it was invisible on the screen they open
 * first. Paid sits beside it, in the token this product reserves for money that
 * has landed.
 */

export function ContestEarnings() {
  const { data, isLoading } = useContestEarnings();

  /*
   * Bump when money actually lands, and only then.
   *
   * A stage moving under somebody has to be FELT, not just redrawn: that is the
   * rule the whole creator home was rebuilt around. Keyed on the paid total
   * rather than on any change, so a new reward appearing as owed does not
   * animate the paid figure, and the first paint does not animate at all.
   */
  const [bump, setBump] = useState(0);
  const lastPaid = useRef<number | null>(null);

  const totalPaid = (data ?? []).reduce((n, r) => n + r.paid, 0);

  useEffect(() => {
    if (!data) return;
    if (lastPaid.current !== null && totalPaid > lastPaid.current) setBump((n) => n + 1);
    lastPaid.current = totalPaid;
  }, [data, totalPaid]);

  if (isLoading) return null;

  const rows = (data ?? []).filter((r) => r.owed > 0 || r.paid > 0);
  if (rows.length === 0) return null;

  return (
    <section className="border-line bg-surface-1 flex flex-col gap-4 rounded-xl border p-[clamp(16px,2vw,22px)] shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-muted flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
          <Trophy size={14} className="text-stage-due" aria-hidden />
          From contests
        </p>
        <Link
          to="/app/contests?view=progress"
          className="text-accent ease-brand inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold transition-colors hover:underline"
        >
          See where you stand
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      {/*
        One block per currency. Two is possible, and adding across them is the
        single arithmetic error this data can cause, so they never share a row.
      */}
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <CurrencyBlock key={row.currency} row={row} bump={bump} />
        ))}
      </div>

      {/*
        The rule, in words, for somebody reading rather than looking. Without
        this the two cards are just two cards, and the day one figure is quoted
        on a call as "what Wurx owes me" it will be the wrong one.
      */}
      <p className="text-faint max-w-prose text-[12px] leading-relaxed">
        Contest rewards are their own pot. They are not part of the offer money above, and the
        two are never added together.
      </p>
    </section>
  );
}

function CurrencyBlock({
  row,
  bump,
}: {
  row: { currency: string; owed: number; paid: number; owedCount: number; paidCount: number };
  bump: number;
}) {
  const fmt = (n: number) => money(Math.round(n * 100) / 100, row.currency);
  const total = row.owed + row.paid;
  const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const segments = [
    { key: 'paid', value: row.paid, className: 'bg-stage-paid' },
    { key: 'owed', value: row.owed, className: 'bg-stage-due' },
  ].filter((s) => s.value > 0);

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <Cell
          label="Owed to you"
          value={fmt(row.owed)}
          tone="due"
          sub={
            row.owedCount === 0
              ? 'nothing waiting'
              : `${row.owedCount} reward${row.owedCount === 1 ? '' : 's'} earned, not sent yet`
          }
        />
        <Cell
          label="Paid to you"
          value={fmt(row.paid)}
          tone="paid"
          bumpKey={bump}
          sub={
            row.paidCount === 0
              ? 'nothing sent yet'
              : `${row.paidCount} reward${row.paidCount === 1 ? '' : 's'} in your account`
          }
        />
      </dl>

      {segments.length > 0 ? (
        <div
          role="img"
          aria-label={`${fmt(row.paid)} paid, ${fmt(row.owed)} still owed`}
          className="bg-surface-2 flex h-[10px] gap-0.5 overflow-hidden rounded-full"
        >
          {segments.map((s) => (
            <m.span
              key={s.key}
              initial={{ width: 0 }}
              animate={{ width: `${share(s.value)}%` }}
              transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
              className={s.className}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Cell({
  label,
  value,
  sub,
  tone,
  bumpKey,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'due' | 'paid';
  bumpKey?: number;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-lg p-3.5',
        tone === 'due' ? 'bg-stage-due-soft' : 'bg-stage-paid-soft'
      )}
    >
      <dt
        className={cn(
          'text-[12px] font-semibold',
          tone === 'due' ? 'text-stage-due' : 'text-stage-paid'
        )}
      >
        {label}
      </dt>
      <dd
        key={bumpKey}
        className={cn('font-display text-[23px] font-semibold', bumpKey ? 'wx-bump' : undefined)}
      >
        {value}
      </dd>
      <dd className="text-muted text-[12px]">{sub}</dd>
    </div>
  );
}
