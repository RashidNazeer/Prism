import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/creator/DateRangePicker';
import { presetToRange, type PresetKey } from '@/lib/creator/date-range';
import type { PerformanceWindow } from '@/lib/creator/usePerformance';
import type { CreatorPeriod, PeriodKey } from '@/lib/creator/useCreatorPeriod';

/**
 * 7D · 30D · 90D · Custom, and the brand filter beside them.
 *
 * ONE CONTROL FOR THE WHOLE PAGE. §5.1a is explicit that the choice applies to
 * every widget at once: a dashboard where each card carries its own date
 * picker is a dashboard whose cards cannot be compared with each other.
 *
 * THEY ARE PILLS, LIKE THE BRAND CHIP BESIDE THEM. Rashid, looking at the live
 * page: "make the buttons like the all brands one". He was right that it read
 * as broken — the brand chip was a proper glass pill and these were bare words
 * with only the selected one wearing a surface, so four controls doing one job
 * came in two shapes. They all wear the material now; SELECTION is carried by
 * weight and ink, not by whether a button looks like a button at all.
 *
 * CUSTOM OPENS THE REAL CALENDAR. It used to set `period=custom` with the
 * dates it already had, which did nothing visible — a dead control. The fourth
 * chip is now the app's own `DateRangePicker`: two months, click a day for the
 * start and another for the end. It was already built, already styled and
 * already keyboard-accessible, so the alternative was a second calendar in the
 * product disagreeing with the first.
 *
 * Every chip is 2.75rem tall — the 44px floor — which is also why these are
 * chips and not a `<select>`: a dropdown hides three of the four answers
 * behind a tap on the question she asks most.
 */
export function PeriodChips({
  period,
  window: w,
  className,
}: {
  period: CreatorPeriod;
  /** Needed to turn a preset into real dates, and to bound the calendar. */
  window: PerformanceWindow | undefined;
  className?: string;
}) {
  const quick: PeriodKey[] = ['7', '30', '90'];

  /*
   * THE PICKER'S PRESET VOCABULARY IS WIDER THAN OURS. It offers 6m, 12m,
   * thisMonth and more, which this page has no key for — so anything that is
   * not one of our three becomes a custom range with real dates resolved from
   * the same helper the picker itself uses. Nothing is dropped and nothing has
   * to be re-implemented.
   */
  const onPick = (preset: PresetKey, range: { from: string; to: string } | null) => {
    if (preset === '7' || preset === '30' || preset === '90') return period.setPeriod(preset);
    const resolved =
      preset === 'custom' ? range : presetToRange(preset, w);
    if (resolved) period.setPeriod('custom', { from: resolved.from, to: resolved.to });
  };

  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      role="group"
      aria-label="Period"
    >
      {quick.map((key) => {
        const active = period.key === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => period.setPeriod(key)}
            aria-pressed={active}
            className={cn(
              'wx-neo-raised-sm min-h-11 rounded-full px-3.5 text-xs transition-colors sm:min-h-9',
              active ? 'text-text font-bold' : 'text-muted hover:text-text font-medium'
            )}
          >
            {key}D
          </button>
        );
      })}

      <DateRangePicker
        preset={period.key === 'custom' ? 'custom' : (period.key as PresetKey)}
        range={period.from && period.to ? { from: period.from, to: period.to } : null}
        window={w}
        onChange={onPick}
      />
    </div>
  );
}
