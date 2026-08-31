#!/usr/bin/env node
/**
 * Every control in a creator row actually receives its own click.
 *
 *   pnpm build && pnpm preview
 *   SUPABASE_SERVICE_KEY=... COLLAB_STAFF_PASSWORD=... node scripts/check-collab-controls.mjs
 *
 * WHY THIS EXISTS. Three separate bug reports — "the status pill floats",
 * "clicking Payment Pending shows no dropdown", "the eye icon does nothing" —
 * turned out to be two defects that no existing check could see, because every
 * one of our guards asked whether an element EXISTS.
 *
 *   1. A starved grid track. A `.pc-cell` centres its content and does not
 *      clip, so a column narrower than what is in it SPILLS into its
 *      neighbours. The contract pencil is `position: relative` and the status
 *      pill is static, so the pencil painted on top and swallowed the click.
 *      Both elements were present, visible and correctly styled the whole time.
 *
 *   2. Ten overlays portalled to `document.body`, which is outside
 *      `.wurxbase-root`, so every fenced rule in their stylesheet missed them.
 *      The status menu mounted as an unstyled full-width block at the bottom of
 *      the document. It existed, it was in the DOM, and it was 1,008px below
 *      the fold.
 *
 * So this asserts on HIT TESTING and on POSITION, which is what "does nothing"
 * actually means. `elementFromPoint` at a control's centre must return that
 * control, and an opened overlay must be inside the viewport.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY must be set');
if (/prod/i.test(env.VITE_SUPABASE_URL || '')) throw new Error('.env.local points at production. Refusing.');
const PASSWORD = process.env.COLLAB_STAFF_PASSWORD;
if (!PASSWORD) throw new Error('COLLAB_STAFF_PASSWORD must be set');
const EMAIL = process.env.COLLAB_STAFF_EMAIL || 'asad@wurxmedia.com';

const pass = [];
const fail = [];
const check = (ok, msg, detail) => (ok ? pass : fail).push(detail ? `${msg} — ${detail}` : msg);

let browser;
try {
  browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !/\/admin\/login/.test(String(u)), { timeout: 30000 }).catch(() => {});
  const hello = page.getByRole('button', { name: /let.s go/i });
  if (await hello.first().isVisible().catch(() => false)) await hello.first().click();

  /* Never networkidle on a collabs route — see OPERATIONS. */
  await page.goto(`${BASE}/admin/collabs/brands`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pc-ava', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(12000);

  /* The portal host exists and sits where it must: inside the styling fence,
     outside the scrolling one. Everything below depends on it. */
  const host = await page.evaluate(() => {
    const h = document.getElementById('wurxbase-portal-host');
    if (!h) return null;
    return {
      inRoot: Boolean(h.closest('.wurxbase-root')),
      inFence: Boolean(h.closest('.wurxbase-fence')),
    };
  });
  check(Boolean(host), 'the portal host is on the page');
  check(host?.inRoot === true, 'it is INSIDE .wurxbase-root, so their CSS reaches it');
  check(host?.inFence === false, 'and OUTSIDE .wurxbase-fence, so fixed means the screen');

  /* Into a brand. */
  const brand = page.locator('.pc-ava').first();
  await brand.click();
  await page.waitForSelector('.pc-ct-row', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(9000);

  const rows = await page.locator('.pc-ct-row').count();
  check(rows > 0, 'the creator table rendered', `${rows} row(s)`);
  if (!rows) throw new Error('no creator rows — nothing below would mean anything');

  /*
   * EVERY CONTROL GETS ITS OWN CLICKS. Measured across the width of each
   * control, not just at the centre: the reported bug was a dead BAND down one
   * side of the pill, which a centre-only probe would have passed.
   */
  for (const width of [1500, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(1500);

    const report = await page.evaluate(() => {
      const row = document.querySelector('.pc-ct-row');
      if (!row) return null;
      const probe = (el, label) => {
        if (!el) return { label, present: false };
        const r = el.getBoundingClientRect();
        if (!r.width) return { label, present: true, zero: true };
        let mine = 0, total = 0;
        for (let x = r.left + 2; x < r.right - 2; x += 3) {
          total++;
          const hit = document.elementFromPoint(x, r.top + r.height / 2);
          if (hit && (hit === el || el.contains(hit))) mine++;
        }
        return { label, present: true, own: total ? Math.round((mine / total) * 100) : 0, w: Math.round(r.width) };
      };
      return [
        probe(row.querySelector('.pc-badge-btn'), 'status pill'),
        probe(row.querySelector('.pc-contract-btn'), 'contract pencil'),
        probe(row.querySelector('.pc-rowactions .pc-actbtn'), 'eye button'),
      ];
    });

    for (const c of report || []) {
      if (!c.present) { check(false, `${width}px: ${c.label} is missing`); continue; }
      check(
        c.own >= 92,
        `${width}px: the ${c.label} receives its own clicks`,
        `${c.own}% of its ${c.w}px width — the rest is a neighbour on top of it`,
      );
    }
  }

  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.waitForTimeout(1200);

  /* The status menu opens ON SCREEN and offers the option Asad needs. */
  await page.locator('.pc-ct-row .pc-badge-btn').first().click();
  await page.waitForTimeout(1200);
  const menu = await page.evaluate(() => {
    const m = document.querySelector('.pc-statusmenu');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const cs = getComputedStyle(m);
    return {
      position: cs.position,
      onScreen: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0,
      rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      options: [...m.querySelectorAll('.pc-statusopt')].map((b) => b.textContent.trim()),
      clickable: [...m.querySelectorAll('.pc-statusopt')].every((b) => {
        const br = b.getBoundingClientRect();
        const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
        return hit && (hit === b || b.contains(hit));
      }),
    };
  });
  check(Boolean(menu), 'the status menu opens');
  check(menu?.position === 'fixed', 'it is styled — their fenced CSS reaches it now', `position: ${menu?.position}`);
  check(menu?.onScreen === true, 'it opens ON SCREEN', menu?.rect);
  check(
    (menu?.options || []).some((o) => /payment sent/i.test(o)),
    'and offers "Payment Sent", which is how a creator gets marked paid',
    (menu?.options || []).join(' | '),
  );
  check(menu?.clickable === true, 'every option in it can actually be clicked');

  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(5, 5);
  await page.waitForTimeout(800);

  /* The eye opens its panel on screen rather than below the fold. */
  await page.locator('.pc-ct-row .pc-rowactions .pc-actbtn').first().click();
  await page.waitForTimeout(2500);
  const modal = await page.evaluate(() => {
    const m = document.querySelector('.pc-vx-modal, .pc-overlay');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { onScreen: r.top < window.innerHeight && r.bottom > 0 && r.width > 0, rect: `${Math.round(r.top)}..${Math.round(r.bottom)} of ${window.innerHeight}` };
  });
  check(Boolean(modal), 'the eye button opens its videos panel');
  check(modal?.onScreen === true, 'and it opens where you can see it', modal?.rect);

  check(errors.length === 0, 'zero console errors', errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: 'shots/collab-controls.png' });
} finally {
  if (browser) await browser.close();
}

console.log('');
for (const p of pass) console.log(`  PASS  ${p}`);
for (const f of fail) console.log(`  FAIL  ${f}`);
console.log(`\n${pass.length} passed, ${fail.length} failed.`);
process.exit(fail.length ? 1 : 0);
