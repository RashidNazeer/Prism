import { AuroraBackground } from '@/components/ui/AuroraBackground';

/**
 * THE GROUND, BEHIND EVERYTHING.
 *
 * THE GLASSFOLD SHADER IS RETIRED, 2026-10-16. Rashid asked for the aurora
 * field "in my whole app" and to "drop the current one".
 *
 * `HaloBackdrop` is kept as the seam rather than deleted, and that is the
 * whole point of it: five places mount the ground — `AuthShell`, `AppShell`,
 * `SitePage`, `Apply` and `Landing` — so having one component for it means
 * changing the ground is one edit instead of five. None of those files
 * changed to make this swap.
 *
 * `GlassFold.tsx` and the WebGL fragment shader in it are left in the tree,
 * unreferenced. That shader is Rashid's own, pasted verbatim, and if the
 * aurora turns out not to be what he wants it is one import away from coming
 * back. The tokens it read (`--wx-field-body`, `--wx-field-edge`) are still
 * declared for the same reason.
 *
 * `intensity` carries straight through: `subtle` behind a signed-in screen,
 * where there is real work on top of the ground, and `full` on the public
 * pages.
 */
export function HaloBackdrop({
  className,
  intensity = 'full',
}: {
  className?: string;
  /** `full` behind the auth pages, hero and `/apply`; `subtle` behind the app. */
  intensity?: 'full' | 'subtle';
}) {
  return <AuroraBackground className={className} intensity={intensity} />;
}
