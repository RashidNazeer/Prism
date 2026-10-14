/**
 * GLASS FOLD — the app's background, as a WebGL field.
 *
 * Rashid's `glass-fold` shader, adapted from the Next.js original to this tree:
 * six folded panes of glass, each with one creased edge catching the light and
 * thinning out behind it, screen-blended so overlaps BRIGHTEN rather than
 * darken, with optional film grain.
 *
 * ---------------------------------------------------------------------------
 * WHAT CHANGED FROM THE SOURCE, AND WHY EACH CHANGE IS NOT OPTIONAL
 * ---------------------------------------------------------------------------
 *
 * 1. NO `"use client"`. This is Vite + React 19, not Next's app router, and the
 *    directive is dead text here.
 *
 * 2. NO `filter` AND NO `backdrop-filter`, on the canvas or on anything this
 *    file renders. `docs/GLASS_PLAN.md` §1.2: this mounts in `AppShell`, which
 *    is an ancestor of `.wurxbase-root`, and either property there becomes the
 *    containing block for every `position: fixed` overlay in the vendored admin
 *    app — the fault that put its modals 3,413px down the page, three times.
 *    `scripts/check-backdrop-ancestry.mjs` asserts it. The damping that keeps
 *    text legible (§4.1) is therefore done IN THE SHADER and, if ever needed,
 *    by a plain translucent `<div>` — never by a filter.
 *
 * 3. COLOURS COME FROM `--wx-*` AT RUNTIME. There is not one hex literal in
 *    this file. `color1/2/3` name CSS custom properties, which are read with
 *    `getComputedStyle` and re-read when `data-theme` changes on `<html>`, so
 *    the field is theme-reactive for free and `tokens.css` stays the single
 *    place colour is decided.
 *
 * 4. COST, which is the reason a WebGL backdrop was REMOVED from this project
 *    once already (see the aurora comment in `tokens.css`). Most users are
 *    TikTok creators on phones, and `scripts/browser.mjs` runs Chromium with
 *    `--disable-gpu`, so NO test in this repo can measure what a GL context
 *    costs. Everything below is therefore a control rather than a measurement:
 *
 *      · stops rendering when the tab is hidden (`visibilitychange`)
 *      · stops rendering when the canvas is off-screen (`IntersectionObserver`)
 *      · caps `devicePixelRatio` at 1.5, and at 1 below `md`
 *      · renders at `RENDER_SCALE` of that and lets the canvas scale up — this
 *        shader is all soft gradients and does not show it
 *      · survives `webglcontextlost` / `webglcontextrestored` without throwing
 *      · falls back to the CSS ground on `body` when there is no GL at all, so
 *        a machine with no GPU still gets a finished page
 *      · honours `prefers-reduced-motion` REACTIVELY — the source reads it once
 *        at mount; this re-reads on change and, when reduced, paints ONE still
 *        frame instead of animating
 *
 * 5. THE SHADERS ARE DELETED. The source deletes the program and the buffer and
 *    leaks both compiled shader objects. They are detached and deleted here,
 *    and the context is released through `WEBGL_lose_context` on unmount.
 *
 * 6. `speed` DEFAULTS FAR BELOW THE DEMO'S. The demo ships `0.5`, which is a
 *    showpiece. This sits behind live financial figures, so the default is slow
 *    enough to read as light moving rather than as animation.
 */

import { useEffect, useRef } from 'react';

/* ============================================================================
   The tuning, in one place, because every one of these numbers is a decision
   somebody will want to re-read later.
   ============================================================================ */

/**
 * How much smaller than the (already capped) device pixel ratio the drawing
 * buffer is. Fragment cost is quadratic in this, and the field is six soft
 * exponential falloffs with no edge anywhere, so 0.6 is invisible and costs
 * 36% of the fragments.
 */
const RENDER_SCALE = 0.6;

/** The hard ceiling on DPR, under the source's 2. Below `md` it drops to 1. */
const MAX_DPR = 1.5;
const MAX_DPR_SMALL = 1;
const SMALL_SCREEN = 768;

