import * as React from 'react';

import { cn } from '@/lib/utils';

/* ── the curved row ──────────────────────────────────────────────
 * Scroll Tilted Grid turned on its side, with the tilt drawn as a curve.
 * One row of plaques streams from right to left around the inside of a
 * cylinder. The centre faces you flat, the ends bend toward you so each
 * end plaque curves along its length, and the ends fade into the page.
 *
 * A CSS box can't bend, so every tile is cut into SLICES vertical strips,
 * each a flat facet of the cylinder showing its share of the artwork. The
 * strips sit still inside their tile, each turned its own few degrees
 * round the cylinder's axis, and the tile (preserve-3d) is what moves: one
 * rotateY about that same axis carries the whole tile along the arc. A
 * tile is one animation, so its strips can never drift apart or show
 * different marks. Only a tile's delay differs, and that sets where on
 * the arc it sits. The band is transform-only on the compositor; the fade
 * is a static mask over it.
 *
 * The only JS is a ResizeObserver that sizes the loop, and a handler that
 * hands a tile its next mark each time it wraps, out of sight.
 * ─────────────────────────────────────────────────────────────── */

/*
 * WHAT CHANGED FROM THE DEMO, AND WHY. The original streams PHOTOGRAPHS:
 * full-bleed `object-cover` tiles where cropping is free, because a photo
 * has no edges that mean anything. Everything below follows from the
 * content here being LOGOS instead, which may not be cropped, stretched,
 * or set on a field that fights the page.
 *
 *   · 16 slices -> 10. Sixteen facets is what a 80deg curve needs. At the
 *     55deg this band runs, ten facets leave a 0.15px sagitta at 1440 -
 *     the curve is already smooth below the pixel grid, and the other six
 *     were paying for nothing. Measured, not guessed.
 *   · `object-cover` -> a LUMINANCE MASK. See `Mark` below.
 *   · the demo's shadcn tokens (`bg-muted` and friends) -> `--wx-*`.
 *   · the band is `aria-hidden` and the roster is published once, as text.
 */

// Strips per tile. Each is a few degrees of arc, too little to read as a
// facet. See the note above on why this is ten and not sixteen.
const SLICES = 10;

// Camera distance from the screen, as a multiple of the cylinder's radius.
// Just past the axis, so the ends come right up to the lens and swell; much
// further back and the row flattens out however tight the cylinder.
const CAMERA = 1.6;

/**
 * Cylinder radius, as a share of the band's width, that puts the frame's
 * edge `bend` radians round the arc as seen through the camera:
 * r·sinθ · CAMERA / (CAMERA − 1 + cosθ) = width / 2, solved for r.
 */
function arc(bend: number) {
  return (CAMERA - 1 + Math.cos(bend)) / (2 * CAMERA * Math.sin(bend));
}

// A tile is never wider than this share of the band, so a phone still
// shows its neighbours instead of one plaque edge to edge.
const MAX_WIDTH = 55;

/*
 * THE CYLINDER MAY NOT BE SMALLER THAN THE THINGS ON IT.
 *
 * `curve` sets how tight the cylinder is, and the radius falls out of the
 * band's WIDTH — so the same `curve` that is a gentle bow at 1440 is a
 * drum at 375. At curve 80 the radius on a phone is 92px while a plaque is
 * 160px wide, so ONE TILE WRAPPED 100 DEGREES of the cylinder and the loop
 * swept +-153. Everything past 90 is round the BACK of the axis, where
 * `translateZ(r) rotateY rotateZ(-r)` projects it forward again: the three
 * tiles landed on top of each other and the middle of the row became an
 * unreadable double image. Measured at 375: tiles 0/1/2 overlapping by
 * 171px, 308px and 171px.
 *
 * `visibility` cannot save this. The demo hides a tile once it is past
 * `limit`, but `limit` is itself `curve + half a tile`, so at these sizes
 * the hidden window opens at 130deg — forty degrees AFTER the tile went
 * behind the axis.
 *
 * So the curve is a REQUEST, not a promise. `fit` eases it until both of
 * these hold, and the band keeps the asked-for curve wherever it can:
 *   · a tile spans at most MAX_ARC of the cylinder, and
 *   · a tile's FAR EDGE, at the angle where the tile finally leaves the
 *     screen, has still not reached MAX_EDGE.
 *
 * THE SECOND ONE IS ABOUT THE EDGE, NOT THE CENTRE, and the first attempt
 * got that wrong: bounding the tile's CENTRE at 86deg still let its
 * trailing slices sit at 98, round the back of the axis, where
 * magnification is `1.6 / (0.6 + cosθ)` and climbing — 3.5x at 98deg
 * against 2x at 78. At 1920 that blew the end tile up until it lapped its
 * neighbour by 44-59px. A slice is what actually gets painted, so a slice
 * is what has to be kept in front.
 *
 * Magnification is also why MAX_EDGE is not simply 90: the same expression
 * goes infinite at 126.9deg, where the surface reaches the camera, and the
 * approach is steep enough that the last few degrees are worth giving up.
 */
