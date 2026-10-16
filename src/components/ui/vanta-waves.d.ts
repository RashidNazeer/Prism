/**
 * TYPES FOR THE TWO PACKAGES THE WAVES FIELD LOADS, NEITHER OF WHICH SHIPS ANY.
 *
 * `three@0.134` predates three's bundled `.d.ts` files, and `vanta@0.5.24` has
 * never had any. The alternative was `@types/three`, and it was rejected on
 * purpose: it is a large dependency whose version has to be kept in lockstep
 * with a `three` that is pinned to r134 (the version Rashid's snippet names,
 * and the last one Vanta was built against), and this project calls exactly
 * ZERO three.js APIs — the namespace is imported and handed straight to Vanta,
 * which does all the work. Typing what we actually use is smaller and truer
 * than typing a library we never touch.
 *
 * `declare module 'three'` with no body is the shorthand ambient form: the
 * module resolves and its type is `any`. That is honest here. The Vanta side,
 * which we DO call into, is typed properly below.
 */

declare module 'three';

declare module 'vanta/src/vanta.waves.js' {
  /**
   * The subset of Vanta's options this project sets, plus the WAVES-specific
   * five. Everything here is read from `node_modules/vanta/src/_base.js` and
   * `node_modules/vanta/src/vanta.waves.js` — the npm package is the spec.
   */
  export interface VantaWavesOptions {
    /** The container. Vanta appends its canvas to this element. */
    el: HTMLElement;
    /** The three.js namespace. Without this Vanta looks for `window.THREE`. */
    THREE: unknown;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    /**
     * DIVIDES the device pixel ratio: Vanta calls
     * `setPixelRatio(devicePixelRatio / scale)`. So a scale ABOVE 1 renders
     * fewer pixels, which is the only lever on fragment cost this package
     * exposes (`antialias: true` is hard-coded in `initThree`).
     */
    scale?: number;
    scaleMobile?: number;
    /** `0x000000`-style number, or any string `THREE.Color#set` accepts. */
    color?: number | string;
    shininess?: number;
    waveHeight?: number;
    waveSpeed?: number;
    zoom?: number;
    /** `0` leaves the canvas transparent, so what is behind it shows through. */
    backgroundAlpha?: number;
    backgroundColor?: number | string;
  }

  export interface VantaEffect {
    /**
     * Removes Vanta's listeners, cancels its frame, disposes the scene's
     * geometry and materials and detaches the canvas. It does NOT dispose the
     * renderer or release the GL context — see `WavesField.tsx`.
     */
    destroy(): void;
    /** Merges options in. `onUpdate` re-reads them every frame. */
    setOptions(options: Partial<VantaWavesOptions>): void;
    /** The frame loop. Reassignable: Vanta re-arms through `this.animationLoop`. */
    animationLoop(): void;
    /** The handle of the pending frame, written by `animationLoop`. */
    req: number;
    /** Bound in the constructor, which is what makes it removable by hand. */
    windowMouseMoveWrapper(event: Event): void;
    renderer: {
      dispose?: () => void;
      forceContextLoss?: () => void;
      domElement?: HTMLCanvasElement;
    } | null;
  }

  const WAVES: (options: VantaWavesOptions) => VantaEffect;
  export default WAVES;
}