/** Six panes, matching the source. The loop bound must be a constant in GLSL 1. */
const PANES = 6;

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/*
 * THE FIELD.
 *
 * Each pane is a half-plane whose straight boundary IS the crease. `d` is the
 * signed distance to that crease: positive in front of the fold, negative
 * behind it.
 *
 *   face     the pane, which exists only in front of its crease
 *   body     the pane's glass, brightest at the crease and thinning out behind
 *   inner    the dense sliver pressed right against the crease
 *   fresnel  the crease itself, catching light, and it reads through the pane
 *   rim      the hairline inside the crease
 *   bloom    the light spilling off the crease into the pane behind it
 *
 * `screen` is why overlaps brighten: two panes over one another is more light,
 * not less, which is the whole reason folded glass looks like folded glass.
 *
 * u_damp IS THE CONTRAST BUDGET, NOT A TASTE SETTING. §4.1: the shader output
 * is the worst-case backdrop behind every glass panel, so its luminance range
 * has to stay inside the band that keeps `--wx-text-muted` and
 * `--wx-text-faint` at 4.5:1 on a bare page. `mix` toward the background is a
 * straight linear damp of the whole field — it lowers the contrast between
 * color1/2/3 exactly as §4.1 prescribes when the range is too wide — and it is
 * done here, in the fragment, because the alternative (a `filter`) is illegal
 * above the fence. Dark mode's ceiling is far tighter than light's: brightening
 * a light page only ever HELPS dark text, while on `#202024` there is only
 * about 3x of luminance headroom before faint text fails.
 */
/*
 * RASHID'S SHADER, VERBATIM. This is the GradFlow `glass-fold` fragment exactly
 * as he supplied it, and it REPLACED a reimplementation.
 *
 * What was here before was written from a prose description of this shader,
 * because the file it was meant to be copied from had not been saved when the
 * engineer went looking for it. It was a reasonable rewrite and it was the
 * wrong picture: it built panes as rotated infinite half-planes, where this one
 * builds them as CREASES — a per-pane `crease` curve in x that each pane's
 * surface falls away from, with a `pixel`-wide smoothstep so the fold edge is
 * one pixel at any resolution. Those are different geometries, and that is why
 * it did not look like his file.
 *
 * ONE LINE IS ADDED AND NOTHING IS REMOVED: `u_damp`, applied in `main` after
 * `shade` and before the grain. The screen blend here is unbounded — each pane
 * does `color += light * (1.0 - color)`, so six panes drive the field toward
 * white — and on our dark ground that walks straight through the contrast floor
 * in GLASS_PLAN §4.1. `u_damp` mixes the finished field back toward `u_color2`,
 * which lowers the field's CONTRAST without touching its shape, so his folds
 * survive intact at whatever amplitude the text budget allows. See `DAMP` in
 * HaloBackdrop.tsx for the two numbers and why they differ per theme.
 */
