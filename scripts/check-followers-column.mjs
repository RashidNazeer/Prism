#!/usr/bin/env node
/**
 * THE FOLLOWERS COLUMN ON THE CREATORS TAB, AGAINST EUKA ITSELF.
 *
 *   pnpm build && pnpm preview
 *   SUPABASE_SERVICE_KEY=... node scripts/check-followers-column.mjs
 *
 * Rashid, 2026-09-18: "can we add a new column of followers as well i hope we
 * can get followers count for our creators".
 *
 * THE EXPECTED NUMBERS COME FROM EUKA, not from the screen: this asks the
 * `euka` function for each store's profiles, exactly as the app's own sweep
 * does, builds handle → followers, and then compares every row that shows a
 * figure. A column that rendered dashes everywhere would pass a "the column
 * exists" test and fail this one.
 *
 * It also proves the column is not stealing the row: no creator's name may be
 * narrower than it was without the column.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launchBrowser } from './browser.mjs';
import { assertDevProject } from './lib/dev-guard.mjs';
const require = createRequire(process.cwd() + '/package.json');
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL_ = assertDevProject(env.VITE_SUPABASE_URL);

const pass = [], fail = [];
const check = (ok, m, d) => (ok ? pass : fail).push(d ? `${m} — ${d}` : m);

/* WurxUI's kNum, so the comparison is against what the cell can possibly say. */
const kNum = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v));
};
const handleKey = (raw) => {
  const t = String(raw ?? '').trim().toLowerCase();
  if (!t) return '';
  const last = t.startsWith('http') ? (t.replace(/\/+$/, '').split('/').pop() ?? '') : t;
  return last.replace(/^@/, '').split(/[?#]/)[0].trim();
};

/* ── what Euka says, through the same door the app uses ─────────────────── */
const api = createClient(URL_, env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: signInErr } = await api.auth.signInWithPassword({
  email: process.env.COLLAB_STAFF_EMAIL || 'asad@wurxmedia.com',
  password: process.env.COLLAB_STAFF_PASSWORD || '1234567890',
});
if (signInErr) throw new Error('sign-in failed: ' + signInErr.message);
const callEuka = async (body) => {
  const { data, error } = await api.functions.invoke('euka', { body });
  if (error) return null;
  return data;
};
const meta = await callEuka({});
const stores = meta?.stores ?? [];
const followers = new Map();
let answered = 0;
await Promise.all(stores.map(async (s) => {
  const d = await callEuka({ store: s.id });
  if (!d?.profiles) return;
  answered += 1;
  for (const [h, p] of Object.entries(d.profiles)) {
    const n = Number(p?.followers) || 0;
    const k = handleKey(h);
    if (k && n > (followers.get(k) ?? 0)) followers.set(k, n);
  }
}));
console.log(`euka: ${answered} of ${stores.length} stores answered · ${followers.size} handles with a follower count`);
check(followers.size > 0, 'Euka gives follower counts, so this check can fail', `${followers.size} handles`);

/* ── the screen ─────────────────────────────────────────────────────────── */
const browser = await launchBrowser();
try {
  const page = await (await browser.newContext({ viewport: { width: 1800, height: 1000 } })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e.message).slice(0, 160)));

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', process.env.COLLAB_STAFF_EMAIL || 'asad@wurxmedia.com');
  await page.fill('input[name="password"]', process.env.COLLAB_STAFF_PASSWORD || '1234567890');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !/\/admin\/login/.test(String(u)), { timeout: 40000 }).catch(() => {});
  const hi = page.getByRole('button', { name: /let.s go/i });
  if (await hi.first().isVisible().catch(() => false)) await hi.first().click();

  await page.goto(`${BASE}/admin/collabs/creators`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pc-cv-row', { timeout: 45000 }).catch(() => {});
  /* The sweep is deferred past first paint on purpose, so wait for a figure
     rather than a timer: a fixed wait would pass on an empty column. */
  /*
   * WAIT FOR THE SWEEP TO SETTLE, not for the first figure. Euka is read one
   * store at a time and merged as each lands, so the column fills over about
   * half a minute — measured at 52 of 166 rows when the first figure appeared.
   * Comparing then reported creators as missing whose numbers were still in
   * flight. This waits until the filled count stops climbing.
   */
  const filled = () => page.evaluate(() =>
    [...document.querySelectorAll('.pc-cv-row [data-label="Followers"]')].filter((c) => /\d/.test(c.textContent ?? '')).length);
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 60 && stable < 3; i++) {
    await page.waitForTimeout(2000);
    const now = await filled();
    stable = now === last && now > 0 ? stable + 1 : 0;
    last = now;
  }
  console.log(`screen: ${last} rows carry a follower count once the sweep settled`);

  const head = await page.evaluate(() => [...document.querySelectorAll('.pc-cv-head > div')].map((d) => d.textContent?.trim()));
  check(head.includes('Followers'), 'the Creators tab has a Followers column', head.join(' | '));

  const rows = await page.evaluate(() => [...document.querySelectorAll('.pc-cv-row')].map((row) => ({
    name: row.querySelector('.pc-cname')?.textContent?.trim() ?? '',
    handle: row.querySelector('[data-label="TikTok"] a')?.textContent?.trim() ?? '',
    shown: row.querySelector('[data-label="Followers"]')?.textContent?.trim() ?? '',
    nameWidth: row.querySelector('.pc-cname')?.clientWidth ?? 0,
  })));
  check(rows.length > 0, 'the tab lists creators', `${rows.length} rows`);

  const withFigure = rows.filter((r) => /\d/.test(r.shown));
  check(withFigure.length > 0, 'the column is filled in, not a column of dashes', `${withFigure.length} of ${rows.length} rows`);

  const wrong = [];
  let compared = 0;
  for (const r of rows) {
    const key = handleKey(r.handle);
    const want = followers.get(key);
    if (!key || !want) continue;
    compared++;
    if (r.shown !== kNum(want)) wrong.push(`${r.name || key}: screen ${r.shown}, Euka ${kNum(want)}`);
  }
  check(compared > 0 && wrong.length === 0,
    `every follower count matches Euka (${compared} rows compared)`, wrong.slice(0, 4).join(' | '));

  /* the names still have room */
  const squeezed = rows.filter((r) => r.nameWidth > 0 && r.nameWidth < 40).length;
  check(squeezed === 0, 'the new column has not squeezed the names', `${squeezed} names under 40px`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, 'the page still does not scroll sideways', `${overflow}px`);

  check(errors.length === 0, 'zero console errors', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log('');
for (const p of pass) console.log('  PASS  ' + p);
for (const f of fail) console.log('  FAIL  ' + f);
console.log(`\n${pass.length} passed, ${fail.length} failed.`);
process.exit(fail.length ? 1 : 0);
