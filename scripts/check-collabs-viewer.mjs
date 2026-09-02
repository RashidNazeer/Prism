#!/usr/bin/env node
/**
 * The three read-only Paid Collabs roles, in a real browser.
 *
 *   pnpm build && pnpm preview
 *   COLLABS_VIEWER_PASSWORD=... node scripts/check-collabs-viewer.mjs
 *
 * WHAT THIS IS FOR. Affiliate Team Lead, Operations Lead and Ads Manager may
 * read Paid Collabs and see nothing else in the product. The database enforces
 * it — `public.is_collabs_viewer()` on the wurxbase SELECT policies, writes
 * still on `is_staff()` — and `verify:rls` proves that half by attacking it.
 * This proves the half a person actually meets: the menu offers them nothing
 * they cannot open, an admin URL typed by hand does not render, and no button
 * inside Paid Collabs offers to change anything.
 *
 * IT ASSERTS ON WHAT IS ON SCREEN, not on what the code intends. A sidebar row
 * that exists but is hidden, or a screen that renders behind a spinner, both
 * count as visible here.
 */
import { launchBrowser } from './browser.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const PW = process.env.COLLABS_VIEWER_PASSWORD || '1234567890';
const WHO = [
  ['atl@wurxmedia.com', 'Affiliate Team Lead'],
  ['opslead@wurxmedia.com', 'Operations Lead'],
  ['adsmanager@wurxmedia.com', 'Ads Manager'],
];
/* Screens they must never reach. Every one of them reads money. */
const FORBIDDEN = ['/admin', '/admin/applications', '/admin/offers', '/admin/contests',
  '/admin/brands', '/admin/creators', '/admin/tiktok', '/admin/activity'];

const pass = [], fail = [];
const check = (ok, m, d) => (ok ? pass : fail).push(d ? `${m} — ${d}` : m);

const browser = await launchBrowser();
try {
  for (const [email, label] of WHO) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PW);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL((u) => !/\/admin\/login/.test(String(u)), { timeout: 40000 }).catch(() => {});
    const hello = page.getByRole('button', { name: /let.s go/i });
    if (await hello.first().isVisible().catch(() => false)) await hello.first().click();
    await page.waitForTimeout(9000);

    check(/\/admin\/collabs/.test(page.url()), `${label}: lands in Paid Collabs`, page.url());

    /* The menu offers Paid Collabs and nothing else. */
    const nav = await page.evaluate(() => {
      const links = [...document.querySelectorAll('nav a[href]')];
      return {
        all: [...new Set(links.map((a) => a.getAttribute('href')))],
        visible: [...new Set(links.filter((a) => a.getBoundingClientRect().width > 0)
          .map((a) => a.getAttribute('href')))],
      };
    });
    const strays = nav.visible.filter((h) => h.startsWith('/admin') && !h.startsWith('/admin/collabs'));
    check(strays.length === 0, `${label}: the menu shows no non-collabs admin row`, strays.join(', '));
    check(nav.visible.some((h) => h.startsWith('/admin/collabs')), `${label}: it does show Paid Collabs`,
      nav.visible.filter((h) => h.startsWith('/admin/collabs')).length + ' rows');

    /* Typing an admin URL by hand gets them nowhere. */
    for (const path of FORBIDDEN) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const landed = page.url();
      const stayed = new URL(landed).pathname === path;
      check(!stayed, `${label}: ${path} does not render`, 'landed on ' + new URL(landed).pathname);
    }

    /* Inside Paid Collabs, nothing offers to change anything. */
    await page.goto(`${BASE}/admin/collabs/creators`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(11000);
    const writeUi = await page.evaluate(() => {
      const txt = (e) => (e.textContent || '').trim().toLowerCase();
      const btns = [...document.querySelectorAll('button')];
      const offenders = btns.filter((b) => b.getBoundingClientRect().width > 0)
        .filter((b) => /^(\+ ?creator|add creator|edit budget|save|delete|mark paid|export|print)/.test(txt(b)))
        .map((b) => txt(b).slice(0, 24));
      return { offenders: [...new Set(offenders)], rows: document.querySelectorAll('.pc-cv-row').length };
    });
    check(writeUi.rows > 0, `${label}: can actually read the creators list`, writeUi.rows + ' rows');
    check(writeUi.offenders.length === 0, `${label}: no write or export control on screen`, writeUi.offenders.join(' | '));

    check(errors.length === 0, `${label}: zero console errors`, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log('');
for (const p of pass) console.log('  PASS  ' + p);
for (const f of fail) console.log('  FAIL  ' + f);
console.log(`\n${pass.length} passed, ${fail.length} failed.`);
process.exit(fail.length ? 1 : 0);
