import { cn } from '@/lib/utils';

/**
 * THE AURORA FIELD — the app's ground, everywhere.
 *
 * Adapted from the 21st.dev `aurora-background`, not copied. Four things in
 * the original cannot ship here, and each one is a rule this codebase already
 * enforces with a guard:
 *
 * 1. IT IS A BACKDROP, NOT A WRAPPER. The original wraps `children` in a
 *    `<main>` that also holds the filtered layer. Here the filtered layer must
 *    never be an ANCESTOR of page content: `filter` creates a containing block
 *    for every `position: fixed` descendant, which is what put the Paid
 *    Collabs modals 3,413px down the page three times. `GLASS_PLAN.md` §1.2,
 *    asserted by `scripts/check-backdrop-ancestry.mjs`. So this renders a
 *    sibling layer and takes no children at all, exactly as `HaloBackdrop`
 *    did.
 *
 * 2. IT ANIMATES `transform`, NOT `background-position`. The original moves
 *    `background-position` for 60s on a blurred, screen-sized element — a full
 *    repaint every frame of the most expensive thing on the page.
 *    `check-blur-budget.mjs` asserts that only `transform` and `opacity`
 *    animate (§4.3), so the drift is a `translate3d` on a wider-than-viewport
 *    field instead. Same movement, composited.
 *
 * 3. THE COLOURS ARE RASHID'S, NOT THE DEMO'S. The original hard-codes
 *    Tailwind blues and indigos through a `flattenColorPalette` plugin that
 *    needs `tailwind.config.js`; this project configures Tailwind v4 in CSS
 *    and has no such file. The gradients read `--wx-aurora-*`, which resolve
 *    to mint / sky / periwinkle per theme in `tokens.css`.
 *
 * 4. NO `framer-motion`. The project already runs `motion` under a strict
 *    `LazyMotion`, where a bare `motion.div` throws; nothing here needs a
 *    motion component anyway.
 *
 * `intensity` is kept from `HaloBackdrop` so the five mount sites did not have
 * to change: signed-in screens ask for `subtle`, public pages take the full
 * field.
 */
export function AuroraBackground({
  className,
  intensity = 'full',
}: {
  className?: string;
  intensity?: 'full' | 'subtle';
}) {
  return (
    <div aria-hidden className={cn('overflow-hidden', className)}>
      <div className="wx-aurora-field" data-intensity={intensity} />
    </div>
  );
}
