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
 * IT IS NOT THE ONLY WAY TO NAVIGATE. The drawer still holds every destination;
 * this carries the five that matter on a phone. A bottom bar that hides things
 * is worse than no bottom bar.
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
    const measure = () => {
      const list = listRef.current;
      if (!list || activeIndex < 0) return setLamp(null);
      const el = list.children[activeIndex] as HTMLElement | undefined;
      if (!el) return setLamp(null);
      setLamp({ left: el.offsetLeft + el.offsetWidth / 2, width: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
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
      <ul ref={listRef} className="relative grid grid-flow-col justify-stretch">
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
            <li key={item.label} className="min-w-0">
              <NavLink
                to={item.to ?? '#'}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  /* 44px floor is a real physical minimum for a thumb, which is
                     why it is the one sanctioned px value in the codebase. */
                  'relative z-20 flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 transition-colors',
                  active ? 'text-accent' : 'text-muted'
                )}
              >
                {Icon ? <Icon size={20} aria-hidden strokeWidth={active ? 2.4 : 2} /> : null}
                {/* The label is always drawn, never revealed on hover: a phone
                    has no hover, and an icon alone is a guess. */}
                <span className="w-full truncate text-center text-[0.625rem] leading-none font-semibold">
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
