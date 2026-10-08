import { useLayoutEffect, useRef, useState } from 'react';
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
      /* When the bar scrolls, the tab you are on must be on screen. Without
         this, landing on the last item shows a bar that looks like it is
         pointing nowhere because the lit item is off to the right. */
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Sections"
      className={cn(
        /* `pb-[env(safe-area-inset-bottom)]` keeps it clear of the home
           indicator; without it the last 34px of an iPhone eats the labels. */
        'wx-neo-raised fixed inset-x-0 bottom-0 z-40 rounded-t-2xl pb-[env(safe-area-inset-bottom)] lg:hidden',
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
            <span className="bg-accent absolute -top-px left-1/2 h-[3px] w-11 -translate-x-1/2 rounded-full" />
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
