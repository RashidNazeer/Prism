import { Lock } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * What an applicant sees where a creator sees a brand hub.
 *
 * The database already refuses them, so without this they would land on a
 * truthful but baffling "no brands open yet". This says which of the two it is:
 * there is plenty here, it is just not theirs yet.
 *
 * Not a security boundary, and not pretending to be one. The rows are gone
 * before the browser is involved.
 *
 * THE LOCKED PREVIEW, 2026-10-16. It is the shape of the brand header behind
 * the door — a logo well, a name, three stat tiles with their sparkline tracks
 * — drawn as empty furniture and then washed out. Showing the SHAPE of what
 * approval buys is the "walk the real building with the rooms locked" idea the
 * brief asked to keep; showing figures would be worse than useless, because
 * there are none to show and inventing them would teach an applicant to
 * distrust the first real number they ever see here.
 *
 * NO SECOND BLUR, AND THAT IS A HARD RULE. §10 says the locked treatment must
 * not be another `backdrop-filter` layer, and `wx-neo-raised` on the panel is
 * already the one blurred layer this screen is allowed. So the "frosted" read
 * comes from THREE cheap things instead:
 *
 *   1. the preview is furniture, not content — bars and tracks, no real text,
 *      so there is nothing legible to hide in the first place;
 *   2. it is held at low opacity, which costs a composite and no filter;
 *   3. a translucent wash in `--wx-surface-1` sits over it, so the furniture
 *      recedes behind the message rather than competing with it.
 *
 * `filter: blur()` would also have worked and is deliberately not used: it
 * re-rasterises its subtree on every paint for an effect nobody can read on a
 * phone, and the ancestry guard exists because that family of properties is
 * exactly what this product keeps getting wrong.
 */
export function LockedUntilApproved({
  className,
  title = 'This opens when you are approved',
  body = 'Brand hubs, their products and their offers are for creators on the roster. A real person is reading your application, and this unlocks the moment they say yes.',
}: {
  className?: string;
  /** Override for a screen where the locked thing is not a brand hub. */
  title?: string;
  body?: string;
}) {
  return (
    <div
      className={cn(
        /* ONE blurred panel — the same material a real brand header wears, so
           the locked room is recognisably the same room.
           A ONE-CELL GRID, not a stack of absolutely positioned layers: the
           furniture and the message share the single cell, so the panel is as
           tall as whichever of the two is taller. Absolute positioning for the
           message would have let it overhang the furniture at desktop width,
           where the preview is one row and the message is not. */
        'wx-neo-raised relative grid min-w-0 overflow-hidden rounded-2xl p-4 sm:p-5',
        className
      )}
    >
      {/* ------------------------------------------- the furniture, dead -- */}
      <div aria-hidden className="pointer-events-none col-start-1 row-start-1 opacity-40 select-none">
        <div className="flex items-start gap-4">
          <span className="wx-neo-inset grid size-12 shrink-0 place-items-center rounded-full" />
          <span className="min-w-0 flex-1 pt-1.5">
            <span className="bg-surface-2 block h-3.5 w-40 max-w-full rounded-full" />
            <span className="bg-line mt-2 block h-2.5 w-56 max-w-full rounded-full" />
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="wx-neo-raised-sm flex min-h-[7.5rem] flex-col rounded-xl p-3.5"
            >
              <span className="bg-line block h-2 w-20 rounded-full" />
              <span className="bg-surface-2 mt-3 block h-5 w-24 rounded-md" />
              {/* The sparkline track, flat and dashed: the same mark the real
                  charts use for a day nobody measured. */}
              <span className="mt-auto flex h-[2.75rem] items-center pt-3">
                <span
                  className="block h-0 w-full border-t border-dashed"
                  style={{ borderColor: 'var(--chart-grid)' }}
                />
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------- the wash -- */}
      {/*
        A TRANSLUCENT OVERLAY, not a filter. Two stops of the page's own
        surface token: lighter at the top so the furniture is still readable as
        furniture, heavier under the message so the words have their contrast.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, color-mix(in srgb, var(--wx-surface-1) 62%, transparent), color-mix(in srgb, var(--wx-surface-1) 88%, transparent))',
        }}
      />

      {/* ---------------------------------------------------- the message -- */}
      <div className="col-start-1 row-start-1 flex items-center justify-center">
        <div className="wx-neo-raised-sm max-w-md rounded-xl px-5 py-5 text-center">
          <span className="wx-neo-inset text-accent mx-auto grid size-11 place-items-center rounded-full">
            <Lock size={18} aria-hidden />
          </span>
          <p className="mt-3.5 text-[0.9375rem] font-semibold">{title}</p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed">
            {body}
          </p>
          <ButtonLink to="/app" variant="secondary" size="sm" className="mt-4">
            Back to home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
