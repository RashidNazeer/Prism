import { useMemo } from 'react';
import { m } from 'motion/react';
import { useTheme } from '@/components/theme/theme-context';

/**
 * THE BACKDROP. The ground the whole product stands on.
 *
 * A warped perspective grid on all four sides of the viewport, with beams
 * running up it in the PRISM spectrum. Same effect in both themes; only the
 * grid's own colour changes, which is what the page ground is doing anyway.
 *
 * ── WHY THIS, AFTER TWO WEBGL ATTEMPTS ───────────────────────────────────────
 *
 * VANTA.HALO could not work in light mode, and that was a property of the
 * effect rather than a tuning problem: its ring is ADDITIVE LIGHT, so on a
 * near-white ground every channel is already near 255 and it clips to white.
 * Measured on the same clip of the same page, dark came back at 0.308
 * saturation across 593 distinct colours and light at 0.015 across ONE.
 *
 * This paints instead of adding, so white is no harder than Ink. It also costs
 * nothing like as much: `three` and `vanta` are gone, the 757KB
 * `threejs-components` build that briefly replaced them is gone, and what is
 * left is CSS transforms and `motion`, which the app already ships. No WebGL
 * context, no canvas, and it runs on a phone — where the tubes version could
 * not, because tubes follow a cursor and a phone has none.
 *
 * ── WHAT CHANGED FROM THE PUBLISHED SNIPPET ──────────────────────────────────
 *
 * It could not be pasted in as written:
 *
 *  - it used `motion.div`. This app wraps everything in `LazyMotion` with
 *    `strict`, where `motion.*` THROWS at runtime and only `m.*` is allowed.
 *    That alone would have taken out every screen that renders this;
 *  - every beam picked `Math.floor(Math.random() * 360)` as an HSL hue, so the
 *    background was random colour on every render. Every colour in this product
 *    is a `--wx-*` token, and these are the kit's four spectrum colours in the
 *    kit's own order;
 *  - that `Math.random()` ran DURING RENDER, so React could not keep a beam's
 *    colour stable across re-renders and the whole field reshuffled whenever
 *    anything above it changed state;
 *  - `gridColor` defaulted to `hsl(var(--border))`, a shadcn token that does
 *    not exist here;
 *  - it was a WRAPPER with `border p-20` around its children. This is a
 *    backdrop: it fills its container and draws nothing in front.
 *
 * And it animates forever, so it is switched off entirely under
 * `prefers-reduced-motion`, where the still grid is left standing.
 */

/** The kit's spectrum, in the kit's order. Beams cycle through it. */
const SPECTRUM = ['#ff2e8c', '#9b5cff', '#2e8bff', '#17e0d4'] as const;

/** Grid cell size, as a percentage of the face. */
const BEAM_SIZE = 5;

/**
 * Beam width, SEPARATE from the cell size. The original tied the two together
 * at 5%, which on a 1440px face is a 72px slab: it read as pink paint thrown
 * across the page rather than as light travelling up a grid. A beam is now
 * about a third of a cell.
 */
const BEAM_WIDTH = 1.6;

/** Light, not pigment. At full strength these compete with the content. */
const BEAM_OPACITY = 0.5;

const BEAMS_PER_SIDE = 3;
const BEAM_DURATION = 3;

/**
 * The four faces, each a plane rotated flat and pushed away from one edge of
 * the viewport, so together they read as a box opening towards the viewer.
 * `100cqmax`/`100cqi`/`100cqh` are container units, which is what lets each
 * face size itself from the viewport rather than from a hardcoded length.
 */
const FACES = [
  { key: 'top', pos: '', origin: '50% 0%', rot: 'rotateX(-90deg)', w: '100cqi' },
  { key: 'bottom', pos: 'top-full', origin: '50% 0%', rot: 'rotateX(-90deg)', w: '100cqi' },
  {
    key: 'left',
    pos: 'left-0 top-0',
    origin: '0% 0%',
    rot: 'rotate(90deg) rotateX(-90deg)',
    w: '100cqh',
  },
  {
    key: 'right',
    pos: 'right-0 top-0',
    origin: '100% 0%',
    rot: 'rotate(-90deg) rotateX(-90deg)',
    w: '100cqh',
  },
] as const;

type BeamSpec = { x: number; delay: number; colour: string; ratio: number };

function Beam({ spec, quiet }: { spec: BeamSpec; quiet: boolean }) {
  const style = {
    left: `${spec.x}%`,
    width: `${BEAM_WIDTH}%`,
    aspectRatio: `1 / ${spec.ratio}`,
    background: `linear-gradient(${spec.colour}, transparent)`,
    opacity: BEAM_OPACITY,
  } as const;

  /* Under reduced motion the beam is not animated and not drawn: a static
     streak hanging in the grid looks like a rendering fault rather than a
     paused animation. The grid itself stays. */
  if (quiet) return null;

  return (
    <m.div
      aria-hidden
      className="absolute top-0"
      style={style}
      initial={{ y: '100cqmax', x: '-50%' }}
      animate={{ y: '-100%', x: '-50%' }}
      transition={{
        duration: BEAM_DURATION,
        delay: spec.delay,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'linear',
      }}
    />
  );
}

