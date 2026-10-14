// The scene is static, matching Rashid's file exactly, so neither Motion nor
// the reduced-motion hook is needed here any more.

/**
 * THE BACKGROUND, from Rashid's `prism-glass-background.html` (2026-10-14).
 *
 * It is his composition, not an interpretation of it: the ground ramp and its
 * two tints live in `--wx-ground`, and the optical-loop scene below is his SVG.
 * What this file adds is the plumbing that makes it safe in an app rather than
 * in a standalone page.
 *
 * THREE RULES, each of which has cost this project real time before:
 *
 *  1. NO `filter` AND NO `backdrop-filter`, anywhere in this subtree. This
 *     mounts at `AppShell`, which is an ancestor of `.wurxbase-root`, and
 *     either property there becomes the containing block for every fixed
 *     overlay in the vendored admin app — the fault that put its modals
 *     3,413px down the page, three times. The blur in the scene is baked into
 *     the SVG's own `feGaussianBlur`, which filters the SVG's contents and
 *     never the host element. `scripts/check-backdrop-ancestry.mjs` asserts it.
 *
 *  2. `m.div`, NEVER `motion.div`. `LazyMotion` runs with `strict`, so the
 *     bare namespace THROWS at runtime, and one throw here takes out every
 *     screen in the product, signed in or not.
 *
 *  3. `transform` and `opacity` only. Never `background`, never `filter`:
 *     both re-rasterise the full-bleed layer every frame. §4.3.
 */

/**
 * The scene's own geometry is a fixed 1600x1100 viewBox sliced to fill, so the
 * composition holds from 375px to an ultrawide with no media query and no
 * horizontal overflow — `preserveAspectRatio="xMidYMid slice"` crops rather
 * than stretches, and the wrapper clips.
 */
const SCENE_VIEWBOX = '0 0 1600 1100';

/** The five loops, as ellipses: centre, radii and rotation. His numbers. */
const LOOPS = [
  { cx: 175, cy: 480, rx: 74, ry: 40, rimRx: 85, rimRy: 52, rot: -32 },
  { cx: 165, cy: 678, rx: 90, ry: 46, rimRx: 102, rimRy: 59, rot: -35 },
  { cx: 180, cy: 920, rx: 109, ry: 58, rimRx: 122, rimRy: 70, rot: -37 },
  { cx: 1260, cy: 285, rx: 185, ry: 80, rimRx: 198, rimRy: 94, rot: -33 },
  { cx: 1140, cy: 940, rx: 240, ry: 95, rimRx: 253, rimRy: 109, rot: -35 },
] as const;

/**
 * How much of the scene survives to the page.
 *
 * `subtle` is what `AppShell` asks for behind every signed-in screen, where
 * there are live numbers to read and the ground must not compete with them.
 * `full` is the auth pages, the hero and `/apply`, where the background IS the
 * design. It scales his own opacity rather than stacking a scrim, which would
 * be one more layer to composite and one more theme branch to get wrong.
 */
const STRENGTH = { full: 1, subtle: 0.55 } as const;

