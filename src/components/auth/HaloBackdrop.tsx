/**
 * THE BACKGROUND.
 *
 * It is Rashid's `glass-fold` WebGL field now (2026-10-14), replacing the
 * optical-loop SVG scene that stood here. The shader itself lives in
 * `src/components/ui/GlassFold.tsx`, which is where every cost control and the
 * whole adaptation note lives; this file is the app-specific wiring and the
 * four numbers below.
 *
 * WHY THE NAME AND THE PROP SURVIVE. There are FOUR mount points —
 * `AuthShell.tsx:49`, `Hero.tsx` (fixed, `-z-10`), `AppShell.tsx:215`
 * (`intensity="subtle"`, behind every signed-in screen) and `Apply.tsx:27`.
 * Keeping `HaloBackdrop` and `intensity` means the background changed in one
 * file instead of five, and no route can be missed.
 *
 * TWO RULES, both of which have cost this project real time:
 *
 *  1. NO `filter` AND NO `backdrop-filter`, anywhere in this subtree. This
 *     mounts at `AppShell`, an ancestor of `.wurxbase-root`, and either
 *     property here becomes the containing block for every `position: fixed`
 *     overlay in the vendored admin app — the fault that put its modals
 *     3,413px down the page. `scripts/check-backdrop-ancestry.mjs` asserts it.
 *     Note what that forbids: the field's contrast is damped IN THE SHADER
 *     (see `damp`), never by a filter over the canvas.
 *
 *  2. IT DOES NOT SCROLL. The canvas positions itself `fixed inset-0`, so all
 *     four mount points get the viewport whether they wrap it in `absolute` or
 *     `fixed`. `body` keeps painting `--wx-ground` underneath as the no-GL
 *     fallback, and `body::after` keeps the grain above it.
 */

import { GlassFold } from '@/components/ui/GlassFold';

/* ============================================================================
   THE CONTRAST BUDGET, and it is arithmetic rather than taste.

   `docs/GLASS_PLAN.md` §4.1: the field is the worst-case backdrop behind every
   glass panel, so its luminance range has to stay inside the band that leaves
   `--wx-text-muted` and `--wx-text-faint` at 4.5:1 where they sit on the bare
   page. `damp` is the shader's linear mix back toward `--wx-bg`, so it IS that
   range, and the two themes are nowhere near each other:

   LIGHT is the easy direction. The page is `#DCDEE9` and every ink on it is
   dark, so the screen-blend — which can only ever brighten — pushes contrast
   UP. Nothing here can fail 4.5:1; the only limit is taste, and past about
   0.6 the panes blow out to flat white and stop reading as glass at all.

   DARK is the tight one. `#202024` has luminance 0.0137, and
   `--wx-text-faint` (`#a0a0b1`, 0.358) needs the backdrop under 0.0407 to hold
   4.5:1 — about 3x of headroom, which is roughly `#202024` to `#38383D`. The
   undamped field screens past that on the first crease, so dark gets a fifth
   of light's budget. Raise this number and faint text on a bare page stops
   being legible. That trade is the whole of §4.1.

   MEASURED, NOT ESTIMATED. On rendered pixels at 1440 (SwiftShader, because
   `browser.mjs` runs `--disable-gpu` and cannot run a shader at all), these two
   numbers put the field at:

     light   luminance 0.749 … 0.882   (`#dfe0ea` … `#f0f1f7`)
     dark    luminance 0.015 … 0.034   (`#202024` … `#343439`)

   and leave `--wx-text-faint` — the tightest of the two inks — at 5.5:1 in
   light and 4.8:1 in dark at the field's brightest point. `dark` started at
   0.20, which measured 4.67:1: a pass, but not enough margin to spend on a
   token nudge later.
   ============================================================================ */
