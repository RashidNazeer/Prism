#!/usr/bin/env node
/**
 * Design-token guard. Runs as part of `pnpm build`.
 *
 * Two jobs, both aimed at the same promise: dark mode and light mode never
 * drift apart.
 *
 *   1. PARITY, every colour token defined in one theme must also be defined
 *                in the other. This is what actually causes "colour mismatch"
 *                bugs: someone adds --wx-thing to dark, forgets light, and the
 *                token silently falls back to the dark value on a white page.
 *   2. CONTRAST, every text/background pair listed below must clear WCAG AA
 *                in BOTH themes.
 *
 * Exits non-zero on failure, so a bad palette can never reach a deploy.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS = resolve(here, '../src/styles/tokens.css');

/* ---------------------------------------------------------------- parsing -- */

const css = readFileSync(TOKENS, 'utf8');

/** Pull the declarations out of the block whose selector list contains `needle`. */
function block(needle) {
  const re = new RegExp(`([^{}]*${needle}[^{}]*)\\{([^}]*)\\}`, 'g');
  const out = {};
  let m;
  while ((m = re.exec(css)) !== null) {
    for (const [, k, v] of m[2].matchAll(/(--wx-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out[k] = v.trim();
    }
  }
  return out;
}

const dark = block("data-theme='dark'");
const light = block("data-theme='light'");

/** Colour tokens only, shadows, fonts, gradients and sizes aren't comparable. */
const isColour = (v) => /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(v.trim());

/* --------------------------------------------------------------- contrast -- */

const hex = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* ------------------------------------------------------------------ rules -- */

/** [foreground token, background token, minimum ratio, human label] */
const PAIRS = [
  ['--wx-text', '--wx-bg', 4.5, 'body text on page'],
  ['--wx-text', '--wx-surface-1', 4.5, 'body text on card'],
  ['--wx-text', '--wx-surface-2', 4.5, 'body text on nested card'],
  ['--wx-text', '--wx-surface-3', 4.5, 'body text on input well'],
  ['--wx-text-muted', '--wx-bg', 4.5, 'muted text on page'],
  ['--wx-text-muted', '--wx-surface-1', 4.5, 'muted text on card'],
  ['--wx-text-muted', '--wx-surface-2', 4.5, 'muted text on nested card'],
  ['--wx-text-faint', '--wx-bg', 4.5, 'faint text on page'],
  ['--wx-text-faint', '--wx-surface-1', 4.5, 'faint text on card'],
  ['--wx-accent', '--wx-bg', 4.5, 'accent text on page'],
  ['--wx-accent', '--wx-surface-1', 4.5, 'accent text on card'],
  ['--wx-accent', '--wx-surface-2', 4.5, 'accent text on nested card'],
  ['--wx-accent-hover', '--wx-bg', 4.5, 'accent hover on page'],
  ['--wx-on-accent', '--wx-accent', 4.5, 'label on accent button'],
  ['--wx-on-accent', '--wx-accent-hover', 4.5, 'label on hovered accent button'],
  ['--wx-success', '--wx-bg', 4.5, 'success text on page'],
  ['--wx-success', '--wx-surface-1', 4.5, 'success text on card'],
  ['--wx-danger', '--wx-bg', 4.5, 'danger text on page'],
  ['--wx-danger', '--wx-surface-1', 4.5, 'danger text on card'],
  ['--wx-warning', '--wx-bg', 4.5, 'warning text on page'],
  ['--wx-warning', '--wx-surface-1', 4.5, 'warning text on card'],
  ['--wx-info', '--wx-bg', 4.5, 'info text on page'],
  ['--wx-info', '--wx-surface-1', 4.5, 'info text on card'],
  // Non-text UI boundaries only need 3:1 (WCAG 1.4.11).
  ['--wx-border-interactive', '--wx-bg', 3, 'control border on page'],
  ['--wx-border-interactive', '--wx-surface-1', 3, 'control border on card'],
  ['--wx-accent', '--wx-bg', 3, 'focus ring on page'],
  ['--wx-text-inverse', '--wx-text', 4.5, 'inverted text on inverted fill'],
];

/* ------------------------------------------------------------------- run --- */

let failures = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failures++;
};

console.log('\nDesign token guard\n' + '='.repeat(70));

// 1. Parity
console.log('\n[1/2] Theme parity (dark <-> light)');
const darkColours = Object.keys(dark).filter((k) => isColour(dark[k]));
const lightColours = Object.keys(light).filter((k) => isColour(light[k]));

for (const k of darkColours) {
  if (!(k in light)) fail(`${k} is defined in dark but MISSING in light`);
}
for (const k of lightColours) {
  if (!(k in dark)) fail(`${k} is defined in light but MISSING in dark`);
}
if (failures === 0) {
  console.log(`  OK    ${darkColours.length} colour tokens present in both themes`);
}

// 2. Contrast
console.log('\n[2/2] WCAG contrast');
for (const [theme, tokens] of [
  ['dark ', dark],
  ['light', light],
]) {
  for (const [fg, bg, min, label] of PAIRS) {
    const fgv = tokens[fg];
    const bgv = tokens[bg];
    if (!fgv || !bgv) {
      fail(`${theme}  ${label}: token ${!fgv ? fg : bg} not found`);
      continue;
    }
    // Translucent tokens sit over an unknown backdrop; skip rather than guess.
    if (!fgv.startsWith('#') || !bgv.startsWith('#')) continue;

    const r = ratio(fgv, bgv);
    if (r < min) {
      fail(
        `${theme}  ${label}: ${r.toFixed(2)}:1 (needs ${min}:1)  ${fg}=${fgv} on ${bg}=${bgv}`
      );
    }
  }
}
if (failures === 0) console.log(`  OK    all pairs pass in both themes`);

console.log('\n' + '='.repeat(70));
if (failures > 0) {
  console.error(`${failures} problem(s) found. Fix src/styles/tokens.css.\n`);
  process.exit(1);
}
console.log('Design tokens pass.\n');