export function HaloBackdrop({
  className,
  intensity = 'full',
}: {
  className?: string;
  /** `full` behind the auth pages, `subtle` behind the signed-in app. */
  intensity?: 'full' | 'subtle';
}) {
  const { resolved } = useTheme();
  const onLight = resolved === 'light';

  /* Asked once. `matchMedia` rather than a CSS query because this decides
     whether the beams exist at all, not merely how they look. */
  const quiet =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /*
   * BEAMS ARE BUILT ONCE AND KEPT. Everything that was random in the original
   * is derived from the beam's index instead, so a beam keeps its colour, its
   * lane and its phase for the life of the component. The offsets are
   * irrational-ish multiples purely to stop the four sides pulsing in unison.
   */
  const beams = useMemo(() => {
    const cells = Math.floor(100 / BEAM_SIZE);
    const step = cells / BEAMS_PER_SIDE;
    return FACES.map((_face, f) =>
      Array.from({ length: BEAMS_PER_SIDE }, (_, i) => {
        const n = f * BEAMS_PER_SIDE + i;
        return {
          x: Math.floor(i * step) * BEAM_SIZE,
          delay: (n * 0.77) % BEAM_DURATION,
          /* `?? SPECTRUM[0]` only to satisfy `noUncheckedIndexedAccess`; the
             modulo cannot leave the tuple. */
          colour: SPECTRUM[n % SPECTRUM.length] ?? SPECTRUM[0],
          ratio: 4 + ((n * 3) % 7),
        } satisfies BeamSpec;
      })
    );
  }, []);

  const gridColour = onLight ? 'var(--wx-border)' : 'var(--wx-surface-2)';

  /* One cell of the grid, as two hairline gradients crossed. */
  const gridFace = `linear-gradient(var(--grid-color) 0 1px, transparent 1px var(--beam-size)) 50% -0.5px / var(--beam-size) var(--beam-size), linear-gradient(90deg, var(--grid-color) 0 1px, transparent 1px var(--beam-size)) 50% 50% / var(--beam-size) var(--beam-size)`;

  return (
    <div aria-hidden className={className}>
      {/* THE GROUND. Painted first, so the page is complete and coloured even
          before a single beam moves, and for anyone who never sees one. */}
      <div
        className="absolute inset-0 transition-[background] duration-500"
        style={{
          background: onLight
            ? 'radial-gradient(ellipse 85% 60% at 22% 6%, rgba(155, 92, 255, 0.34), transparent 66%), radial-gradient(ellipse 80% 55% at 70% 2%, rgba(255, 46, 140, 0.28), transparent 64%), radial-gradient(ellipse 75% 60% at 96% 30%, rgba(46, 139, 255, 0.26), transparent 66%), var(--wx-bg)'
            : 'radial-gradient(ellipse 60% 50% at 82% 28%, rgba(155, 92, 255, 0.22), transparent 64%), radial-gradient(ellipse 50% 44% at 70% 76%, rgba(23, 224, 212, 0.16), transparent 62%), var(--wx-bg)',
        }}
      />

      {/* THE BOX. `container-type: size` is what makes `cq*` units resolve
          against this element, and `clip-path: inset(0)` stops the rotated
          faces painting outside it — without it they reach past the viewport
          and open a horizontal scrollbar at every width. */}
      <div
        className="[container-type:size] pointer-events-none absolute inset-0 overflow-hidden [clip-path:inset(0)] [perspective:100px] [transform-style:preserve-3d]"
        style={
          {
            '--grid-color': gridColour,
            '--beam-size': `${BEAM_SIZE}%`,
          } as React.CSSProperties
        }
      >
        {FACES.map((face, f) => (
          <div
            key={face.key}
            className={`absolute ${face.pos} [container-type:inline-size] [height:100cqmax] [transform-style:preserve-3d]`}
            style={{
              width: face.w,
              transformOrigin: face.origin,
              transform: face.rot,
              background: gridFace,
              backgroundSize: `${BEAM_SIZE}% ${BEAM_SIZE}%`,
            }}
          >
            {(beams[f] ?? []).map((spec, i) => (
              <Beam key={i} spec={spec} quiet={quiet} />
            ))}
          </div>
        ))}
      </div>

      {/* THE SCRIM, where there is work to read on top of all this. */}
      <div
        className="bg-bg absolute inset-0 transition-opacity duration-500"
        style={{ opacity: intensity === 'subtle' ? (onLight ? 0.2 : 0.45) : 0 }}
      />
    </div>
  );
}