const MAX_ARC = 34;
const MAX_EDGE = 84;

/**
 * The tightest cylinder at or below `bend` that `h`-tall tiles can sit on
 * without wrapping round the back. Bisected rather than solved: `arc` is
 * monotonic, so a dozen halvings land well inside a hundredth of a degree,
 * and this runs once per resize.
 */
function fit(width: number, h: number, aspect: number, bend: number) {
  const deg = (rad: number) => (rad * 180) / Math.PI;
  const ok = (b: number) => {
    const radius = width * arc(b);
    if (!(radius > 0)) return false;
    const span = aspect * deg(h / radius);
    // `deg(b) + span` is the tile's FAR EDGE at the moment the tile leaves
    // the screen: centre at `deg(b) + span/2`, edge half a span further.
    return span <= MAX_ARC && deg(b) + span <= MAX_EDGE;
  };
  if (ok(bend)) return bend;
  let lo = (5 * Math.PI) / 180;
  let hi = bend;
  if (!ok(lo)) return lo;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/*
 * BREATHING ROOM INSIDE THE PLAQUE, in tile-heights.
 *
 * A logo set edge to edge on its plaque reads as a sticker rather than as
 * a mark on a pane, and at the band's ends — where the curve foreshortens
 * the plaque — a mark that runs to the edge is the first thing to get
 * visually clipped. These are the margins the artwork sits inside.
 */
const PAD_X = 0.16;
const PAD_Y = 0.22;

/**
 * Lays the loop on the cylinder. The radius puts the frame's edge `bend`
 * radians round the arc (see `arc`). Angles come back in degrees: `unit`
 * is the arc one tile-height spans, `limit` how far round a tile's centre
 * can go before the whole tile is off-screen, and `sweep` how far round
 * the loop's ends sit. The loop reaches past `limit`, so a tile only ever
 * wraps out of sight, and is rounded up to a whole number of tiles so the
 * gap never stretches.
 */
function measure(
  width: number,
  height: number,
  tile: number,
  aspect: number,
  gap: number,
  wanted: number,
) {
  const h = Math.min((tile / 100) * height, ((MAX_WIDTH / 100) * width) / aspect);
  if (!(h > 0) || !(width > 0))
    return { columns: 2, sweep: 0, unit: 0, limit: 0, bend: wanted };
  // The curve the band can actually carry at this size (see `fit`).
  const bend = fit(width, h, aspect, wanted);
  const radius = width * arc(bend);
  if (!(radius > 0)) return { columns: 2, sweep: 0, unit: 0, limit: 0, bend };
  const deg = (rad: number) => (rad * 180) / Math.PI;
  const unit = deg(h / radius);
  const pitch = (aspect + gap / 100) * unit;
  const span = aspect * unit;
  // Hide the tile once it is off-screen — or sooner, if letting its centre
  // get that far would push its trailing edge past MAX_EDGE.
  const limit = Math.min(deg(bend) + span / 2, MAX_EDGE - span / 2);
  // Capped so a band squeezed to a sliver can't mount hundreds of tiles.
  // At the shipped settings this never binds: 1440 asks for 6 and 375 for 4.
  const columns = Math.min(24, Math.max(2, Math.ceil((2 * limit) / pitch)));
  const round = (n: number) => +n.toFixed(4);
  const sweep = round((columns * pitch) / 2);
  return { columns, sweep, unit: round(unit), limit: round(Math.min(sweep, limit)), bend };
}

export type TiltedGridImage = {
  src: string;
  /** The brand's name. Published once as text; the band itself is decorative. */
  alt: string;
  /**
   * Rendered height of this mark, in the same arbitrary units as every other
   * mark in the list — `BRANDS[].h`. Only the RATIO between them is used, to
   * keep a wide wordmark from out-weighing a square one. Defaults to the
   * tallest, i.e. "give this one the full box".
   */
  h?: number;
};

export type TiltedGridHeroProps = {
  /**
   * Marks run along the row in order. A tile takes its next mark each time
   * it wraps off-screen, so the whole list plays through however few tiles
   * the frame needs. Short lists simply repeat.
   */
  images: TiltedGridImage[];
  /**
   * Seconds for the row to advance by one tile. Speed is per tile, not per
   * crossing, so a phone and an ultrawide move at the same pace.
   * @default 4
   */
  speed?: number;
  /** Tile height, as a percentage of the band's height. @default 34 */
  tileHeight?: number;
  /**
   * Tile width divided by tile height. @default 2.2
   *
   * The demo's 16/9 is a photograph's shape and it is wrong twice over for
   * logos: these marks are wide and short, so a 16/9 plaque leaves a moat
   * of empty well around every one of them, and a tile's angular width is
   * `aspect × unit`, so the wider the plaque the more of the cylinder it
   * wraps and the harder `fit` then has to flatten the curve to keep it in
   * front of the axis. 2.2 is the nameplate shape these wordmarks actually
   * want, and it buys back about 3deg of curve against 2.4.
   */
  aspectRatio?: number;
  /** Space between tiles, as a percentage of a tile's height. @default 6 */
  gap?: number;
  /** Vertical centre of the row, as a percentage of the band's height. @default 50 */
  axis?: number;
  /**
   * How far the row has bent round by the frame's edge, in degrees. Higher
   * curls the ends harder toward the viewer. Clamped to 5–85.
   *
   * This also sets how tight the cylinder is, and so how much perspective
   * the band gets: the camera sits at `CAMERA ×` the radius, and the radius
   * falls as the curve rises. At 55 the row came out visibly FLAT — six
   * rounded rectangles in a line — because a slack cylinder puts the camera
   * ~1030px back at 1440 and the only tiles bent enough to read were under
   * the end fade. At 80 the camera is ~570px back and the ends genuinely
   * turn toward the viewer, which is the whole point of the band.
   * @default 80
   */
  curve?: number;
  /**
   * Width of the fade at each end, as a percentage of the band's width.
   * @default 18
   *
   * This has to cover the whole stretch where a tile is leaving, not just
   * the last sliver: a departing tile is magnified about 2.3x as it comes
   * toward the lens, so at 8 the viewport simply CUT one — a half tile at
   * the right edge and "Physician's Choice" sliced mid-word at the left.
   * At 18 the mark has gone before the tile reaches the edge, and the row
   * reads as curving away rather than as cropped by the window.
   */
  fade?: number;
  /** Content rendered above the band. */
  children?: React.ReactNode;
  className?: string;
};

export function TiltedGridHero({
  images,
  speed = 4,
  tileHeight = 34,
  aspectRatio = 2.2,
  /*
   * 6, AND I TRIED 9. The residual touch at 1536-1920 is NOT a gap problem,
   * and widening the pitch made it worse — 14px became 30px. Opening the gap
   * lowers how many tiles fit, `columns` is rounded UP to a whole tile, and
   * the loop's sweep moves with it, so the end tiles land at a different and
   * sometimes worse point on the arc. The real cause is perspective
   * magnification at the ends, which `fit` already bounds.
   *
   * What is left is at most 14px, at x = 18% of the band — exactly where the
   * end fade has taken the marks down to near nothing. Measured on the
   * painted SLICES at 375 / 768 / 1024 / 1280 / 1440 / 1536 / 1680 / 1920;
   * everything from 375 to 1440 is clean at 0.
   */
  gap = 6,
  axis = 50,
  curve = 80,
  fade = 18,
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & TiltedGridHeroProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const orbit = `tgh-o-${id}`;
  const tile = `tgh-t-${id}`;
  // What was ASKED for. What the band can carry is `bend`, below.
  const wanted = (Math.min(85, Math.max(5, curve)) * Math.PI) / 180;

  // Null until the observer has measured the band. The row stays hidden
  // until then, so a first paint laid out for the wrong size never shows.
  const [layout, setLayout] = React.useState<ReturnType<typeof measure> | null>(null);

  // The mark each tile shows, as a position in the run of marks. It only
  // changes when the tile wraps, which is out of sight, so a resize never
  // swaps a mark on screen either.
  const [shown, setShown] = React.useState<Record<number, number>>({});

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const next = measure(width, height, tileHeight, aspectRatio, gap, wanted);
      setLayout((prev) =>
        prev?.columns === next.columns &&
        prev.sweep === next.sweep &&
        prev.unit === next.unit &&
        prev.bend === next.bend
          ? prev
          : next,
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tileHeight, aspectRatio, gap, wanted]);

  // Fetch every mark up front. A tile picks up its next one just before it
  // comes back into view, too late to start loading it then.
  React.useEffect(() => {
    for (const { src } of images) new Image().src = src;
  }, [images]);

  const { columns, sweep, unit, limit, bend } =
    layout ?? measure(1200, 260, tileHeight, aspectRatio, gap, wanted);

  // Every length is a multiple of the tile's height, which follows the
  // band's height until MAX_WIDTH caps it on narrow screens.
  const u = (n: number) =>
    `calc(${+n.toFixed(4)} * min(${tileHeight}cqh, ${+(MAX_WIDTH / aspectRatio).toFixed(4)}cqw))`;

  const r = 100 * arc(bend);
  const radius = `${+r.toFixed(3)}cqw`;
  // Out to the axis, round it, back in: a box sits on the cylinder at the
  // angle rotateY gives it.
  const turn = (deg: number) =>
    `translateZ(${radius}) rotateY(${+deg.toFixed(4)}deg) translateZ(-${radius})`;

  // Beyond `limit` a tile is wholly off-screen, so it is hidden there. The
  // loop's ends, where it wraps, fall inside that stretch, and so do tiles
  // swinging round behind the camera.
  const hide = +(((sweep - limit) / (2 * sweep || 1)) * 100).toFixed(4);
  const duration = columns * speed;
  const css =
    `@keyframes ${orbit}{` +
    `from{transform:${turn(-sweep)}}to{transform:${turn(sweep)}}` +
    `0%,${hide}%,${100 - hide}%,100%{visibility:hidden}` +
    `${hide + 0.001}%,${100 - hide - 0.001}%{visibility:visible}}` +
    /*
     * REDUCED MOTION, AND WHY THIS NEEDS `!important` TO SAY IT.
     *
     * The demo just sets `animation-play-state: paused` here, which is the
     * right idea — every tile is already placed by its negative delay, so
     * pausing freezes the band as a finished still rather than tearing it
     * down. On this site that alone is not enough. `global.css` carries a
     * blanket reduced-motion rule that forces `animation-duration: 0.01ms`
     * and `animation-iteration-count: 1` on `*` with `!important`. Against
     * the demo's rule the band's whole 24s loop collapses into a hundredth
     * of a millisecond, every tile runs past its end, fill-mode is `none`
     * so every transform is dropped — and the band reassembles itself as
     * one stack of plaques piled dead centre. It is a worse failure than
     * the motion it was trying to spare anyone.
     *
     * So the duration and the iteration count are restored here, also with
     * `!important`, and the class selector outranks the universal one. The
     * tiles keep their places and simply stop.
     */
    `@media(prefers-reduced-motion:reduce){.${tile}{` +
    `animation-duration:${duration}s!important;` +
    `animation-iteration-count:infinite!important;` +
    `animation-play-state:paused!important}}`;

  const share = aspectRatio / SLICES;
  const mask = `linear-gradient(90deg,transparent,#000 ${fade}%,#000 ${100 - fade}%,transparent)`;

  // The tallest mark in the list takes the full box; the rest are scaled
  // against it, which is what `BRANDS[].h` already encodes.
  const tallest = Math.max(...images.map((i) => i.h ?? 0), 1);

  return (
    <div
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      {...props}
      style={{ containerType: 'size', ...props.style }}
    >
      <style>{css}</style>

      {/*
       * THE ROSTER, ONCE, AS TEXT.
       *
       * The band is decorative and it recycles: three tiles carry eight
       * brands, each tile swapping its mark every time it leaves the frame.
       * Exposing that to a screen reader would announce a handful of the
       * eight in an order that depends on when you happened to arrive, and
       * re-announce them every twelve seconds. So the band is hidden and
       * the full roster is published here instead — all of it, in order,
       * and it holds still.
       */}
      <ul className="sr-only">
        {images.map((image) => (
          <li key={image.alt}>{image.alt}</li>
        ))}
      </ul>

      <div
        aria-hidden
        className="text-text pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: layout ? 1 : 0,
          // A shared vanishing point on the row's centre line, so the ends
          // grow evenly above and below it as they come toward the viewer.
          perspective: `${+(r * CAMERA).toFixed(3)}cqw`,
          perspectiveOrigin: `50% ${axis}%`,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      >
        {Array.from({ length: columns }, (_, t) => {
          // Tile `columns - 1` starts nearest the exit and tile 0 furthest
          // back, so this numbers tiles in the order they come on.
          const first = columns - 1 - t;
          const image = images[(shown[t] ?? first) % Math.max(images.length, 1)];
          // This mark's share of the plaque's inner box, by its `h`.
          const markH = (1 - 2 * PAD_Y) * ((image?.h ?? tallest) / tallest);
          return (
            <div
              key={t}
              className={cn(tile, 'absolute')}
              style={{
                left: `calc(50% - ${u(aspectRatio / 2)})`,
                top: `calc(${axis}% - ${u(0.5)})`,
                width: u(aspectRatio),
                height: u(1),
                transformStyle: 'preserve-3d',
                // Tile t starts t tiles along the loop.
                animation: `${orbit} ${duration}s linear ${-t * speed}s infinite`,
              }}
              onAnimationIteration={(e) => {
                // elapsedTime counts whole loops, missed events included.
                const lap = Math.round(e.elapsedTime / duration);
                setShown((prev) => {
                  const next = lap * columns + first;
                  return prev[t] === next ? prev : { ...prev, [t]: next };
                });
              }}
            >
              {Array.from({ length: SLICES }, (_, k) => (
                <div
                  key={k}
                  className={cn(
                    'absolute top-0 overflow-hidden',
                    k === 0 && 'rounded-l-xl',
                    k === SLICES - 1 && 'rounded-r-xl',
                  )}
                  style={{
                    // Every strip starts at the tile's centre and is turned
                    // round the axis to its own place on the arc.
                    left: u((aspectRatio - share) / 2),
                    /*
                     * NO OVERLAP NOW THAT THE FILL IS TRANSLUCENT.
                     *
                     * This used to be `share + 1px` so neighbouring facets
                     * overlapped and no hairline opened between them — free
                     * when the plaque was an OPAQUE well, because painting the
                     * same opaque colour twice looks identical. At
                     * rgba(255,255,255,0.1) it does not: two strips over each
                     * other composite to about 0.19, and every seam showed as
                     * a vertical stripe down the plaque. Visible in dark on
                     * the first build of this change.
                     *
                     * Each strip is now exactly its share. The facets meet
                     * instead of overlapping, so the fill stays one even
                     * value across the whole plaque.
                     */
                    width: u(share),
                    height: u(1),
                    /*
                     * THE CARD MATERIAL, REBUILT ACROSS THE SLICES.
                     * Rashid: "give this scrolling bar's cards the same
                     * effect."
                     *
                     * A plaque is not one box — it is SLICES strips, each
                     * turned its own few degrees round the cylinder. Putting
                     * the card's whole material on each strip would draw ten
                     * sets of edges down the middle of every plaque, so it is
                     * reassembled instead:
                     *   · the fill is per strip and reads continuous;
                     *   · the top and bottom highlights are HORIZONTAL, so
                     *     they run straight through the seams and look like
                     *     one unbroken line;
                     *   · the vertical edge is drawn only on the strip that
                     *     actually has one — first on the left, last on the
                     *     right.
                     * No drop shadow: these sit on a curved row with no
                     * ground beneath them, and a flat rectangular drop would
                     * fight the arc.
                     */
                    background: 'var(--wx-glass-fill)',
                    boxShadow: [
                      'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                      'inset 0 -1px 0 rgba(255, 255, 255, 0.1)',
                      k === 0 ? 'inset 1px 0 0 var(--wx-glass-edge)' : null,
                      k === SLICES - 1 ? 'inset -1px 0 0 var(--wx-glass-edge)' : null,
                    ]
                      .filter(Boolean)
                      .join(', '),
                    transform: turn((aspectRatio / 2 - (k + 0.5) * share) * unit),
                  }}
                >
                  {image ? <Mark image={image} k={k} u={u} share={share} aspect={aspectRatio} markH={markH} /> : null}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {children}
    </div>
  );
}

/**
 * ONE BRAND MARK, PAINTED THROUGH THE LOGO RATHER THAN DRAWN.
 *
 * THE DEMO DREW AN `<img>` AND THAT CANNOT WORK HERE. Every file in
 * `src/assets/brands` is white artwork on an OPAQUE BLACK field — zero
 * transparent pixels, measured, and `site.ts` says so too. Drawn plainly
 * on a pale plaque in the light theme that is eight black rectangles; the
 * marquee this replaces got round it with `mix-blend-mode` plus, in light
 * mode, `filter: invert(1)` — and §1.2 forbids `filter` anywhere on this
 * component or its wrappers, so that door is shut.
 *
 * `object-contain` on a tinted tile, the obvious next move, does not help
 * either: contain only letterboxes the artwork, it does not make the black
 * field transparent, so the field lands on the plaque as a hard rectangle
 * in its own aspect ratio. It would look like a bug.
 *
 * So the logo is not drawn at all — it is used as a LUMINANCE MASK over a
 * painted rectangle. `mask-mode: luminance` reads the artwork's brightness
 * as coverage: the white mark becomes opaque, the black field becomes
 * nothing, and the greys along every antialiased edge become the partial
 * alpha that keeps the letterforms clean. What is left is a real alpha
 * channel, so the paint behind it can be `currentColor` — the band sets
 * `text-text`, which is near-white on dark and near-black on light. The
 * mark therefore inverts with the theme by itself, with no filter, no
 * blending, no stacking-context isolation and no second copy of any asset.
 *
 * The mark is sized within its own box, never cropped and never stretched:
 * `contain` preserves the artwork's aspect, and the box's height carries
 * the per-logo weighting from `BRANDS[].h` so a wide wordmark does not
 * out-shout a square one — the same balance the old marquee struck with
 * its per-logo `h`.
 */
function Mark({
  image,
  k,
  u,
  share,
  aspect,
  markH,
}: {
  image: TiltedGridImage;
  k: number;
  u: (n: number) => string;
  share: number;
  aspect: number;
  markH: number;
}) {
  const url = `url("${image.src}")`;
  return (
    <div
      className="absolute"
      style={{
        // The box spans the whole TILE, shifted by this strip's share, so
        // one mark reads continuously across all ten facets.
        left: u(-k * share + PAD_X),
        top: u((1 - markH) / 2),
        width: u(aspect - 2 * PAD_X),
        height: u(markH),
        background: 'currentColor',
        opacity: 0.82,
        maskImage: url,
        maskMode: 'luminance',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskImage: url,
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}

export default TiltedGridHero;
