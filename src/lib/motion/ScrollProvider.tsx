import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cancelFrame, frame, useReducedMotion, type FrameData } from 'motion/react';
import type Lenis from 'lenis';
import type { ScrollToOptions as LenisScrollToOptions } from 'lenis';
import { ScrollContext, type ScrollApi } from './scroll-context';
import { smoothScrollRequested } from './flags';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SMOOTH SCROLL, AND THE ONE RULE THAT KEEPS IT FROM BEING THE OLD BUG AGAIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THERE IS ONE SCROLL AUTHORITY AND ONE ANIMATION FRAME LOOP.
 *
 * Lenis is the authority: it swallows the wheel/key gesture and writes
 * `document.documentElement.scrollTop` itself, easing towards the target.
 * Motion's `useScroll` is a READER — it measures the same real document scroll
 * on the browser's own `scroll` event. So the dozen `useScroll` call sites in
 * `Section.tsx`, `HowItWorks.tsx` and `PageProgress` keep working untouched,
 * and they read the eased position rather than a second, competing one.
 *
 * That only holds because of two deliberate choices:
 *
 *  1. **Lenis runs in native-scrollbar mode.** No transform wrapper, no
 *     `overflow: hidden` on a scroll proxy. The document keeps its real height
 *     and its real scrollbar, which is what keeps `position: sticky` working
 *     (the rail and the top bar are both sticky), what keeps the browser's
 *     own back/forward scroll restoration working, and what keeps
 *     focus-scroll-into-view working for keyboard users — the browser scrolls
 *     the focused element into view natively, Lenis sees the resulting scroll
 *     event and re-syncs to it.
 *
 *  2. **Lenis does not own a `requestAnimationFrame` loop.** `autoRaf: false`,
 *     and its `raf` is driven from Motion's frame loop instead
 *     (`frame.update(tick, true)`). One rAF ticks Motion, Lenis and — when it
 *     is in use — GSAP. This is the whole mitigation for the risk
 *     `docs/DECISIONS.md` records on 2026-10-14: the judder this app already
 *     paid for was "twelve beams animating on the main thread", and three
 *     libraries each scheduling their own frame is the same shape of fault.
 *     Reading and writing scroll in one ordered loop also means they cannot
 *     tear against each other mid-frame; the cost is that Motion reads the
 *     position Lenis wrote on the previous frame, one frame (~16ms) behind,
 *     which is not perceptible and is the trade the official integration makes.
 *
 * NOTHING HERE TOUCHES `filter` OR `backdrop-filter`, and nothing here may ever
 * be made to (`GLASS_PLAN` §1.2, the fence law). This provider sets no styles
 * on any element except the `lenis` classes Lenis puts on `<html>` and the
 * stylesheet below, which is layout only.
 *
 * REDUCED MOTION: Lenis is never constructed at all. Not slowed, not
 * `respectReducedMotion`-ed into a 1:1 lerp — absent, so the scroll a person
 * who asked for less motion gets is the browser's, on the compositor, with no
 * JavaScript in the path. `useReducedMotion()` is live, so turning the OS
 * setting on while the tab is open tears Lenis down within a render.
 *
 * OFF BY DEFAULT. See `flags.ts`.
 */

/*
 * Lenis's own stylesheet, inlined.
 *
 * It is five rules and it is injected from here rather than imported as CSS so
 * that (a) the flag being off means no stylesheet and no chunk at all, and
 * (b) it comes back out again on teardown. `src/styles/global.css` is owned by
 * someone else this session and is the wrong place for it anyway: these rules
 * must only apply while Lenis is actually mounted.
 *
 * The `scroll-behavior` rule is the load-bearing one. `global.css` sets
 * `html { scroll-behavior: smooth }`, and a browser easing `scrollTop` at the
 * same time as Lenis easing `scrollTop` is two authorities again — it shows up
 * as a stutter or a fight on any `scrollIntoView({ behavior: 'smooth' })`.
 * `html.lenis` outranks `html` on specificity, so no `!important` is needed.
 */
