import type { ReactNode } from 'react';
import { m, useReducedMotion } from 'motion/react';

/**
 * One tile arriving. OPACITY AND TRANSLATE-Y ONLY, about 40ms apart.
 *
 * `m.li` rather than `motion.li`: the app runs under
 * `LazyMotion features={domAnimation} strict`, and a bare `motion.*` component
 * THROWS under `strict`. See `src/app/providers.tsx`.
 *
 * REDUCED MOTION LANDS IT WHERE IT BELONGS WITH NO TRAVEL AND NO STAGGER.
 * `MotionConfig reducedMotion="user"` already honours the system setting, and
 * this makes it explicit: a stagger is a delay, not an animation, so the
 * global setting would still have held fifteen tiles back by up to a quarter of
 * a second for somebody who asked for no movement at all.
 */
export function TileIn({
  index,
  children,
}: {
  /** Position in the list. The stagger is capped so a long list is not slow. */
  index: number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <m.li
      initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : { duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 7) * 0.04 }
      }
    >
      {children}
    </m.li>
  );
}
