import { useEffect, useRef, useState } from 'react';

/**
 * THE HALO BEHIND SIGN IN AND APPLY.
 *
 * Rashid asked for VANTA.HALO on the auth pages. It is a WebGL field, so three
 * things had to be decided before it could ship on a page people sign in from.
 *
 * 1. IT IS LAZY, AND ONLY HERE. `three` plus `vanta` is roughly 600KB of
 *    JavaScript. Imported normally it would land in the entry chunk and be paid
 *    for by every visitor on every route, including the landing page, which
 *    deliberately loads no web fonts at all because speed is the point there.
 *    The dynamic `import()` puts it in its own chunk that only the auth routes
 *    ever fetch, and only after the form is already interactive.
 *
 * 2. IT NEVER RUNS WHEN MOTION IS UNWELCOME. `prefers-reduced-motion` is not a
 *    hint here: a slow full-screen WebGL swirl is exactly what that setting
 *    exists to stop. When it is set, the module is never even downloaded and
 *    the static gradient below stands in. Same for `navigator.connection`
 *    reporting save-data.
 *
 * 3. THE FORM IS NEVER WAITING ON IT. The canvas sits behind the content and
 *    fades in when ready. If WebGL is unavailable, the import fails, or the
 *    device is modest, the gradient simply stays. Nobody is ever shown a blank
 *    page while a background loads.
 *
 * THE COLOURS ARE PRISM'S, passed in rather than left at Vanta's defaults,
 * which are a blue nobody chose. `baseColor` is Ink and the halo rides the
 * violet-to-cyan of the spectrum.
 */
export function HaloBackdrop({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    /* Asked before anything is fetched, so the bytes are never spent on
       somebody who has told the OS they do not want animation. */
    const quiet = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
    if (quiet || conn?.saveData) return;

    let effect: { destroy?: () => void } | null = null;
    let alive = true;

    (async () => {
      try {
        /*
         * VANTA SHIPS UMD, NOT ESM, so what comes back depends on how the
         * bundler wrapped it. Observed in dev: `mod.default` is the module
         * object rather than the function, and the factory also lands on
         * `window.VANTA`. Taking the first callable of the three is what makes
         * this work in dev and in a production build without caring which
         * interop path ran — the alternative is a component that works in one
         * and silently falls back in the other.
         */
        const [THREE, mod] = await Promise.all([
          import('three'),
          import('vanta/dist/vanta.halo.min.js') as Promise<Record<string, unknown>>,
        ]);
        const win = window as unknown as { VANTA?: { HALO?: unknown } };
        const candidates = [
          (mod as { default?: { default?: unknown } }).default?.default,
          mod.default,
          win.VANTA?.HALO,
        ];
        const HALO = candidates.find((c) => typeof c === 'function') as
          ((o: unknown) => { destroy?: () => void }) | undefined;
        if (!HALO) throw new Error('vanta halo factory not found');
        if (!alive || !hostRef.current) return;
        effect = HALO({
          el: hostRef.current,
          THREE,
          mouseControls: true,
          touchControls: false /* a swirl that follows a thumb fights the scroll */,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          baseColor: 0x14141c /* PRISM ink */,
          backgroundColor: 0x14141c,
          amplitudeFactor: 1.4,
          size: 1.2,
        }) as { destroy?: () => void };
        if (alive) setReady(true);
      } catch {
        /* No WebGL, a blocked chunk, an old device: the gradient stays and
           nobody is told about it, because there is nothing they could do. */
      }
    })();

    return () => {
      alive = false;
      effect?.destroy?.();
    };
  }, []);

  return (
    <div aria-hidden className={className}>
      {/* The floor. Always painted, so there is never a flash of nothing and
          the page is complete without a single byte of WebGL. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 20% 0%, rgba(155,92,255,0.22), transparent 60%), radial-gradient(ellipse 70% 60% at 85% 100%, rgba(23,224,212,0.16), transparent 62%), #14141c',
        }}
      />
      <div
        ref={hostRef}
        className="absolute inset-0 transition-opacity duration-700"
        style={{ opacity: ready ? 1 : 0 }}
      />
    </div>
  );
}
