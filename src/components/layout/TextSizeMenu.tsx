import { useEffect, useRef, useState } from 'react';
import { Check, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UI_SCALES, useUiScale } from '@/lib/ui-scale';

/**
 * TEXT SIZE, WHERE A PERSON CAN ACTUALLY REACH IT.
 *
 * Rashid asked for the product to be a little smaller AND for the size to be
 * changeable. The second half is why this exists as a control rather than a
 * constant: "smaller" is a preference, and the person who finds our new default
 * too tight should be able to say so without asking anybody.
 *
 * IT SITS IN THE TOP BAR, next to the theme toggle, not on a settings screen.
 * Two reasons. Staff have no settings screen at all, so it would have had
 * nowhere to live on the admin side. And a size control you cannot see while
 * you change it is a bad size control: from here every adjustment is visible on
 * the page behind the menu, so it is picked by looking rather than by guessing.
 *
 * It writes to `localStorage` and to the document, so it survives a reload, a
 * token refresh and a second tab. See `src/lib/ui-scale.ts`.
 */
export function TextSizeMenu({ className }: { className?: string }) {
  const [scale, setScale] = useUiScale();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click away and Escape both close it. A popover that can only be dismissed
  // by choosing something forces a change on somebody who opened it to look.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Text size"
        title="Text size"
        className={cn(
          'border-line bg-surface-1/60 text-muted ease-brand grid size-10 place-items-center',
          'rounded-full border backdrop-blur-sm transition-colors duration-200',
          'hover:border-line-interactive hover:text-accent',
          open && 'border-accent text-accent'
        )}
      >
        <Type size={16} strokeWidth={2} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Text size"
          className="border-line bg-surface-1 absolute top-full right-0 z-50 mt-2 w-44 rounded-lg border p-1 shadow-lg"
        >
          {UI_SCALES.map((s) => {
            const active = s.value === scale;
            return (
              <button
                key={s.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setScale(s.value);
                  setOpen(false);
                }}
                className={cn(
                  'ease-brand flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left',
                  'transition-colors duration-150',
                  active ? 'bg-accent-soft text-accent font-semibold' : 'text-muted hover:bg-surface-2 hover:text-text'
                )}
              >
                {/* Each option is drawn at the size it sets, so the choice is
                    made by looking at it rather than by reading a word. The
                    sizes are `px` on purpose: they must NOT follow the root
                    scale, or every option would look the same. */}
                <span style={{ fontSize: `${s.px}px` }} className="flex-1 truncate">
                  {s.label}
                </span>
                {active ? <Check size={14} aria-hidden className="shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
