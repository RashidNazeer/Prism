import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import type { NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';

/**
 * THE PHONE NAVIGATION — a limelight bar.
 *
 * Rashid, 2026-10-08: the limelight treatment on phones, the traditional rail
 * with a neomorphic touch on anything larger.
 *
 * REBUILT, NOT COPIED. The 21st.dev original is a good idea wrapped around
 * several things this product cannot ship:
 *
 *   - it used `<a>` with no `href`, which is not focusable and cannot be
 *     operated by keyboard at all;
 *   - it held the active item in component state, so the highlight and the URL
 *     could disagree the moment anything else navigated;
 *   - it painted with `bg-card`, `text-foreground` and `bg-primary`, which are
 *     shadcn's tokens and do not exist here;
 *   - it had no `aria-current`, so a screen reader was never told which page
 *     you were on;
 *   - its 44px-ish hit areas were close but not guaranteed.
 *
 * What is kept is the thing worth keeping: a light that slides to the active
 * item and throws a soft cone down over it.
 *
 * THE INDICATOR IS MEASURED, NOT CALCULATED, because the items are not equal
 * width — "My numbers" is wider than "Home" — so a percentage would drift. It
 * re-measures on resize and when the route changes.
 *
 * IT CARRIES EVERY DESTINATION, AND IT SCROLLS. It used to take the first five
 * and stop. Rashid found both halves of what that cost: the missing items, and
 * a lamp that pointed at nothing once you were on a sixth screen the bar did
 * not know about. A bottom bar that hides destinations is worse than no bottom
 * bar, and one that cannot show you where you are is worse still.
 *
 * So: up to five share the width evenly, and beyond that each item keeps a
 * thumb-sized minimum and the bar scrolls sideways, with the active item
 * brought into view. Nothing is dropped and the lamp always has a target.
 */
export function MobileNav({ items, className }: { items: NavItem[]; className?: string }) {
  const { pathname } = useLocation();
  const listRef = useRef<HTMLUListElement>(null);
  const [lamp, setLamp] = useState<{ left: number; width: number } | null>(null);

  /* Which item owns this URL. Longest prefix wins, so /app/brands/penetrex
     lights "Brand hubs" rather than falling back to Home. */
  const activeIndex = items.reduce((best, item, i) => {
    const prefixes = item.activePrefixes ?? (item.to ? [item.to] : []);
    const hit = prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!hit) return best;
    const len = Math.max(...prefixes.map((p) => p.length));
    const bestLen =
      best === -1
        ? -1
        : Math.max(
            ...(items[best]?.activePrefixes ?? [items[best]?.to ?? '']).map((p) => p.length)
          );
    return len > bestLen ? i : best;
  }, -1);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      if (activeIndex < 0) return setLamp(null);
      /* The lamp is the FIRST child of the list, so the items are offset by one
         and `children[activeIndex]` was pointing one item to the left of the
         truth whenever a lamp was being drawn. `[data-nav-item]` asks for the
         thing itself instead of counting positions. */
      const el = list.querySelector<HTMLElement>(`[data-nav-item="${activeIndex}"]`);
      if (!el) return setLamp(null);
      setLamp({ left: el.offsetLeft + el.offsetWidth / 2, width: el.offsetWidth });
    };

    measure();

    /* Fonts land after first paint and change every label's width, so a single
       measurement on mount leaves the lamp a few pixels off for good. */
    document.fonts?.ready.then(measure).catch(() => {});

    /* `resize` does not fire when the rail collapses or the text-size control
       changes the root font size, and both move these items. */
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeIndex, items.length]);

  /*
   * BRINGING THE LIT TAB INTO VIEW, AND ONLY WHEN IT CHANGES. 2026-10-17.
   *
   * The reveal used to live inside `measure` above, which is also the
   * `ResizeObserver` callback, the `resize` handler and the `fonts.ready`
   * continuation. So anything that changed the bar's size — rotating the
   * phone, the browser toolbar sliding in, the text-size control, the web font
   * landing — scrolled the bar back to the active item. With nine destinations
   * the bar is 641px of items inside a 298px window at 320px, so a creator who
   * had scrolled across to Uploads was snapped back to Home by a resize they
   * did not cause. That is the bar behaving oddly on its own.
   *
   * It also used `scrollIntoView`, which is allowed to scroll EVERY scrollable
   * ancestor, the document included, to reveal a descendant. For a child of a
   * `position: fixed` bar that is never what is wanted. Setting `scrollLeft`
   * on the list touches the list and nothing else, and it is a no-op when the
   * item is already in view, so it cannot fight a gesture in progress.
   */
  useEffect(() => {
    const list = listRef.current;
    if (!list || activeIndex < 0) return;
    const el = list.querySelector<HTMLElement>(`[data-nav-item="${activeIndex}"]`);
    if (!el) return;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
  }, [activeIndex, items.length]);

  /*
   * THE BAR TRACKS THE BROWSER'S OWN TOOLBAR, 2026-10-15.
   * Rashid: "when I scroll up bar is visible but the nav bar cuts off".
   *
   * `position: fixed` anchors to the LAYOUT viewport, and on a phone browser
   * the layout viewport does not shrink when the address/tool bar slides back
   * in on an upward scroll. So the chrome slides in over the top of this card
   * and takes a bite out of it. `env(safe-area-inset-bottom)` cannot help:
   * that describes the hardware's home indicator, not the browser's UI.
   *
   * `visualViewport` is the only thing that knows. The gap between
   * `innerHeight` and the visible area is exactly what is covering the bottom
   * of the page, and the bar lifts by that much.
   *
   * CAPPED AT 180px ON PURPOSE. The same measurement goes large when the
   * KEYBOARD opens — 250px and up — and a navigation bar riding the top of the
   * keyboard while someone types is its own bug. A browser toolbar is roughly
   * 44–90px, so anything past 180 is treated as a keyboard and the bar simply
   * stays put and lets itself be covered, which is the right behaviour while a
   * field has focus.
   */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const sync = () => {
      const hidden = window.innerHeight - (vv.height + vv.offsetTop);
      const toolbar = hidden > 0 && hidden < 180 ? Math.round(hidden) : 0;
      root.style.setProperty('--wx-vv-bottom', `${toolbar}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      root.style.removeProperty('--wx-vv-bottom');
    };
  }, []);

  /*
   * THE EARLY RETURN SITS BELOW BOTH EFFECTS, AND IT HAS TO.
   *
   * It used to sit between them, which made the `visualViewport` effect
   * CONDITIONAL: on a render with no items React saw two hooks, on a render
   * with items it saw three. React matches hooks by call order, so the moment
   * `items` went from empty to populated — or back — every hook after the
   * guard was handed the previous one's slot. In this component that means the
   * effect reading `useState`'s setter for the lamp, and the symptom is not a
   * clean crash but a stale lamp and a `--wx-vv-bottom` that stops updating.
   * `oxlint` flags it as `react-hooks(rules-of-hooks)`.
   *
   * Moving the guard down is the whole fix and costs nothing: neither effect
   * touches `items`. The first bails on `!list`, and when there are no items
   * the nav does not render, so there is no list to measure; the second only
   * ever reads `window.visualViewport`. Both were already safe to run on an
   * empty nav — they simply were not allowed to be skipped.
   */
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Sections"
      className={cn(
        /*
          A FLOATING CARD, like the rail and the top bar. Rashid, 2026-10-09.
          It was pinned flush to the window with only its top corners rounded,
          which made it the one piece of chrome still welded to an edge.

          The safe-area inset moves from PADDING to the BOTTOM OFFSET. Padding
          would have grown the card downward until it touched the home
          indicator again, which is the thing the inset exists to avoid; as an
          offset it lifts the whole card clear instead, and the gutter stays
          even on every side.
        */
        /* `overflow-hidden` clips the limelight to the card's curve. The lamp
           sits at `-top-px` and its cone overhangs; against the old square
           edges that was invisible, and against a 1.75rem radius it would hang
           outside the corner. */
        /* `--wx-vv-bottom` is the browser toolbar's height, maintained by the
           effect above; it falls back to 0 wherever `visualViewport` is
           missing, which is the behaviour this had before. */
        /*
         * `wx-nav-blur` added 2026-10-16: Rashid asked for the target glass on
         * "every nav bar either on top or in the bottom", and this one had no
         * `backdrop-filter` at all — measured `none`. It now blurs at the same
         * 8px as the top bars.
         *
         * IT KEEPS THE OVERLAY'S DENSER FILL, and that is deliberate rather
         * than incidental: `wx-glass-overlay` is defined later in global.css,
         * so its near-opaque `--wx-glass-modal` wins over the nav fill on
         * equal specificity. A bar that floats over arbitrary scrolling
         * content cannot have a computable contrast floor — that is the
         * transparent-calendar bug, fixed once already — so 10% white here
         * would be a regression even though the top bars can carry it.
         */
        'wx-glass-overlay wx-nav-blur fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom)+var(--wx-vv-bottom,0px))] z-40 overflow-hidden rounded-[1.75rem] lg:hidden',
        className
      )}
    >
      {/* Five or fewer share the width evenly; a sixth and beyond keep a
          thumb-sized minimum and the bar scrolls instead of squeezing every
          label down to an unreadable sliver. `scrollbar-none` because a visible
          scrollbar across the bottom of a phone nav is not chrome anyone wants,
          and the active item is scrolled into view for you anyway. */}
      <ul
        ref={listRef}
        className={cn(
          'relative grid grid-flow-col',
          items.length > 5
            ? '[scrollbar-width:none] auto-cols-[minmax(4.75rem,1fr)] overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden'
            : 'auto-cols-fr justify-stretch'
        )}
      >
        {/* THE LIMELIGHT. A bar on the top edge and a cone falling from it.
            `transform` and `opacity` only — never `left` — so it composites
            instead of forcing layout on every frame. */}
        {lamp ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 z-10 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
            style={{ transform: `translateX(${lamp.left}px)` }}
          >
            {/* rem, not px: the one sanctioned px in this codebase is the 44px
                tap floor, and this is decoration. */}
            <span className="bg-accent absolute -top-px left-1/2 h-[0.1875rem] w-11 -translate-x-1/2 rounded-full" />
            <span
              className="from-accent/25 absolute top-0 left-1/2 h-14 w-24 -translate-x-1/2 bg-gradient-to-b to-transparent"
              style={{ clipPath: 'polygon(18% 100%, 34% 0, 66% 0, 82% 100%)' }}
            />
          </span>
        ) : null}

        {items.map((item, i) => {
          const Icon = item.icon;
          const active = i === activeIndex;
          return (
            <li key={item.label} data-nav-item={i} className="min-w-0">
              <NavLink
                to={item.to ?? '#'}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  /* 44px floor is a real physical minimum for a thumb, which is
                     why it is the one sanctioned px value in the codebase. */
                  /* `min-h-14` (3.5rem) rather than a fixed 56px, so the row
                     grows with the text-size control like everything else and
                     still clears the 44px tap floor at every setting. */
                  'relative z-20 flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors',
                  active ? 'text-accent' : 'text-muted'
                )}
              >
                {Icon ? <Icon size={20} aria-hidden strokeWidth={active ? 2.4 : 2} /> : null}
                {/* The label is always drawn, never revealed on hover: a phone
                    has no hover, and an icon alone is a guess. */}
                {/* 0.6875rem, up from 0.625rem. At the default root that is 11px
                    rather than 10px — still small, but 10px on a phone is below
                    what most people can read at arm's length, and this is the
                    only label telling you where a tab goes. */}
                <span className="w-full truncate text-center text-[0.6875rem] leading-none font-semibold">
                  {item.label}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
