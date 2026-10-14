/**
 * The motion layer's one switch, and the routes it is never allowed on.
 *
 * SMOOTH SCROLL IS OFF UNTIL SOMEBODY TURNS IT ON. `docs/DECISIONS.md`
 * (2026-10-14, "GSAP, Lenis and React Bits join the stack") flags the risk in
 * so many words: this app has already paid for scroll behaviour twice — the
 * judder that was "twelve beams animating on the main thread", and the
 * scroll-driven depth on the landing page — and a second scroll authority on
 * top of Motion's `useScroll` is how those come back. So the provider ships
 * wired in and inert. Nothing about the app changes until the flag is set.
 *
 * THREE WAYS TO ASK FOR IT, in order of precedence:
 *
 *   1. `localStorage['wx.smooth-scroll'] = 'off'`  — forces it off, beats
 *      everything else. This is the escape hatch: if it ever ships enabled and
 *      misbehaves on somebody's machine, this turns it off in that browser
 *      without a deploy.
 *   2. `localStorage['wx.smooth-scroll'] = 'on'`   — forces it on in one
 *      browser, in any build, dev or deployed. This is how the lead tries it.
 *   3. `VITE_SMOOTH_SCROLL=on` in `.env.local` / Vercel — turns it on for
 *      everyone in that build. This is how it ships.
 *
 * Read once per page load on purpose. Lenis takes over the page's scrolling;
 * flipping that mid-session is not a thing we want to support, and a reload is
 * one keystroke.
 */

/** The localStorage key. Spelled like the app's other keys (`wx.*`). */
export const SMOOTH_SCROLL_KEY = 'wx.smooth-scroll';

/** The build-time environment variable. */
export const SMOOTH_SCROLL_ENV = 'VITE_SMOOTH_SCROLL';

function readOverride(): 'on' | 'off' | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SMOOTH_SCROLL_KEY);
    if (raw === 'on' || raw === '1' || raw === 'true') return 'on';
    if (raw === 'off' || raw === '0' || raw === 'false') return 'off';
  } catch {
    /* Private mode with storage blocked. Fall through to the env flag. */
  }
  return null;
}

function readEnv(): boolean {
  // Dot access, never `import.meta.env['VITE_…']`. Vite only statically
  // replaces the dot form; the bracket form is silently `undefined` in a
  // production build. Same reason `noPropertyAccessFromIndexSignature` is off
  // in tsconfig — see the comment there.
  const raw = import.meta.env.VITE_SMOOTH_SCROLL;
  return raw === 'on' || raw === '1' || raw === 'true';
}

/**
 * Is smooth scroll asked for at all? This answers the flag question only.
 * Reduced motion and the route deny-list are decided separately, by
 * `ScrollProvider`, because they can change while the tab is open.
 */
export function smoothScrollRequested(): boolean {
  const override = readOverride();
  if (override) return override === 'on';
  return readEnv();
}

/**
 * ROUTES LENIS MUST NEVER TOUCH.
 *
 * `/admin/collabs` is Paid Collabs: 24,000 lines of vendored WurxBase running
 * inside `.wurxbase-root`, which scrolls itself inside its own fence and
 * styles its own overlays. Lenis preventing wheel events above that fence and
 * writing `scrollTop` itself is a fight nobody wins, and the fence is the one
 * place in this product where getting scrolling wrong has already cost three
 * rewrites (`GLASS_PLAN` §1.2).
 *
 * Prefix match, so `/admin/collabs/reporting` and every other tab are covered.
 *
 * This list is defence in depth, not the only defence: `PaidCollabs` also
 * suspends smooth scroll itself with `useSuspendSmoothScroll`, so renaming the
 * route cannot quietly re-enable Lenis on it.
 */
export const SMOOTH_SCROLL_DENY_PREFIXES: readonly string[] = ['/admin/collabs'];

export function isSmoothScrollDeniedPath(pathname: string): boolean {
  return SMOOTH_SCROLL_DENY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
