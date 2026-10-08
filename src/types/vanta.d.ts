/**
 * Ambient types for the auth-page halo.
 *
 * `three` ships no types of its own and `@types/three` is a large package we
 * would be installing to describe exactly one call — we hand the namespace
 * straight to Vanta and never touch it ourselves. `vanta` ships no types at
 * all. A declaration file keeps `strict` satisfied without either dependency.
 *
 * Deliberately narrow: only the shape `HaloBackdrop` actually uses. If anything
 * else in the product starts using three.js directly, this stops being enough
 * and `@types/three` becomes the right answer.
 */
declare module 'three';

declare module 'vanta/dist/vanta.halo.min.js' {
  interface VantaEffect {
    destroy?: () => void;
    setOptions?: (options: Record<string, unknown>) => void;
  }
  const HALO: (options: Record<string, unknown>) => VantaEffect;
  export default HALO;
}
