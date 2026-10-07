import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  PRESETS,
  WEEKDAYS,
  clamp,
  dayLabel,
  firstOfMonth,
  monthCells,
  monthTitle,
  presetToRange,
  rangeLabel,
  shiftMonthKey,
  type DateRange,
  type PresetKey,
} from '@/lib/creator/date-range';
import type { PerformanceWindow } from '@/lib/creator/usePerformance';
import { cn } from '@/lib/utils';

/**
 * ANY DATE RANGE, on the creator's own numbers.
 *
 * Rashid, 2026-10-07, with a screenshot of a two-month picker: "the data can be
 * displayed for any date range ... Make it like a calender okay?"
 *
 * IT REPLACES FOUR TABS THAT WERE A DELIBERATE CHOICE, and the note it replaces
 * said so: the ranges were "deliberately a set of ranges rather than two date
 * pickers". That was right while the only questions were "this week" and "this
 * month"; it stops being right the moment somebody wants a campaign's fortnight.
 * The shortcuts are kept so the common questions are still one click.
 *
 * HAND-BUILT, NO DEPENDENCY. The stack in CLAUDE.md is locked and every colour
 * on this screen has to be a `--wx-*` token; dragging a third-party calendar's
 * stylesheet into that is more work than the grid below, and it would be the
 * only library of its kind in the repo.
 *
 * A PORTAL, NOT AN ABSOLUTE PANEL. `RowActions` already learned this: the
 * trigger lives inside `FilterBar`, and a panel positioned inside it is clipped
 * by any ancestor that scrolls or hides overflow. So it renders to `body`,
 * measures the trigger, and flips above when there is no room below.
 *
 * NOTHING IS APPLIED UNTIL BOTH ENDS EXIST. A half-made range — one click in —
 * would otherwise fire a query for a single day and redraw every figure on the
 * screen under the person's cursor.
 */

const PANEL_W = 36; /* rem, two months side by side */

