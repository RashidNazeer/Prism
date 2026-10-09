import { useRef, type ReactNode } from 'react';
import { m, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { cn } from '@/lib/utils';

/** Page gutter + max width. Every section uses this so nothing drifts. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  // max-w-7xl (1280px): on a ~1280px viewport the content fills the width and
  // the awkward sliver of side margin disappears.
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-5 sm:px-8', className)}>{children}</div>
  );
}

/** Vertical rhythm for a page section. */
export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // scroll-mt clears the fixed header so anchor jumps don't hide the heading.
    <section id={id} className={cn('scroll-mt-20 py-20 sm:py-28', className)}>
      <Container>{children}</Container>
    </section>
  );
}

/**
 * Small uppercase label above a section heading. Monospace and letter-spaced,
 * with a live accent dot, the one recurring motif across the marketing page.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted inline-flex items-center gap-2 font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
      <span className="bg-accent size-1.5 rounded-full" aria-hidden />
      {children}
    </span>
  );
}

/**
 * Fades content up as it scrolls into view. `once` so a section never
 * re-animates when the user scrolls back, that reads as jittery, not polished.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  depth,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Opt in to scroll-driven depth instead of the one-shot fade. See `ScrollDepth`. */
  depth?: ScrollDepthOptions;
}) {
  const quiet = useReducedMotion();
  /* Reduced motion keeps the plain fade, which is the only thing it needs. */
  if (depth && !quiet) {
    return (
      <ScrollDepth {...depth} className={className}>
        {children}
      </ScrollDepth>
    );
  }
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </m.div>
  );
}

/* ============================================================================
   SCROLL DEPTH
   ============================================================================ */

export interface ScrollDepthOptions {
  /** Pixels the block starts below its resting place. */
  rise?: number;
  /** Degrees it starts tipped back about its top edge (rotateX), settling to 0. */
  tilt?: number;
  /** Scale it starts at, settling to 1. */
  from?: number;
}

/**
 * A block that GAINS DEPTH AS IT ENTERS, driven by scroll position rather than
 * fired once on arrival.
 *
 * Progress runs from the block's top touching the bottom of the viewport to its
 * top reaching 55% of the way up. Over that span it rises into place, un-tips
 * from a slight `rotateX`, scales up to full size and fades in, all four tied to
 * the thumb, so scrolling back un-does it. It is `once`-less on purpose: a
 * parallax that only plays on the way down feels like a one-shot animation
 * rather than a surface you are moving past.
 *
 * WHY THESE FOUR AND NOTHING ELSE. They are `transform` and `opacity`, which
 * the compositor handles without touching layout or paint. `rotateX` is applied
 * with `transformPerspective`, which is a perspective baked into this one
 * element's own matrix, so a grid of these has one vanishing point per card
 * exactly like `TiltCard` does. There is NO `translateZ` here: under a
 * perspective that makes an element physically larger, and at rest this block
 * resolves to scale 1 with 0 rotation, so it is the size it was drawn at.
 *
 * Callers must not put this on an element that is also a `TiltCard`: both want
 * `transform`. Wrap the card instead, which is how `HowItWorks` uses it.
 *
 * Off entirely under `prefers-reduced-motion` (see `Reveal`, which is the only
 * thing that mounts this).
 */
function ScrollDepth({
  children,
  className,
  rise = 56,
  tilt = 14,
  from = 0.94,
}: ScrollDepthOptions & { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'start 0.55'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [rise, 0]);
  const rotateX = useTransform(scrollYProgress, [0, 1], [tilt, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [from, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.55], [0, 1]);

  return (
    <m.div
      ref={ref}
      className={className}
      style={{ y, rotateX, scale, opacity, transformPerspective: 1200, originY: 0 }}
    >
      {children}
    </m.div>
  );
}

/**
 * Progress of a section through the viewport, for `ParallaxLayer`s to read.
 * `start start` to `end start` is "from the section's top at the top of the
 * screen until its bottom has left it", which is the span a hero is on screen.
 * Pass the other offsets for a section that begins lower down.
 */
export function useSectionScroll(
  offset: ['start start' | 'start end', 'end start' | 'end end'] = ['start end', 'end start']
) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset });
  return { ref, progress: scrollYProgress };
}

/**
 * A layer that moves at its own rate against the page: translate `from` px at
 * progress 0 to `to` px at progress 1. Layers given different ranges drift
 * relative to each other, which is the whole of parallax, and is what makes a
 * flat page read as stacked planes.
 *
 * It renders a plain `div` under `prefers-reduced-motion`: off, not slowed.
 * Vertical only. Horizontal travel is the classic cause of page-wide sideways
 * scroll, so this never offers it.
 */
export function ParallaxLayer({
  progress,
  from,
  to,
  scaleTo,
  className,
  children,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  /** Optional scale at progress 1 (starts at 1). */
  scaleTo?: number;
  className?: string;
  children?: ReactNode;
}) {
  const quiet = useReducedMotion();
  const y = useTransform(progress, [0, 1], [from, to]);
  const scale = useTransform(progress, [0, 1], [1, scaleTo ?? 1]);
  if (quiet) return <div className={className}>{children}</div>;
  return (
    <m.div className={className} style={{ y, scale }}>
      {children}
    </m.div>
  );
}
