import { useEffect, useRef } from 'react';
import { useTheme } from '@/components/theme/theme-context';

/**
 * THE HALO. The ground the whole product stands on.
 *
 * Rashid asked for VANTA.HALO behind sign-in, then behind every tab. It is a
 * WebGL field, so a few things had to be settled before it could sit under a
 * page people actually work in.
 *
 * 1. IT IS LAZY. `three` plus `vanta` is roughly 600KB. Imported normally it
 *    lands in the entry chunk and is paid for by every visitor on every route,
 *    including the landing page, which deliberately loads no web fonts at all
 *    because speed is the point there. The dynamic `import()` gives it its own
 *    chunk, fetched only once a screen that wants it is already interactive.
 *
 * 2. IT NEVER RUNS WHEN MOTION IS UNWELCOME. `prefers-reduced-motion` is not a
 *    hint here: a slow full-screen WebGL swirl is exactly what that setting
 *    exists to stop. When it is set the module is never even downloaded and the
 *    painted ground below stands in. Same for save-data.
 *
 * 3. NOTHING EVER WAITS ON IT. The canvas sits behind the content. If WebGL is
 *    missing, the chunk is blocked or the device is modest, the painted ground
 *    simply stays and nobody is told, because there is nothing they could do.
 *
 * ── WHY LIGHT MODE DOES NOT USE VANTA AT ALL ─────────────────────────────────
 *
 * Because it cannot. HALO's ring is ADDITIVE LIGHT: it adds brightness to the
 * ground rather than painting over it. On Ink that produces the spectrum. On a
 * near-white ground every channel is already near 255, so the ring clips to
 * white and the halo disappears into the page.
 *
 * That is measured, not assumed. The same clip of the same page, both themes:
 *
 *     dark    saturation 0.308   593 distinct colours
 *     light   saturation 0.015     1 distinct colour
 *
 * and taking the scrim off it, 0.55 down to 0.22, moved light from 1 colour to
 * 4. The scrim was never what hid it. No combination of `baseColor`,
 * `backgroundColor` or opacity fixes this, because it is how the shader
 * composites. Several were tried: a light base gave a white blob, a violet base
 * gave a white blob, a dark base gave a grey smudge under a scrim and a dark
 * slab without one, which is the login Rashid called pathetic in light mode.
 *
 * So light mode paints its own aurora in CSS, in the kit's four spectrum
 * colours. It is visible, it costs no WebGL context at all, and unlike the
 * shader it is something we control. Dark keeps VANTA.HALO, which looks
 * genuinely good there.
 *
 * One component, one placement, a ground that changes with the theme, which is
 * what was asked for. Only the technique differs between the two, and only
 * because the shader has a hard limit on a light page.
 */

/** Dark only. Ink on Ink is what lets the ring's own colour do the work. */
const PAINT = { baseColor: 0x14141c, backgroundColor: 0x14141c } as const;

/**
 * The light-mode aurora: magenta, violet, blue, cyan, in the kit's own order.
 *
 * Kept to soft washes rather than fills, because the kit is explicit that the
 * spectrum colours are accents and are never full-bleed backgrounds. The page's
 * own ground is still the last layer underneath them.
 */
const AURORA = [
  'radial-gradient(ellipse 55% 45% at 78% 16%, rgba(255, 46, 140, 0.20), transparent 62%)',
  'radial-gradient(ellipse 60% 50% at 90% 44%, rgba(155, 92, 255, 0.28), transparent 64%)',
  'radial-gradient(ellipse 52% 46% at 64% 74%, rgba(46, 139, 255, 0.20), transparent 62%)',
  'radial-gradient(ellipse 48% 40% at 94% 88%, rgba(23, 224, 212, 0.22), transparent 62%)',
  'var(--wx-bg)',
].join(', ');

/** The dark ground, for the moment before WebGL arrives and if it never does. */
const DARK_FLOOR = [
  'radial-gradient(ellipse 60% 50% at 82% 28%, rgba(155, 92, 255, 0.22), transparent 64%)',
  'radial-gradient(ellipse 50% 44% at 70% 76%, rgba(23, 224, 212, 0.16), transparent 62%)',
  'var(--wx-bg)',
].join(', ');

/** How much of the page's own ground lies over the field where work is read. */
const SCRIM = { full: 0, subtle: 0.55 } as const;

export function HaloBackdrop({
  className,
  intensity = 'full',
}: {
  className?: string;
  /**
   * `full` behind the auth pages, where the halo IS the page and there is
   * nothing on it but one card.
   *
   * `subtle` behind the signed-in app, where there is real work on top. A scrim
   * is used rather than canvas opacity because opacity fades the swirl towards
   * the page colour and muds it; a scrim keeps the swirl saturated and simply
   * puts the page's own ground between it and the text.
   */
  intensity?: 'full' | 'subtle';
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<{ destroy?: () => void } | null>(null);
  const { resolved } = useTheme();
  const onLight = resolved === 'light';

  useEffect(() => {
    /* Light mode never builds a context: see the note at the top. Switching to
       light therefore tears the canvas down rather than leaving one running
       behind an aurora that has already replaced it. */
    if (onLight) return;
    const host = hostRef.current;
    if (!host) return;

    /* Asked before a single byte is fetched, so the download never happens for
       somebody who has told their OS they do not want animation. */
    const quiet = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
    if (quiet || conn?.saveData) return;

    let alive = true;

    (async () => {
      try {
        /*
         * VANTA SHIPS UMD, NOT ESM, so what comes back depends on how the
         * bundler wrapped it. Observed in dev: `mod.default` is the module
         * object rather than the factory, and the factory also lands on
         * `window.VANTA`. Taking the first callable of the three works in dev
         * AND in a production build without caring which interop path ran. The
         * alternative is a component that works in one and silently falls back
         * in the other, which is how this was first found.
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

        effectRef.current = HALO({
          el: hostRef.current,
          THREE,
          mouseControls: true,
          touchControls: false /* a swirl that follows a thumb fights the scroll */,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          amplitudeFactor: 1.4,
          size: 1.2,
          /* DOWN AND RIGHT, off the words. Centred, the ring's brightest arc ran
             straight through "Welcome back" and bleached the second half of it.
             The card below is opaque, so the halo is free to sit behind that
             rather than behind the heading. */
          xOffset: 0.06,
          yOffset: 0.08,
          ...PAINT,
        });
      } catch {
        /* No WebGL, a blocked chunk, an old device: the floor below stays. */
      }
    })();

    return () => {
      alive = false;
      effectRef.current?.destroy?.();
      effectRef.current = null;
    };
  }, [onLight]);

  return (
    <div aria-hidden className={className}>
      {/* THE GROUND. Always painted, so there is never a flash of nothing, the
          page is complete without a single byte of WebGL, and in light mode it
          is not a fallback at all — it is the whole effect. */}
      <div
        className="absolute inset-0 transition-[background] duration-500"
        style={{ background: onLight ? AURORA : DARK_FLOOR }}
      />
      {/* The canvas, dark mode only. Empty and harmless in light. */}
      <div ref={hostRef} className="absolute inset-0" />
      {/* THE SCRIM, where there is work to read on top of all this. */}
      {SCRIM[intensity] > 0 ? (
        <div className="bg-bg absolute inset-0" style={{ opacity: SCRIM[intensity] }} />
      ) : null}
    </div>
  );
}