/*
 * TURNED UP, 2026-10-15. Rashid could not tell the new background from the old
 * one — and he was right that it was indistinguishable, not wrong about what he
 * was looking at. The canvas was live the whole time; at 0.52 / 0.17 the field
 * was damped so far toward `--wx-bg` that it read as the same flat ground.
 *
 * THE TWO NUMBERS ARE NOT FREE IN THE SAME WAY, which is why they moved by very
 * different amounts:
 *
 *   LIGHT went 0.52 -> 0.88, and the only thing that was ever limiting it was
 *   taste. The field brightens a light page, and brightening a light page can
 *   only RAISE the contrast of dark ink on it. There was no safety argument for
 *   0.52 at all.
 *
 *   DARK went 0.17 -> 0.20, and that is the measured ceiling rather than a
 *   choice. `--wx-bg` is luminance 0.0137 and `--wx-text-faint` needs the
 *   backdrop under 0.0407 to hold 4.5:1 — about 3x of luminance for the entire
 *   field. 0.20 was measured at 4.67:1 before being pulled back to 0.17 for
 *   margin; this puts it back at the number that was actually measured to pass,
 *   and re-measures it. Going further means lightening `--wx-text-faint` first,
 *   which is a palette decision and not this file's to make.
 */
const DAMP = { light: 0.88, dark: 0.2 } as const;

/** See the `vignette` prop below. 1 = no falloff at all. */
const VIGNETTE = { light: 0.80, dark: 0.52 } as const;

/**
 * How much of the field survives to the page.
 *
 * `subtle` is what `AppShell` asks for behind every signed-in screen, where
 * there are live numbers to read and the background must not compete with
 * them. `full` is the auth pages, the hero and `/apply`, where the background
 * IS the design. It scales the shader's own damping rather than stacking a
 * scrim, which would be one more layer to composite — and `full` is the case
 * the contrast measurement has to pass, because it is the brighter of the two.
 */
const STRENGTH = { full: 1, subtle: 0.6 } as const;

/**
 * SPEED, AND WHY IT IS NOT THE DEMO'S.
 *
 * The source ships `0.5`. That is a showpiece on its own page; here it is
 * behind live GMV figures, and a background that visibly moves while somebody
 * reads a number is the background's fault. `0.04` is one full drift cycle in
 * roughly seven minutes — present if you watch for it, invisible if you are
 * working. Under `prefers-reduced-motion` the shader paints one still frame
 * instead, reactively.
 *
 * `scale` is up from the demo's framing so the panes read as large sheets
 * crossing the viewport rather than as a pattern, which is what keeps it a
 * background. `noise` is a whisper: the field is six smooth exponential
 * falloffs, and a little grain is what stops the gradients banding on an
 * 8-bit display — the same reason `body::after` carries a grain layer.
 */
const SPEED = 0.04;
const SCALE = 1.3;
const NOISE = 0.02;

export function HaloBackdrop({
  className,
  intensity = 'full',
}: {
  className?: string;
  /** `full` behind the auth pages, hero and `/apply`; `subtle` behind the app. */
  intensity?: 'full' | 'subtle';
}) {
  const strength = STRENGTH[intensity];

  return (
    <div aria-hidden className={className}>
      {/*
        NO GROUND LAYER HERE. `body` paints `--wx-ground` for the whole
        document (see `global.css`), which is both the design's floor and the
        fallback for a machine where `getContext('webgl')` returns null — there,
        the canvas hides itself and the page is still finished.

        Note what is NOT on this element: no `filter`, no `backdrop-filter`, no
        `transform`, no `will-change`. Rule 1 above. There is no
        `overflow-hidden` either, and it is not needed: the canvas is
        `fixed inset-0`, which is exactly the viewport and cannot overflow it.
      */}
      <GlassFold
        /*
          The field's OWN colours, not the surface ramp. Driving it from
          `--wx-surface-1/2` tied the backdrop to the colours of the cards that
          sit ON it, which is how dark ended up with three tones inside 0.02
          luminance of each other and no visible folds. These two exist to give
          the shader a range; see the note on them in tokens.css.
        */
        color1="--wx-field-body"
        color2="--wx-bg"
        color3="--wx-field-edge"
        /*
          THE EDGE FALLOFF, per theme. His shader hardcodes 0.45 — the ground
          darkened to 45% at the corners. That is invisible on his near-black
          demo and it is a heavy grey vignette on our light page, which is the
          "dark spots on the sides" and "too much darker shadows" Rashid
          reported. Light keeps a trace of it so the field still has a centre;
          dark keeps most of it, because on a dark page the falloff is what
          stops the field reading as a flat rectangle.
        */
        vignette={VIGNETTE}
        speed={SPEED}
        scale={SCALE}
        noise={NOISE}
        damp={{ light: DAMP.light * strength, dark: DAMP.dark * strength }}
      />
    </div>
  );
}
