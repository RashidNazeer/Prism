#!/usr/bin/env node
/**
 * The two platforms must never be able to touch each other's data.
 *
 * WHY THIS RUNS IN THE BUILD. Rashid asked for certainty rather than a promise:
 * "both platform should not effect each other's data in anyway". It is true
 * today and I verified it by hand. A fact verified by hand once is a fact that
 * quietly stops being true, because the next person to add a query has no idea
 * the rule exists. So it is asserted on every build instead.
 *
 * WHAT IT ASSERTS
 *
 *   1. The vendored WurxBase code never names OUR project and never imports our
 *      Supabase client. It talks to its own two databases and nothing else.
 *   2. Our own code, scripts and migrations never name THEIR projects. Nothing
 *      of ours can read or write a row of theirs.
 *
 * WHY THAT IS ENOUGH. These are separate Postgres databases in separate Supabase
 * projects. There is no shared table, no cross-database foreign key and no
 * cascade that can span them, so a DELETE on one side is physically incapable of
 * reaching the other. The only way to break that is for code on one side to hold
 * a connection to the other, which is exactly what this forbids.
 *
 * It fails the build rather than warning, because a warning in a build log is a
 * thing nobody reads.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const OURS = { ref: 'npznoiotslruqovorrec', name: 'WurxMediaHub dev' };
const THEIRS = [
  { ref: 'bnevtdezskftlrjjgbsg', name: 'WurxBase' },
  { ref: 'pfkpgmpicjcirnogxkac', name: 'Paid Collaborations' },
];

const VENDOR = 'src/vendor/wurxbase';
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.json'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel']);

/** Forward slashes whatever the platform, without a single escape sequence. */
const posix = (p) => p.split(sep).join('/');

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, out);
    } else if (EXTS.some((x) => e.name.endsWith(x))) {
      out.push(p);
    }
  }
  return out;
}

const problems = [];

/* ---- 1. their code must not be able to reach ours ---------------------- */
for (const f of walk(VENDOR)) {
  const src = readFileSync(f, 'utf8');
  const rel = posix(f);

  if (src.includes(OURS.ref)) {
    problems.push(
      rel +
        ' names our own project (' + OURS.ref + ').' +
        '\n        The vendored app must only ever talk to its own databases. If it' +
        '\n        needs something of ours, pass it in as a prop from the route.'
    );
  }
  if (src.includes('@/lib/supabase') || src.includes('lib/supabase')) {
    problems.push(
      rel +
        ' imports OUR Supabase client.' +
        '\n        That would hand the vendored app a live connection to our database,' +
        '\n        which is the one thing this arrangement forbids.'
    );
  }
}

/* ---- 2. our code must not be able to reach theirs --------------------- */
for (const dir of ['src', 'scripts', 'supabase']) {
  for (const f of walk(dir)) {
    const rel = posix(f);
    if (rel.startsWith(VENDOR)) continue;                 // theirs, checked above
    if (rel.endsWith('scripts/check-isolation.mjs')) continue; // naming them is its job

    const src = readFileSync(f, 'utf8');
    for (const t of THEIRS) {
      if (src.includes(t.ref)) {
        problems.push(
          rel +
            ' names ' + t.name + "'s project (" + t.ref + ').' +
            '\n        Nothing of ours may hold a connection to their database. Their' +
            '\n        data is theirs, and a delete on our side must never reach it.'
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error('\nISOLATION BROKEN. ' + problems.length + ' problem(s):\n');
  for (const p of problems) console.error('  - ' + p + '\n');
  console.error(
    '  The two platforms run on separate Supabase projects on purpose, so that\n' +
      '  deleting data in one can never affect the other. See docs/OPERATIONS.md.\n'
  );
  process.exit(1);
}

console.log('  isolation ok: neither platform can reach the other database');