const FRAGMENT_SHADER = `
  precision highp float;

  uniform float u_time;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;
  uniform float u_scale;
  uniform float u_noise;
  uniform float u_damp;
  uniform float u_vignette;
  uniform vec2 u_resolution;
  varying vec2 vUv;

  float grain(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // centered coordinates, y in [-0.5, 0.5], x stretched by the aspect ratio
  vec2 centered(vec2 uv) {
    vec2 p = uv - 0.5;
    p.x *= u_resolution.x / max(u_resolution.y, 1.0);
    return p;
  }

  mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  // panes of glass folded over each other. Each pane has one creased edge
  // that catches the light and thins out to nothing behind it; panes screen
  // over one another, so overlaps get brighter instead of darker.
  vec3 shade(vec2 uv, float time) {
    vec2 q = rot(0.6) * centered(uv) * 2.0 * u_scale;
    float t = time * 0.6;
    float pixel = 2.0 * u_scale / max(u_resolution.y, 1.0);

    vec3 color = mix(u_color2, u_color2 * u_vignette, clamp(length(centered(uv)) * 1.3, 0.0, 1.0));

    for (int i = 0; i < ${PANES}; i++) {
      float fi = float(i);
      float bend = mod(fi, 2.0) * 2.0 - 1.0;

      float crease = (fi - 2.5) * 0.4
                   + 0.26 * sin(q.x * (1.05 + 0.12 * fi) + fi * 1.9 + t * (0.25 + 0.05 * fi))
                   + 0.1 * bend * q.x * q.x;
      float s = q.y - crease;
      float pane = smoothstep(-pixel, pixel, s);
      float back = max(s, 0.0);

      // thick near the crease, clear further in
      float body = exp(-back * 1.7);
      float fresnel = exp(-back * 8.0);
      // the lit edge, and a fainter line just inside it for the glass's thickness
      float rim = exp(-back * 80.0);
      float inner = exp(-pow((back - 0.045) / 0.014, 2.0));
      float bloom = exp(-abs(s) * 20.0);

      vec3 tint = mix(u_color1, u_color3, clamp(fresnel * 0.6 + 0.08 + 0.14 * sin(fi * 2.1 + q.x * 0.8 + t * 0.2), 0.0, 1.0));
      vec3 light = tint * pane * (body * 0.42 + fresnel * 0.4)
                 + u_color3 * (pane * (rim * 0.6 + inner * 0.12) + bloom * 0.1);

      // screen blend
      color += light * (1.0 - color);
    }

    return clamp(color, 0.0, 1.0);
  }

  void main() {
    vec3 color = shade(vUv, u_time);
    // THE ONLY ADDITION to his shader. See the note above.
    color = mix(u_color2, color, u_damp);
    if (u_noise > 0.001) {
      float g = grain(vUv * 200.0 + u_time * 0.1);
      color *= 1.0 - u_noise * 0.4 + u_noise * g * 0.4;
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

/* ============================================================================
   Reading our own tokens
   ============================================================================ */

type CssVar = `--${string}`;

/**
 * `#rgb`, `#rrggbb` and `rgb()/rgba()` to a 0..1 triple.
 *
 * `tokens.css` is hex today and `check-contrast.mjs` keeps it that way, but
 * `getComputedStyle` hands back whatever the token literally says, so the
 * `rgb()` branch is here so that a future token form does not black out the
 * background. An unparseable value returns `null` and the caller keeps the
 * previous colour rather than painting a guess.
 */
function parseCssColor(raw: string): [number, number, number] | null {
  const value = raw.trim();
  if (!value) return null;

  const triple = (r: number, g: number, b: number): [number, number, number] | null =>
    [r, g, b].every(Number.isFinite) ? [r / 255, g / 255, b / 255] : null;

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    /* `#rgb` is expanded to `#rrggbb` so one parse path serves both. */
    const full =
      hex.length === 3
        ? hex.replace(/./g, (ch) => ch + ch)
        : hex.length === 6 || hex.length === 8
          ? hex
          : '';
    if (!full) return null;
    return triple(
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    );
  }

  const match = /^rgba?\(([^)]+)\)$/i.exec(value);
  const inner = match?.[1];
  if (inner) {
    const parts = inner
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((n) => (n.endsWith('%') ? (Number.parseFloat(n) / 100) * 255 : Number.parseFloat(n)));
    const [r, g, b] = parts;
    if (parts.length === 3 && r !== undefined && g !== undefined && b !== undefined) {
      return triple(r, g, b);
    }
  }

  return null;
}

function readToken(name: CssVar, fallback: [number, number, number]): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  return parseCssColor(raw) ?? fallback;
}

/* ============================================================================
   The component
   ============================================================================ */

