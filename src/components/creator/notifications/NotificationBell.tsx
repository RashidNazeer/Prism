import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreatorNotifications } from '@/lib/creator/useCreatorNotifications';
import { NotificationItem } from '@/components/creator/notifications/NotificationItem';

/**
 * THE BELL, AND THE ONE PANEL BEHIND IT.
 *
 * Both external reviewers asked for notifications and the app had none. What a
 * creator wants to know is small and specific — a request was decided, a
 * sample shipped, a video was reviewed, a reward landed — and every one of
 * those is already a row in the database with a timestamp on it. So this
 * surfaces events that have already happened rather than introducing a
 * messaging system: see `useCreatorNotifications` for exactly which four
 * tables, and for the two things it honestly cannot do (sync read state
 * between devices, and reach a phone with the app shut).
 *
 * CREATOR SIDE ONLY. `AppShell` is shared with the admin panel, so the bell is
 * rendered there behind a role check and the admin top bar is unchanged. This
 * component reads creator hooks and must never mount for staff.
 *
 * THE BLUR BUDGET, counted rather than assumed. THIS PANEL ADDS ZERO BLURRED
 * LAYERS, at every width. `wx-glass-overlay` is the floating-menu material —
 * the near-opaque modal fill with the card's radius and no `backdrop-filter`
 * at all — which is the right material for something hanging over arbitrary
 * content anyway, and the rows inside it are `wx-neo-raised-sm`, which never
 * blurs either. So at 375px, where `check-blur-budget.mjs` measures, the count
 * with this panel open is the top bar and nothing else: `wx-glass-chrome` is
 * the only thing that blurs at phone width, since the card material and the
 * phone bottom bar's `wx-nav-blur` both start at `md`.
 *
 * There is deliberately NO SCRIM. `wx-glass-scrim` blurs, so a scrim under
 * this would both spend a layer and stack a blur beneath a panel, which §4.3
 * bans; the sanctioned scrim-plus-modal pair is for a real dialog, and this is
 * a popover. Dismissal is pointer-away and Escape, exactly as `TextSizeMenu`
 * does it two buttons to the right.
 *
 * MOTION is opacity and translateY only, and nothing at all under
 * `prefers-reduced-motion`. `m.div`, never `motion.div`: `LazyMotion` is
 * `strict` and the full component throws.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { items, unreadCount, markAllRead, markRead, isLoading, failed } =
    useCreatorNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // Pointer away and Escape both close it, the same contract as every other
  // popover in the bar. A panel that can only be dismissed by choosing
  // something traps whoever opened it to look.
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

  /*
   * WHERE THE PANEL SITS, MEASURED RATHER THAN ASSUMED. 2026-10-17.
   *
   * Rashid: "notification dropdown is out of screen". It was, and off the LEFT
   * edge rather than the right, which is why `w-[min(21rem,calc(100vw-1.5rem))]`
   * had not helped: that clamp stops the panel being WIDER than the window, and
   * says nothing about where the window it is clamped to begins.
   *
   * The arithmetic, measured in the browser at the shell's 15px root. The bell
   * is the FIRST of four controls in the bar, so its right edge is the header's
   * gutter (0.75rem) plus the header's padding (1rem) plus three 2.75rem
   * circles and three 0.5rem gaps — 11.5rem, about 172px, in from the right of
   * the window. `right-0` pins the panel's right edge there, so a 297px panel
   * on a 320px screen starts at -150px and the whole left half of every row,
   * including the "Notifications" heading, is off the screen. Screenshotted at
   * 320 before touching it. It is fully on screen from 768px up, which is why
   * it survived review.
   *
   * SO THE PANEL IS CLAMPED TO THE WINDOW, not to its trigger: right-aligned to
   * the bell where there is room, and slid rightwards until its left edge
   * clears the gutter where there is not. One measurement, in a layout effect,
   * so it is placed before the first paint rather than jumping after it.
   *
   * IT CANNOT BE `position: fixed`. The header carries `wx-glass-chrome`, which
   * is a `backdrop-filter`, and a filtered element is a containing block for
   * fixed descendants — measured: a `fixed; top:0; left:0` probe inside this
   * header lands at the header's corner, not the window's. So the offset is
   * applied to the `absolute` box instead.
   *
   * THE HEIGHT IS CAPPED THE SAME WAY, and for the same kind of reason. That
   * `backdrop-filter` also opens a stacking context, so this panel's `z-50` is
   * scoped INSIDE the header's `z-40`, and `MobileNav` is a later sibling at
   * `z-40` — meaning the phone bottom bar paints OVER this panel wherever they
   * meet, which they do on a short window (measured at 740x360: the bar's own
   * link wins the hit test 21px inside the panel). Rather than portal the panel
   * out of the header, it is simply not allowed to reach the bar.
   */
  const [place, setPlace] = useState<{ right: number; width: number; maxHeight: number } | null>(
    null
  );

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const doc = document.documentElement;
      /* Everything below is in `rem` and converted here, so the panel keeps
         its proportions at every text-size setting rather than freezing at
         one root. */
      const rem = parseFloat(getComputedStyle(doc).fontSize) || 16;
      const gutter = 0.75 * rem; // the shell's one gutter, same as `mx-3`.
      /* `clientWidth`, not `100vw`: `vw` counts the desktop scrollbar, and a
         panel measured against it hangs that far off the edge. */
      const vw = doc.clientWidth;
      const vh = doc.clientHeight;
      const anchor = wrap.getBoundingClientRect();

      const width = Math.min(21 * rem, vw - 2 * gutter);
      const left = Math.min(Math.max(anchor.right - width, gutter), vw - gutter - width);

      /* Below `lg` the phone bar floats 0.75rem up from the safe area and is
         about 3.5rem tall; 5.5rem is the clearance `AppShell` already reserves
         under the content for exactly that, so the two cannot drift apart. */
      const clear = window.matchMedia('(min-width: 1024px)').matches ? gutter : 5.5 * rem + gutter;
      const top = anchor.bottom + 0.5 * rem; // `mt-2`
      /* Never smaller than a header and two rows, or a short window would
         collapse the panel into a sliver that says nothing. */
      const maxHeight = Math.max(11 * rem, Math.min(26 * rem, vh - top - clear));

      setPlace({ right: anchor.right - (left + width), width, maxHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  /* "3 unread" rather than a bare number, because the badge is `aria-hidden`
     and the count has to reach a screen reader through the label. */
  const label =
    unreadCount > 0
      ? `Notifications, ${unreadCount} unread`
      : 'Notifications, nothing new';

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title="Notifications"
        className={cn(
          /* The same 2.75rem neomorphic circle as TextSizeMenu, ThemeToggle
             and the menu button, so the row of controls stays one row of one
             kind of control. */
          /* `relative` is for the badge below, which must anchor to the button
             rather than to the wrapper the panel is positioned against. */
          'wx-neo-raised-sm wx-neo-press text-muted ease-brand relative grid size-11 place-items-center',
          'hover:text-accent rounded-full transition-colors duration-200',
          open && 'wx-neo-pressed text-accent'
        )}
      >
        <Bell size={16} strokeWidth={2} aria-hidden />

        {unreadCount > 0 ? (
          <span
            aria-hidden
            className={cn(
              'bg-accent text-on-accent absolute -top-0.5 -right-0.5 grid min-w-[1.125rem]',
              'place-items-center rounded-full px-1 text-[0.625rem] leading-[1.125rem] font-bold',
              'tabular-nums'
            )}
          >
            {/* Past nine the exact number stops being information and starts
                being a wide badge. */}
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <m.div
          role="dialog"
          aria-label="Notifications"
          initial={reduced ? false : { opacity: 0, y: -6 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'wx-neo-raised-sm absolute top-full right-0 z-50 mt-2 rounded-xl',
            /*
             * THE SAME MATERIAL AS EVERY OTHER SURFACE, WITH AN OPAQUE
             * BACKING. 2026-10-17, Rashid: "notification dropdown blur needs
             * fixing as well."
             *
             * WHAT IT WAS. `wx-glass-overlay`, the floating-menu material,
             * which fills with `--wx-glass-modal` at 89%. That is right for a
             * modal, because a modal sits over `wx-glass-scrim`, which blurs
             * what is behind it. This panel deliberately has NO scrim — a
             * blurred scrim under a blurred panel is two layers out of a
             * budget of three — so the remaining 11% was the live page, and
             * over a chart it was a wall of lines and figures showing through
             * the rows, reading as the rows overlapping each other.
             *
             * WHAT IT IS NOW. `wx-neo-raised-sm`, which as of the same day is
             * the one shared glass material: identical fill, rim, face, edge,
             * inner and lift to `wx-neo-raised` and to the nav bar, differing
             * only in that it carries no `backdrop-filter`. So the panel now
             * belongs to the same family as the cards it floats over, which
             * is what he asked for.
             *
             * AND THE MISSING BLUR COSTS THIS PANEL NOTHING, which is the
             * reason `-sm` is the right half of that pair rather than a
             * compromise: the fill below is 100% opaque, and a
             * `backdrop-filter` under a fully opaque background is invisible
             * by definition — it would be a per-frame re-blur of pixels that
             * are then painted over completely. Taking the blurred variant
             * here would have bought an identical picture and spent one of the
             * three blurred layers §4.3 allows, on the one surface in the app
             * that genuinely floats over a chart.
             *
             * THE FILL IS THE ONE DELIBERATE DIFFERENCE from a card, and it is
             * much smaller than it looks. A card is `--wx-glass-fill` (10%
             * white) over the ground; on the neutral ground that composites to
             * roughly `#212124` in dark and `#ecedf4` in light, against this
             * panel's `--wx-surface-1` of `#2B2B2E` and `#EDEEF5`. In light
             * that is a one-level difference. The panel reads as a card and is
             * not see-through.
             */
            /* The CSS below is what the panel is before it has been measured,
               and what it falls back to if `getBoundingClientRect` ever hands
               back zeroes. The inline style above wins once placed. rem so it
               follows the text-size control; the bar's own gutter is 0.75rem
               each side. */
            'w-[min(21rem,calc(100vw-1.5rem))]',
            'flex max-h-[min(26rem,70dvh)] flex-col overflow-hidden'
          )}
          style={{
            backgroundColor: 'var(--wx-surface-1)',
            ...(place
              ? {
                  right: `${place.right}px`,
                  width: `${place.width}px`,
                  maxHeight: `${place.maxHeight}px`,
                }
              : null),
          }}
        >
          <header className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
            <h2 className="text-[0.8125rem] font-semibold">Notifications</h2>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className={cn(
                  'text-accent ease-brand inline-flex items-center rounded-md px-1.5',
                  'text-[0.75rem] font-semibold transition-colors hover:underline',
                  /* The tap floor below `sm` and on any coarse pointer; on a
                     mouse it may be the size of its own text. */
                  'min-h-[2.75rem] sm:min-h-[2.25rem] pointer-coarse:min-h-[2.75rem]'
                )}
              >
                Mark all read
              </button>
            ) : null}
          </header>

          {/* The one scrolling region, so a long list never grows the panel
              past the viewport and the heading stays put. */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 pt-1 pb-2.5">
            {failed ? (
              <p className="text-muted px-1 py-2 text-[0.8125rem] leading-[1.45]">
                We could not load your updates just now. Nothing has been lost — close
                this and open it again in a moment.
              </p>
            ) : isLoading ? (
              /* Skeletons, never a spinner. Three rows, which is roughly what
                 lands. */
              <>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    aria-hidden
                    className="bg-surface-2 h-14 rounded-xl motion-safe:animate-pulse"
                  />
                ))}
                <span className="sr-only">Loading your updates</span>
              </>
            ) : items.length === 0 ? (
              /* A SENTENCE, NOT A SHRUG. It says what will appear here and
                 what causes it, so an empty bell reads as "nothing has
                 happened yet" rather than as a broken feature. */
              <p className="text-muted px-1 py-2 text-[0.8125rem] leading-[1.45]">
                Nothing yet. When a request is decided, a sample ships, one of your
                videos is reviewed or a contest reward lands, it appears here.
              </p>
            ) : (
              items.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  onOpen={(id) => {
                    markRead(id);
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>
        </m.div>
      ) : null}
    </div>
  );
}