export function HaloBackdrop({
  className,
  intensity = 'full',
}: {
  className?: string;
  /** `full` behind the auth pages, hero and `/apply`; `subtle` behind the app. */
  intensity?: 'full' | 'subtle';
}) {
  /*
   * Motion's own hook rather than a bare `matchMedia`: it re-reads when the OS
   * setting changes while the tab is open. Reduced motion renders this
   * COMPLETELY STATIC — the scene is still painted, because the background is
   * the design and a blank ground is not the accessible version of it. Only the
   * drift goes.
   */
  const strength = STRENGTH[intensity];

  return (
    <div aria-hidden className={className}>
      {/*
        NO GROUND LAYER HERE ANY MORE. `body` paints `--wx-ground` for the whole
        document (see global.css), which is what fixed the landing page: this
        component was mounted `absolute inset-0` inside the hero, so the ramp
        ended at the fold and the rest of the page fell back to flat colour.
        Painting it on `body` means no page can be missed, and this component is
        now only the optical loops.
      */}

      {/*
        THE OPTICAL LOOPS. `overflow-hidden` is load-bearing: the scene is
        sliced to cover, so it overhangs every edge, and without the clip that
        is a horizontal scrollbar at 375px on every screen in the product.

        Note what is NOT here — no `filter`, no `backdrop-filter`, no
        `transform`, no `will-change` on the frame. `overflow` alone does not
        establish a containing block for `position: fixed`, so nothing in this
        subtree can move a fixed overlay. Rule 1 above.
      */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/*
          STATIC, AND EXACTLY HIS GEOMETRY.
          `viewBox="0 0 1600 1100"`, `slice`, `min-width:1000px`, `object-cover`
          — the four values that decide the composition — are copied from
          `prism-glass-background.html` unchanged.

          Two of my additions were removed after Rashid called the result
          distorted, and both deserved it: a widened viewBox meant to "zoom out"
          re-cropped the slice so the loops no longer sat where he drew them,
          and a slow drift animated a background his file paints still. The
          lesson is narrow — when the ask is "this exact background", the
          geometry is not mine to improve.
        */}
        <svg
          viewBox={SCENE_VIEWBOX}
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 h-full w-full min-w-[1000px] object-cover"
          style={{ opacity: `calc(var(--wx-scene-opacity) * ${strength})` }}
        >
          <defs>
            {/*
              The loop body: a wide stroke carrying a gradient that runs from a
              white highlight through a dark trough to a cool return, which is
              what reads as light bending through a glass ring rather than as a
              coloured outline.
            */}
            <linearGradient id="wx-optical-loop" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#ffffff" stopOpacity=".6" />
              <stop offset=".16" stopColor="#d3c1ed" stopOpacity=".05" />
              <stop offset=".43" stopColor="#101118" stopOpacity=".36" />
              <stop offset=".6" stopColor="#dae6f5" stopOpacity=".38" />
              <stop offset=".78" stopColor="#8b719f" stopOpacity=".1" />
              <stop offset="1" stopColor="#e0e6f3" stopOpacity=".48" />
            </linearGradient>
            {/* The hairline rim just outside each loop: the lit edge. */}
            <linearGradient id="wx-optical-rim" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#ffffff" stopOpacity=".65" />
              <stop offset=".2" stopColor="#ffffff" stopOpacity=".02" />
              <stop offset=".5" stopColor="#cbc4db" stopOpacity=".4" />
              <stop offset=".8" stopColor="#ffffff" stopOpacity=".04" />
              <stop offset="1" stopColor="#ffffff" stopOpacity=".6" />
            </linearGradient>
            {/*
              The softening. This is an SVG filter on the SVG's OWN contents, so
              it never touches the host element and never creates a containing
              block in the document — which is the only reason a blur is allowed
              anywhere in this file at all.
            */}
            <filter id="wx-optical-soft">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <radialGradient id="wx-optical-light">
              <stop stopColor="#e6daf4" stopOpacity=".24" />
              <stop offset="1" stopColor="#b7d1ee" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The ambient pool the left-hand loops sit in. */}
          <ellipse
            cx="230"
            cy="620"
            rx="450"
            ry="510"
            fill="url(#wx-optical-light)"
            style={{ opacity: 'var(--wx-scene-light-opacity)' }}
          />

          <g
            fill="none"
            stroke="url(#wx-optical-loop)"
            strokeWidth="26"
            filter="url(#wx-optical-soft)"
          >
            {LOOPS.map((l) => (
              <ellipse
                key={`body-${l.cx}-${l.cy}`}
                cx={l.cx}
                cy={l.cy}
                rx={l.rx}
                ry={l.ry}
                transform={`rotate(${l.rot} ${l.cx} ${l.cy})`}
              />
            ))}
          </g>

          <g fill="none" stroke="url(#wx-optical-rim)" strokeWidth="1.2">
            {LOOPS.map((l) => (
              <ellipse
                key={`rim-${l.cx}-${l.cy}`}
                cx={l.cx}
                cy={l.cy}
                rx={l.rimRx}
                ry={l.rimRy}
                transform={`rotate(${l.rot} ${l.cx} ${l.cy})`}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
