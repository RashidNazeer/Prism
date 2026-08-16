import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ROW ONE OF EVERY ADMIN SCREEN: tabs, search, filters, on one line, in one
 * panel with a see-through border.
 *
 * BUILT 2026-08-16 FROM RASHID'S INSTRUCTION, which was specific enough to
 * quote: the section name moves into the top bar, the title row and the
 * description row under it go away entirely, and the first thing on the page is
 * the row of controls, "with transparent borders around that whole row", corners
 * only "very slightly rounded ... do not give it circle look please, the one we
 * have in contest is fine".
 *
 * So this is literally the contests filter row, lifted out and shared, rather
 * than a new interpretation of it. `wx-glass-panel` is the translucent border,
 * `rounded-lg` is the radius he approved. Every screen using this cannot drift
 * from the one he signed off.
 *
 * WHAT GOES IN IT: the controls that change what the list below shows, and
 * nothing else. Not counts, not a heading, not an explanation. The one exception
 * is `action`, which pins a single primary button to the far right of the row on
 * screens where the thing that creates a record has nowhere better to be.
 *
 * IT WRAPS RATHER THAN SCROLLS. At 375px the controls stack inside the panel;
 * a row that scrolls sideways hides a filter behind an edge, and on a phone
 * nobody finds it.
 */
export function FilterBar({
  action,
  className,
  children,
}: {
  /** Optional primary action, pinned right. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'wx-glass-panel flex flex-wrap items-center gap-2 rounded-lg p-2',
        className
      )}
    >
      {children}
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * The segmented control that goes at the left of a `FilterBar`.
 *
 * Every admin screen had grown its own: different heights, different radii,
 * three different ways of showing a count. This is the contests one, which is
 * the one Rashid approved.
 */
export function FilterTabs({
  label,
  className,
  children,
}: {
  /** What the group of tabs filters, for a screen reader. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'bg-surface-2 border-line flex shrink-0 items-center gap-0.5 rounded-md border p-1',
        className
      )}
    >
      {children}
    </div>
  );
}

export function FilterTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  /** Shown as a quiet number after the label. Omit when there is nothing to count. */
  count?: number | undefined;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'ease-brand flex min-h-8 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-[0.8125rem] font-medium transition-colors duration-200',
        active ? 'bg-accent text-on-accent' : 'text-muted hover:text-accent'
      )}
    >
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            'wx-numeric text-[0.6875rem] font-semibold',
            // `text-muted`, never `text-faint`: faint on surface-2 is 4.31:1 in
            // light mode, under AA. Registered in scripts/check-contrast.mjs.
            active ? 'text-on-accent/80' : 'text-muted'
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
