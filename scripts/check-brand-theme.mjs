#!/usr/bin/env node
/**
 * Can an admin pick a colour that makes a Brand Hub unreadable?
 *
 * `check-contrast.mjs` guards `tokens.css` and fails the build if dark and
 * light drift or a pair drops below WCAG AA. It cannot see a brand's colour,
 * because that lives in the DATABASE and is chosen in a colour picker. So this
 * guards the other half: it derives a full theme for a large sweep of colours
 * and asserts every text-on-background pair in the contract clears its ratio,
 * in BOTH modes.
 *
 * The sweep is deliberately hostile. Pure yellow, pure cyan, white, black,
 * greys, fully saturated primaries and a full hue circle at several
 * saturations, because the whole risk here is a colour nobody thought to try.
 *
 * No database and no browser. Runs inside `pnpm build`, so a change to the
 * derivation that quietly breaks one hue cannot reach a deploy.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src/lib/brand-theme.ts');

/*
 * The module is TypeScript and this is plain Node. Strip the types with the
 * TypeScript compiler that is already a dependency rather than adding a loader:
 * one transpile, into a temp file, imported once.
 */
const dir = mkdtempSync(join(tmpdir(), 'wx-brand-'));
let mod;
try {
  const tsc = resolve(here, '../node_modules/typescript/bin/tsc');
  /*
   * RUN IT FROM THE TEMP DIRECTORY, not from the repo. Naming files on the
   * command line while a `tsconfig.json` sits in the working directory is
   * TS5112, and tsc treats it as an error rather than a warning.
   */
  execFileSync(
    process.execPath,
    [tsc, SRC, '--outDir', dir, '--module', 'esnext', '--target', 'es2022', '--skipLibCheck'],
    { stdio: 'pipe', cwd: dir }
  );
  mod = await import(pathToFileURL(join(dir, 'brand-theme.js')).href);
} finally {
  // Imported already, so the directory has done its job either way.
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
}

const { deriveBrandTheme, auditBrandTheme, contrast, CONTRACT } = mod;

/* ------------------------------------------------------------- the sweep -- */

const colours = [];

// A full hue circle at three saturations and three lightnesses.
for (let h = 0; h < 360; h += 15) {
  for (const [s, l] of [
    [1, 0.5],
    [0.55, 0.42],
    [0.28, 0.62],
  ]) {
    colours.push(hslHex(h, s, l));
  }
}

// And the ones a person actually types, including the awkward ones.
colours.push(
  '#173d36', // the Penetrex green from Rashid's mockup
  '#2a6356',
  '#5a3045', // Aurora Skin
  '#1d3149', // Pave Goods
  '#c8924b', // Wurx gold, the default
  '#ffffff', // white: no hue at all
  '#000000', // black
  '#808080', // mid grey
  '#f2f2f2',
  '#0a0a0a',
  '#ffff00', // pure yellow, the classic contrast trap
  '#00ffff',
  '#ff00ff',
  '#ff0000',
  '#00ff00',
  '#0000ff'
);

function hslHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/* ------------------------------------------------------------- the checks -- */

let failures = 0;
const worst = new Map();

for (const hex of colours) {
  const bad = auditBrandTheme(hex);
  if (bad.length) {
    failures++;
    console.error(`  FAIL  ${hex}`);
    for (const b of bad.slice(0, 4)) {
      console.error(`        ${b.mode.padEnd(5)} ${b.label}: ${b.got.toFixed(2)}:1, needs ${b.min}:1`);
    }
  }
  // Track the tightest margin per pair, so a change that erodes headroom shows.
  const theme = deriveBrandTheme(hex);
  for (const mode of ['light', 'dark']) {
    for (const pair of CONTRACT) {
      const got = contrast(theme[mode][pair.fg], theme[mode][pair.bg]);
      const key = `${mode} ${pair.label}`;
      const prev = worst.get(key);
      if (!prev || got < prev.got) worst.set(key, { got, min: pair.min, hex });
    }
  }
}

console.log(`\nBrand themes checked: ${colours.length} colours x 2 modes x ${CONTRACT.length} pairs`);

/*
 * A brand whose derived theme is the SAME in both modes would mean the dark
 * branch silently stopped being applied, which no contrast check would catch.
 */
const sample = deriveBrandTheme('#173d36');
if (sample.light.page === sample.dark.page) {
  console.error('  FAIL  light and dark derive the same page colour, so one mode is not being built');
  failures++;
} else {
  console.log('  PASS  light and dark derive genuinely different palettes');
}

/* An unreadable colour must not silently become grey mush either. */
const grey = deriveBrandTheme('#808080');
if (grey.light.accent === grey.light.page) {
  console.error('  FAIL  a grey brand collapses to a single colour');
  failures++;
} else {
  console.log('  PASS  a grey brand still has a usable accent');
}

console.log('\n  tightest margins seen:');
const rows = [...worst.entries()].sort((a, b) => a[1].got / a[1].min - b[1].got / b[1].min).slice(0, 6);
for (const [key, v] of rows) {
  console.log(`    ${key.padEnd(42)} ${v.got.toFixed(2)}:1 (needs ${v.min}) worst at ${v.hex}`);
}

if (failures) {
  console.error(`\n${failures} brand colour(s) produce an unreadable hub.\n`);
  process.exit(1);
}
console.log('\nEvery brand colour an admin could pick derives a readable hub, in both modes.\n');