const LENIS_CSS = `
html.lenis,
html.lenis body { height: auto; }

html.lenis { scroll-behavior: auto; }

.lenis:not(.lenis-autoToggle).lenis-stopped { overflow: clip; }

.lenis [data-lenis-prevent],
.lenis [data-lenis-prevent-wheel],
.lenis [data-lenis-prevent-touch],
.lenis [data-wx-native-scroll] { overscroll-behavior: contain; }

.lenis.lenis-smooth iframe { pointer-events: none; }
`;

const STYLE_ID = 'wx-smooth-scroll';

function mountStylesheet(): () => void {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = LENIS_CSS;
  document.head.appendChild(el);
  return () => el.remove();
}

/**
 * Smooth scroll for the whole tab.
 *
 * Mounted once, in `app/providers.tsx`, and never keyed on anything — the same
 * law every other provider in this app obeys (see the header of that file): a
 * token refresh must not remount it, and neither must a navigation.
 */
export function ScrollProvider({ children }: { children: ReactNode }) {
  // Read the flag once per page load. Lenis taking over the page's scrolling
  // is not something to toggle mid-session; a reload is one keystroke.
  const [requested] = useState(smoothScrollRequested);

  // Live, not read-once: somebody turning "reduce motion" on in the OS while
  // the tab is open must get their plain scrollbar back.
  const reduced = useReducedMotion();

  // Reference-counted route suspensions. A Set of reasons rather than a number
  // so a double-release cannot drive the count negative, and so the reasons are
  // legible in a debugger.
  const [suspended, setSuspended] = useState<ReadonlySet<string>>(() => new Set());

  const [lenis, setLenis] = useState<Lenis | null>(null);

  /*
   * How many things are holding scrolling still (open modals, mostly). Kept in
   * a ref, outside React state, because it must survive and be consulted from
   * the MutationObserver below without re-running the effect that owns Lenis.
   */
  const locks = useRef(0);

  const suspend = useCallback((reason: string) => {
    setSuspended((prev) => {
      if (prev.has(reason)) return prev;
      const next = new Set(prev);
      next.add(reason);
      return next;
    });
    return () => {
      setSuspended((prev) => {
        if (!prev.has(reason)) return prev;
        const next = new Set(prev);
        next.delete(reason);
        return next;
      });
    };
  }, []);

  const active = requested && !reduced && suspended.size === 0;

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let instance: Lenis | null = null;
    let tick: ((data: FrameData) => void) | null = null;
    let unmountStyles: (() => void) | null = null;
    let observer: MutationObserver | null = null;

    void (async () => {
      /*
       * Dynamic import, so with the flag off `lenis` is not in any chunk the
       * app downloads. `App-*.js` is already 1,058 kB and the decision that
       * added this library named the bundle as one of the costs to weigh.
       */
      const { default: LenisCtor } = await import('lenis');
      if (cancelled) return;

      unmountStyles = mountStylesheet();

      instance = new LenisCtor({
        // The frame loop is Motion's. See the header.
        autoRaf: false,

        // Default easing and lerp. Deliberately not tuned up: this has to feel
        // like the page, not like a demo reel.
        lerp: 0.1,
        wheelMultiplier: 1,

        // TOUCH STAYS NATIVE. `syncTouch` is what makes Lenis interpolate a
        // finger drag too, and it is the single most expensive thing it can do
        // — on a product whose creators are mostly on phones, a drag that used
        // to be handled on the compositor would move to the main thread. The
        // look is a desktop-wheel nicety; phones keep their own scrolling.
        syncTouch: false,

        // Anchor links keep working AND keep easing: Lenis handles
        // `a[href^="#"]` itself rather than letting the browser jump while
        // Lenis is mid-interpolation.
        anchors: true,

        // Inner scrollers (wide tables, the sidebar's nav list, select panels,
        // the mobile nav strip) scroll natively when the pointer is over them
        // instead of the page scrolling underneath.
        allowNestedScroll: true,

        // Clicking a link kills any leftover inertia, so a new screen does not
        // arrive still gliding.
        stopInertiaOnNavigate: true,

        // Belt to the braces in `active` above: even if this provider were ever
        // constructed under reduced motion, Lenis would not smooth.
        respectReducedMotion: true,

        /*
         * NEVER SMOOTH INSIDE THE WURXBASE FENCE. `/admin/collabs` is already
         * on the deny-list and suspends this provider outright, so this is the
         * third line of defence — it also covers the fence being rendered from
         * anywhere else later. `GLASS_PLAN` §1.2 is about `filter`, but the
         * lesson is the same: the vendored app's own behaviour must not be
         * reached through an ancestor.
         */
        prevent: (node) =>
          node.classList.contains('wurxbase-root') ||
          node.hasAttribute('data-lenis-prevent') ||
          node.hasAttribute('data-wx-native-scroll'),
      });

      tick = (data: FrameData) => instance?.raf(data.timestamp);
      // `keepAlive` keeps Motion's loop running every frame, which is what
      // makes it a valid driver for Lenis. One loop, not two.
      frame.update(tick, true);

      if (locks.current > 0) instance.stop();

      /*
       * THE FOUR DIALOGS THAT LOCK SCROLL WITH `body.style.overflow`.
       *
       * `OfferReviewDialog`, `ReviewDialog`, `ContestEntryDialog` and
       * `ContestProgressDialog` all set `document.body.style.overflow =
       * 'hidden'` while they are open. That stops the BROWSER scrolling the
       * page. It does nothing whatever to Lenis, which cancelled the wheel
       * event and is writing `scrollTop` itself — so without this the page
       * would keep gliding along behind an open modal.
       *
       * Watched centrally rather than fixed in four files, because this is a
       * property of smooth scroll and not of those dialogs, and because the
       * next dialog written the same way is then already handled. New overlays
       * should call `useScrollLock` instead and skip the body style.
       *
       * TRANSITIONS, NOT STATE: this reacts to locked→unlocked and
       * unlocked→locked only, so an explicit `useScrollLock` is never undone by
       * an observer firing for some unrelated style change.
       */
      const isBodyLocked = () => {
        const overflow = document.body.style.overflow;
        return overflow === 'hidden' || overflow === 'clip';
      };
      let bodyLocked = isBodyLocked();
      if (bodyLocked) {
        locks.current += 1;
        instance.stop();
      }

      observer = new MutationObserver(() => {
        const now = isBodyLocked();
        if (now === bodyLocked) return;
        bodyLocked = now;
        if (now) {
          locks.current += 1;
          instance?.stop();
        } else {
          locks.current = Math.max(0, locks.current - 1);
          if (locks.current === 0) instance?.start();
        }
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });

      // A marker for a future `check-*.mjs` and for anybody debugging in the
      // browser: `document.documentElement.dataset.wxSmooth === 'on'`.
      document.documentElement.dataset.wxSmooth = 'on';

      setLenis(instance);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (tick) cancelFrame(tick);
      // `destroy()` removes Lenis's own listeners and the classes it put on
      // `<html>`; the stylesheet and the marker are ours to take back.
      instance?.destroy();
      unmountStyles?.();
      delete document.documentElement.dataset.wxSmooth;
      setLenis(null);
    };
  }, [active]);

  const value = useMemo<ScrollApi>(() => {
    const stop = () => {
      locks.current += 1;
      lenis?.stop();
    };
    const start = () => {
      locks.current = Math.max(0, locks.current - 1);
      if (locks.current === 0) lenis?.start();
    };

    const scrollTo = (
      target: number | string | HTMLElement,
      options?: LenisScrollToOptions
    ) => {
      if (lenis) {
        lenis.scrollTo(target, options);
        return;
      }
      if (typeof window === 'undefined') return;
      const behavior: ScrollBehavior = options?.immediate ? 'auto' : 'smooth';
      if (typeof target === 'number') {
        window.scrollTo({ top: target, behavior });
        return;
      }
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      el?.scrollIntoView({ behavior, block: 'start' });
    };

    return { lenis, smooth: lenis !== null, suspend, scrollTo, stop, start };
  }, [lenis, suspend]);

  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}
