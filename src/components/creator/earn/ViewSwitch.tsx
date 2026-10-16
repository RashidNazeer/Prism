import { cn } from '@/lib/utils';

/**
 * Two views of contests, one URL: the LIST, and her own progress across all of
 * them.
 *
 * THE DEFAULT IS THE LIST, NOT THE SUMMARY. Rashid has asked for this twice:
 * the default section is the JOB, not the figures. Somebody opening Contests is
 * looking for something to enter or something to file, and a wall of their own
 * totals would push that below the fold.
 *
 * NOT A SEGMENTED CONTROL BETWEEN CONTESTS AND OFFERS. §8 asked for the two to
 * be merged into one `/app/earn` behind exactly that; Rashid overruled it —
 * "keep all the current tabs please" — so Contests and Offers stay two pages on
 * their own routes with their own nav labels, and this switch does the job it
 * always did.
 */
export function ViewSwitch({
  view,
  onChange,
}: {
  view: 'contests' | 'progress';
  onChange: (next: 'contests' | 'progress') => void;
}) {
  const options = [
    { key: 'contests' as const, label: 'Contests' },
    { key: 'progress' as const, label: 'My progress' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Contests view"
      className="wx-neo-inset mt-4 flex w-fit gap-1 rounded-xl p-1"
    >
      {options.map((o) => {
        const active = view === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              'ease-brand min-h-[2.75rem] rounded-lg px-4 text-[0.8125rem] font-semibold transition-colors sm:min-h-[2.25rem] pointer-coarse:min-h-[2.75rem]',
              active ? 'wx-neo-raised-sm text-text' : 'text-muted hover:text-text'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