export type GlassFoldProps = {
  /** The pane body. A CSS custom property name, never a literal. */
  color1?: CssVar;
  /** THE BACKGROUND. Sits on the page colour, so the default is `--wx-bg`. */
  color2?: CssVar;
  /** The lit edges. A CSS custom property name, never a literal. */
  color3?: CssVar;
  /**
   * How fast the folds drift. The demo's `0.5` is a showpiece; this is a
   * background behind live numbers, and `0` is a legitimate answer.
   */
  speed?: number;
  /** How large the panes are. Bigger number, bigger panes. */
  scale?: number;
  /** Film grain, added after the field. `0` disables the branch entirely. */
  noise?: number;
  /**
   * The contrast budget, 0..1. `0` is a flat page of `color2`; `1` is the
   * undamped field. See the shader comment — this is §4.1, not taste.
   *
   * A `{ light, dark }` pair is resolved from `data-theme` on `<html>` inside
   * the same read as the colours, and NOT by re-rendering: the two themes need
   * very different budgets (brightening a light page only ever helps dark text;
   * `#202024` has about 3x of luminance headroom before faint text fails), and
   * routing that through React state would race the colour read on the frame
   * the theme flips.
   */
  /*
   * THE EDGE FALLOFF. His shader hardcodes `u_color2 * 0.45` — the ground at
   * 45% toward black at the corners. On his near-black demo that is invisible;
   * on our LIGHT page it is a heavy grey vignette, which is the "too much
   * darker shadows" and the "dark spots on the sides" Rashid reported. It is a
   * uniform now so each theme can set its own, exactly like `damp`.
   */
  vignette?: number | { light: number; dark: number };
  damp?: number | { light: number; dark: number };
  className?: string;
};