export function DateRangePicker({
  preset,
  range,
  window: w,
  onChange,
}: {
  preset: PresetKey;
  range: DateRange | null;
  window: PerformanceWindow | undefined;
  onChange: (preset: PresetKey, range: DateRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  /* The left-hand month on screen. Starts where the current range does, so
     opening the picker shows the period being looked at rather than today. */
  const [leftMonth, setLeftMonth] = useState<string>(() =>
    (range?.from ?? w?.latest ?? new Date().toISOString().slice(0, 10)).slice(0, 7)
  );
  /* The first click of a new range, before the second lands. */
  const [anchor, setAnchor] = useState<string | null>(null);
  /* The day under the cursor, so the half-made range previews. */
  const [hover, setHover] = useState<string | null>(null);

  const floor = w?.earliest ?? null;
  const ceil = useMemo(() => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (!w?.latest) return yesterday;
    return w.latest < yesterday ? w.latest : yesterday;
  }, [w?.latest]);

  const close = useCallback(() => {
    setOpen(false);
    setAnchor(null);
    setHover(null);
    btnRef.current?.focus();
  }, []);

  /* Position: measured, and flipped above when the panel would fall off. */
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 15;
    const wantW = Math.min(PANEL_W * rem, window.innerWidth - 16);
    const wantH = 24 * rem;
    const above = r.bottom + wantH > window.innerHeight && r.top > wantH;
    /* Right-aligned to the trigger, then pulled back inside the viewport. The
       8px gutter is the same one `check-responsive` measures against. */
    let left = r.right - wantW;
    if (left < 8) left = 8;
    if (left + wantW > window.innerWidth - 8) left = window.innerWidth - 8 - wantW;
    setPos({ top: above ? r.top - wantH - 8 : r.bottom + 8, left, above });
  }, [open]);

  /* Escape, outside click, and closing on scroll or resize rather than trying
     to follow the trigger — the house pattern from RowActions. */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onMove = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const pick = (day: string) => {
    if (!anchor) {
      setAnchor(day);
      setHover(day);
      return;
    }
    /* Clicked before the anchor: treat it as the start, not as an error. */
    const next: DateRange =
      anchor <= day ? { from: anchor, to: day } : { from: day, to: anchor };
    const clamped = clamp(next, w);
    setAnchor(null);
    setHover(null);
    if (clamped) onChange('custom', clamped);
    close();
  };

  const choosePreset = (key: Exclude<PresetKey, 'custom'>) => {
    onChange(key, presetToRange(key, w));
    close();
  };

  /* The provisional range while one end is held. */
  const draft: DateRange | null =
    anchor && hover
      ? anchor <= hover
        ? { from: anchor, to: hover }
        : { from: hover, to: anchor }
      : null;
  const shown = draft ?? range;

  const months = [leftMonth, shiftMonthKey(leftMonth, 1)];
  const canBack = !floor || firstOfMonth(leftMonth) > floor;
  const canFwd = shiftMonthKey(leftMonth, 1) < ceil.slice(0, 7);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'border-line bg-surface-2 text-muted hover:border-accent hover:text-accent inline-flex min-h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-[0.8125rem] font-medium transition-colors',
          open && 'border-accent text-accent'
        )}
      >
        <CalendarDays size={14} aria-hidden />
        <span className="wx-numeric">{rangeLabel(preset, range)}</span>
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Choose a date range"
              style={{
                top: pos.top,
                left: pos.left,
                width: `min(${PANEL_W}rem, calc(100vw - 1rem))`,
              }}
              className="border-line bg-surface-1 fixed z-50 rounded-xl border p-3 shadow-lg"
            >
              {/* The two months. One below 48rem, because two will not fit a
                  phone without the page scrolling sideways, which is the rule
                  this screen is checked against. */}
              <div className="flex items-center justify-between gap-2 pb-2">
                <button
                  type="button"
                  aria-label="Earlier months"
                  disabled={!canBack}
                  onClick={() => setLeftMonth((m) => shiftMonthKey(m, -1))}
                  className="text-muted hover:text-accent grid size-7 shrink-0 place-items-center rounded-md disabled:opacity-30"
                >
                  <ChevronLeft size={16} aria-hidden />
                </button>
                <div className="grid flex-1 grid-cols-1 gap-3 text-center sm:grid-cols-2">
                  {months.map((m, i) => (
                    <span
                      key={m}
                      className={cn(
                        'text-[0.8125rem] font-semibold',
                        i === 1 && 'hidden sm:block'
                      )}
                    >
                      {monthTitle(m)}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Later months"
                  disabled={!canFwd}
                  onClick={() => setLeftMonth((m) => shiftMonthKey(m, 1))}
                  className="text-muted hover:text-accent grid size-7 shrink-0 place-items-center rounded-md disabled:opacity-30"
                >
                  <ChevronRight size={16} aria-hidden />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {months.map((m, i) => (
                  <Month
                    key={m}
                    monthKey={m}
                    className={i === 1 ? 'hidden sm:block' : undefined}
                    floor={floor}
                    ceil={ceil}
                    shown={shown}
                    anchor={anchor}
                    onPick={pick}
                    onHover={setHover}
                  />
                ))}
              </div>

              {/* The shortcuts, under the calendar exactly as in the picker
                  Rashid sent. Two columns so nine of them stay one glance. */}
              <div className="border-line mt-3 grid grid-cols-2 gap-1.5 border-t pt-3">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => choosePreset(p.key)}
                    aria-pressed={preset === p.key}
                    className={cn(
                      'border-line hover:border-accent hover:text-accent min-h-8 rounded-md border px-2 text-[0.75rem] font-medium transition-colors',
                      preset === p.key
                        ? 'bg-accent-soft text-accent border-accent'
                        : 'text-muted'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <p className="text-faint mt-2 text-[0.6875rem] leading-relaxed">
                {anchor
                  ? `Pick the end date. Starting ${dayLabel(anchor)}.`
                  : 'Figures land the day after, so today is never included.'}
              </p>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function Month({
  monthKey,
  className,
  floor,
  ceil,
  shown,
  anchor,
  onPick,
  onHover,
}: {
  monthKey: string;
  className?: string;
  floor: string | null;
  ceil: string;
  shown: DateRange | null;
  anchor: string | null;
  onPick: (d: string) => void;
  onHover: (d: string | null) => void;
}) {
  const cells = useMemo(() => monthCells(monthKey), [monthKey]);
  return (
    <div className={className}>
      <div className="text-faint grid grid-cols-7 gap-0.5 pb-1 text-center text-[0.625rem] font-semibold">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5" onMouseLeave={() => anchor && onHover(null)}>
        {cells.map((day, i) => {
          if (!day) return <span key={`pad-${i}`} aria-hidden />;
          const outside = (floor && day < floor) || day > ceil;
          const inRange = shown ? day >= shown.from && day <= shown.to : false;
          const isEnd = shown ? day === shown.from || day === shown.to : false;
          return (
            <button
              key={day}
              type="button"
              disabled={Boolean(outside)}
              onClick={() => onPick(day)}
              onMouseEnter={() => anchor && onHover(day)}
              aria-pressed={isEnd}
              aria-label={dayLabel(day)}
              className={cn(
                'wx-numeric grid h-8 place-items-center rounded-sm text-[0.75rem] transition-colors',
                outside && 'text-faint cursor-not-allowed opacity-40',
                !outside && !inRange && 'text-muted hover:bg-surface-2 hover:text-accent',
                /* The middle of a range is a wash, the ends are solid: the shape
                   of the selection has to read at a glance without counting. */
                inRange && !isEnd && 'bg-accent/15 text-text',
                isEnd && 'bg-accent text-on-accent font-semibold'
              )}
            >
              {Number(day.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
