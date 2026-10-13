import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * THE PERIOD CONTROL ON THE PAID COLLABS BRAND PAGE.
 *
 * Rashid, 2026-10-13: the calendar "should allow clients to select date range as
 * well like it is on the creator login", and the figures should be readable
 * "using a date range or last 7 days".
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 *
 * What it replaces is `<input type="month">` — a NATIVE browser control. That is
 * why the popover in Rashid's screenshot looked nothing like the rest of the
 * product: the blue highlight, the "Clear" and "This month" links and the year
 * box are Chrome's own chrome, not ours. It also cannot be configured, cannot be
 * themed, offers no presets, and has no concept of a range. There was nothing to
 * adjust; it had to be replaced.
 *
 * ── THE SHAPE OF A PERIOD ────────────────────────────────────────────────────
 *
 * One string, two forms, matching `periodBounds` in collab-ad-figures:
 *
 *   `2026-09`                  a whole calendar month
 *   `2026-09-01..2026-09-07`   an inclusive day range
 *
 * A month is still the default and still the thing the rest of the page runs
 * on, because on this screen a month is not merely a filter — it is the
 * CONTRACT CYCLE. A creator is onboarded into a month, a contract carries one,
 * and budget, allocated and paid are all month concepts. So choosing a month
 * behaves exactly as it always did, and a range is an addition rather than a
 * replacement.
 *
 * ── WHAT A RANGE DOES AND DOES NOT SCOPE, STATED ON THE CONTROL ──────────────
 *
 * Only the Euka ad figures can honour a range today; views and GMV come from
 * the brand's creator roster for the month cycle. Rather than let that be
 * discovered by someone reconciling numbers, the control says so itself while a
 * range is active. See PARKED 0a for the work that would make the rest of the
 * block range-able.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const daysBack = (n: number) => {
  const t = todayUtc();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - n));
};
const monthKeyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** `2026-09` or `2026-09-01..2026-09-07` into something a person reads. */
export function periodLabel(period: string): string {
  const key = (period ?? '').trim();
  if (!key) return 'All time';
  const range = /^(\d{4})-(\d{2})-(\d{2})\.\.(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (range) {
    const [, y1, m1, d1, y2, m2, d2] = range;
    const left = `${Number(d1)} ${MONTHS[Number(m1) - 1]}`;
    const right = `${Number(d2)} ${MONTHS[Number(m2) - 1]}`;
    /* The year is said once when both ends share it, and on both when they do
       not — a range that crosses New Year is exactly when the year matters. */
    return y1 === y2 ? `${left} – ${right} ${y1}` : `${left} ${y1} – ${right} ${y2}`;
  }
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return key;
}

type Preset = { id: string; label: string; period: () => string };

/*
 * The presets, in the order a person reaches for them. "Last 7 days" is first
 * because it is the one Rashid named; the month entries are the cycle the page
 * is built around and keep their place beside it.
 */
const PRESETS: Preset[] = [
  { id: 'd7', label: 'Last 7 days', period: () => `${iso(daysBack(6))}..${iso(todayUtc())}` },
  { id: 'd30', label: 'Last 30 days', period: () => `${iso(daysBack(29))}..${iso(todayUtc())}` },
  { id: 'd90', label: 'Last 90 days', period: () => `${iso(daysBack(89))}..${iso(todayUtc())}` },
  { id: 'tm', label: 'This month', period: () => monthKeyOf(todayUtc()) },
  {
    id: 'lm',
    label: 'Last month',
    period: () => {
      const t = todayUtc();
      return monthKeyOf(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)));
    },
  },
];

export function CollabPeriodPicker({
  period,
  onChange,
  disabled = false,
}: {
  /** `YYYY-MM`, `YYYY-MM-DD..YYYY-MM-DD`, or '' for all time. */
  period: string;
  onChange: (period: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => {
    const m = /^(\d{4})/.exec(period || monthKeyOf(todayUtc()));
    return Number(m?.[1] ?? todayUtc().getUTCFullYear());
  });
  const isRange = /\.\./.test(period);
  const [from, setFrom] = useState(() => (isRange ? period.split('..')[0]! : iso(daysBack(6))));
  const [to, setTo] = useState(() => (isRange ? period.split('..')[1]! : iso(todayUtc())));

  const wrap = useRef<HTMLDivElement>(null);

  /* Close on an outside click or on Escape. A popover that can only be closed
     by choosing something traps anyone who opened it by accident. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activePreset = useMemo(
    () => PRESETS.find((p) => p.period() === period)?.id ?? null,
    [period],
  );

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const maxDay = iso(todayUtc());

  return (
    <div ref={wrap} className="wx-period" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="wx-period-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Choose a month or a date range"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="wx-period-label">{periodLabel(period)}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="wx-period-pop" role="dialog" aria-label="Choose a period">
          <div className="wx-period-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`wx-period-preset${activePreset === p.id ? ' is-on' : ''}`}
                onClick={() => choose(p.period())}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="wx-period-sep" />

          {/* The month grid, which is what this control replaces and still the
              default way to drive the page. */}
          <div className="wx-period-yearrow">
            <button type="button" className="wx-period-arrow" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">‹</button>
            <span className="wx-period-year">{year}</span>
            <button type="button" className="wx-period-arrow" onClick={() => setYear((y) => y + 1)} aria-label="Next year">›</button>
          </div>
          <div className="wx-period-months">
            {MONTHS.map((m, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button
                  key={m}
                  type="button"
                  className={`wx-period-month${period === key ? ' is-on' : ''}`}
                  onClick={() => choose(key)}
                >
                  {m}
                </button>
              );
            })}
          </div>

          <div className="wx-period-sep" />

          {/* The custom range. Two native day inputs rather than a hand-built
              calendar: a day picker is the one thing the browser's own control
              does well, and it brings keyboard entry and the locale's date
              order for free. */}
          <div className="wx-period-custom">
            <label className="wx-period-field">
              <span>From</span>
              <input type="date" value={from} max={to || maxDay} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="wx-period-field">
              <span>To</span>
              <input type="date" value={to} min={from} max={maxDay} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button
              type="button"
              className="wx-period-apply"
              disabled={!from || !to || from > to}
              onClick={() => choose(`${from}..${to}`)}
            >
              Apply range
            </button>
          </div>

          {/*
            SAID ON THE CONTROL, not in a tooltip and not nowhere.

            A range scopes the Euka ad figures, which are stored per day. It does
            NOT scope views and GMV: those come from the brand's creator roster
            for the month cycle. Anyone reconciling the cards deserves to know
            that before they start, rather than after.
          */}
          {isRange && (
            <p className="wx-period-note">
              A range scopes <b>ad spend</b>. Views, GMV and the creator table stay
              on the month cycle.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