export function GlassFold({
  color1 = '--wx-surface-1',
  color2 = '--wx-bg',
  color3 = '--wx-surface-2',
  speed = 0.06,
  scale = 1.15,
  noise = 0.025,
  damp = 1,
  vignette = 0.45,
  className,
}: GlassFoldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /*
   * The props live in a ref the effect reads, so changing `damp` or `speed`
   * never tears down and re-creates the GL context. The effect itself depends
   * on nothing and runs exactly once per mount.
   */
  const propsRef = useRef({ color1, color2, color3, speed, scale, noise, damp, vignette });
  propsRef.current = { color1, color2, color3, speed, scale, noise, damp, vignette };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /*
     * NO GL, NO CANVAS. `body` already paints `--wx-ground` for the whole
     * document, so leaving the canvas hidden is a finished page and not a
     * blank one. `failIfMajorPerformanceCaveat` is deliberately NOT set: a
     * software rasteriser is still better than nothing here, and the field is
     * cheap enough to survive one.
     */
    const gl =
      (canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
        preserveDrawingBuffer: false,
      }) as WebGLRenderingContext | null) ?? null;

    if (!gl) {
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = '';

    /* ---------------------------------------------------- GL resources --- */

    type Resources = {
      program: WebGLProgram;
      vs: WebGLShader;
      fs: WebGLShader;
      buffer: WebGLBuffer;
      uniforms: {
        resolution: WebGLUniformLocation | null;
        time: WebGLUniformLocation | null;
        color1: WebGLUniformLocation | null;
        color2: WebGLUniformLocation | null;
        color3: WebGLUniformLocation | null;
        scale: WebGLUniformLocation | null;
        noise: WebGLUniformLocation | null;
        damp: WebGLUniformLocation | null;
        vignette: WebGLUniformLocation | null;
      };
    };

    let resources: Resources | null = null;

    const compile = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const build = (): Resources | null => {
      const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fs = vs ? compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER) : null;
      const program = vs && fs ? gl.createProgram() : null;

      if (!vs || !fs || !program) {
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        if (program) gl.deleteProgram(program);
        return null;
      }

      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteProgram(program);
        return null;
      }

      const buffer = gl.createBuffer();
      if (!buffer) {
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteProgram(program);
        return null;
      }

      /* Two triangles, full screen. The source's buffer, unchanged. */
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );

      gl.useProgram(program);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      return {
        program,
        vs,
        fs,
        buffer,
        uniforms: {
          resolution: gl.getUniformLocation(program, 'u_resolution'),
          time: gl.getUniformLocation(program, 'u_time'),
          color1: gl.getUniformLocation(program, 'u_color1'),
          color2: gl.getUniformLocation(program, 'u_color2'),
          color3: gl.getUniformLocation(program, 'u_color3'),
          scale: gl.getUniformLocation(program, 'u_scale'),
          noise: gl.getUniformLocation(program, 'u_noise'),
          damp: gl.getUniformLocation(program, 'u_damp'),
          vignette: gl.getUniformLocation(program, 'u_vignette'),
        },
      };
    };

    /*
     * THE LEAK THE SOURCE HAS. It deletes the program and the buffer and never
     * touches the two compiled shader objects, which keeps their source and
     * their compiled form alive for the life of the context. Detach first —
     * a shader attached to a live program is only flagged for deletion.
     */
    const destroy = (r: Resources | null) => {
      if (!r) return;
      gl.detachShader(r.program, r.vs);
      gl.detachShader(r.program, r.fs);
      gl.deleteShader(r.vs);
      gl.deleteShader(r.fs);
      gl.deleteProgram(r.program);
      gl.deleteBuffer(r.buffer);
    };

    /* ------------------------------------------------------- the state --- */

    /** Pale defaults, used only until the first token read lands. */
    let c1: [number, number, number] = [0.5, 0.5, 0.5];
    let c2: [number, number, number] = [0.5, 0.5, 0.5];
    let c3: [number, number, number] = [0.5, 0.5, 0.5];

    let dampValue = 1;
    let vignetteValue = 0.45;

    const readColors = () => {
      const p = propsRef.current;
      c1 = readToken(p.color1, c1);
      c2 = readToken(p.color2, c2);
      c3 = readToken(p.color3, c3);
      /* `:root` is the dark theme in `tokens.css`; light is the opt-in. */
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      dampValue = typeof p.damp === 'number' ? p.damp : p.damp[light ? 'light' : 'dark'];
      vignetteValue =
        typeof p.vignette === 'number' ? p.vignette : p.vignette[light ? 'light' : 'dark'];
    };

    let width = 0;
    let height = 0;

    const resize = () => {
      const cap = window.innerWidth < SMALL_SCREEN ? MAX_DPR_SMALL : MAX_DPR;
      const dpr = Math.min(window.devicePixelRatio || 1, cap) * RENDER_SCALE;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (w === width && h === height) return false;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    };

    /* -------------------------------------------------------- the loop --- */

    let frame = 0;
    let elapsed = 0;
    let last = 0;
    let visible = !document.hidden;
    let onScreen = true;
    let contextLost = false;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** Re-read every time, so a mid-session change is honoured. §4 of the header. */
    let reduced = motionQuery.matches;

    const draw = () => {
      if (contextLost || !resources) return;
      const p = propsRef.current;
      const u = resources.uniforms;
      gl.useProgram(resources.program);
      gl.uniform2f(u.resolution, width, height);
      gl.uniform1f(u.time, elapsed);
      gl.uniform3fv(u.color1, c1);
      gl.uniform3fv(u.color2, c2);
      gl.uniform3fv(u.color3, c3);
      gl.uniform1f(u.scale, p.scale);
      gl.uniform1f(u.noise, p.noise);
      gl.uniform1f(u.damp, dampValue);
      gl.uniform1f(u.vignette, vignetteValue);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const stop = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      elapsed += dt * propsRef.current.speed;
      resize();
      draw();
    };

    /** One still frame. Reduced motion, and every paused state's last word. */
    const paint = () => {
      resize();
      draw();
    };

    const sync = () => {
      const shouldRun = visible && onScreen && !reduced && !contextLost;
      if (shouldRun) {
        if (!frame) {
          last = 0;
          frame = requestAnimationFrame(tick);
        }
        return;
      }
      stop();
      /* Paused is not blank: whatever stopped us, the field stays on screen. */
      if (visible && onScreen && !contextLost) paint();
    };

    /* ------------------------------------------------------ the wiring --- */

    const onVisibility = () => {
      visible = !document.hidden;
      sync();
    };

    const onMotionChange = () => {
      reduced = motionQuery.matches;
      sync();
    };

    const onResize = () => {
      if (!frame) paint();
    };

    /*
     * CONTEXT LOSS IS NORMAL, not exceptional: a phone backgrounding the tab,
     * a driver reset, another page taking the last context. `preventDefault` is
     * what makes a restore possible at all, and nothing here may throw — this
     * component is behind every screen in the product, signed in or not.
     */
    const onLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      stop();
      /* The old objects died with the context; dropping the handles is enough. */
      resources = null;
    };

    const onRestored = () => {
      contextLost = false;
      resources = build();
      if (!resources) {
        canvas.style.display = 'none';
        return;
      }
      canvas.style.display = '';
      width = 0;
      height = 0;
      readColors();
      sync();
      if (!frame) paint();
    };

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    motionQuery.addEventListener('change', onMotionChange);

    /* Theme is a `data-theme` attribute swap on `<html>`; re-read and repaint. */
    const themeObserver = new MutationObserver(() => {
      readColors();
      if (!frame) paint();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    /*
     * OFF-SCREEN IS FREE. Fixed to the viewport this normally intersects, so on
     * its own this observer earns little — what it actually catches is every
     * way the canvas can stop being painted WITHOUT the tab being hidden: a
     * route whose host is `display: none`, an ancestor collapsed to zero size,
     * and the fallback path where this element is hidden outright. Each of
     * those is a rAF loop that would otherwise run forever drawing nothing.
     */
    const intersection = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        sync();
      },
      { rootMargin: '0px' },
    );
    intersection.observe(canvas);

    /* --------------------------------------------------------- go ------- */

    /*
     * A CANVAS CAN ARRIVE WITH ITS CONTEXT ALREADY LOST, and in development it
     * routinely does: StrictMode mounts, unmounts and re-mounts, the first
     * unmount hands the context back, and `getContext` on the second mount
     * returns that same dead context rather than a fresh one. Everything on a
     * lost context returns null, so `build()` fails and the background
     * disappears for the rest of the session. Ask for it back and let
     * `onRestored` do the building.
     */
    if (gl.isContextLost()) {
      contextLost = true;
      canvas.style.display = 'none';
      gl.getExtension('WEBGL_lose_context')?.restoreContext();
    } else {
      resources = build();
      if (!resources) {
        canvas.style.display = 'none';
      } else {
        readColors();
        paint();
        sync();
      }
    }

    return () => {
      stop();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      motionQuery.removeEventListener('change', onMotionChange);
      themeObserver.disconnect();
      intersection.disconnect();
      destroy(resources);
      resources = null;
      /*
       * Hand the context back now rather than at the next GC. Browsers cap
       * live contexts (Chromium at 16) and silently kill the oldest, which on
       * a long session of route changes is how a background quietly goes blank.
       *
       * ONLY IF THE CANVAS IS ACTUALLY GONE. `loseContext()` kills the context
       * for the canvas ELEMENT, not for this effect, and `getContext` on that
       * element afterwards returns the same dead context. React runs this
       * cleanup with the node still attached whenever the effect re-runs
       * without unmounting — every StrictMode mount in development — and
       * killing the context there blanked the background for the rest of the
       * session. `isConnected` is false only on a real unmount, which is
       * exactly when releasing it is both safe and worth doing.
       */
      if (!canvas.isConnected) {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    };
  }, []);

  return (
    /*
     * `block` because a canvas is inline by default and an inline canvas gets a
     * baseline gap under it — which, on a full-bleed layer, is a scrollbar.
     *
     * `position: fixed` ON THE CANVAS ITSELF, not left to the mount point.
     * Rashid: the background must NOT scroll with the app. Two of the four
     * mount points wrap this in `absolute inset-0`, so taking the position from
     * the wrapper would mean the field scrolls on `/login` and `/apply` and
     * stays put everywhere else. Fixed here, it is the viewport on all four.
     *
     * NOTHING IN THIS STYLE OBJECT IS A `filter`, AND NOTHING EVER MAY BE.
     */
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'block',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
