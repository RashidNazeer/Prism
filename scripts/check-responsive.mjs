#!/usr/bin/env node
/**
 * Responsiveness guard.
 *
 * Wurx targets US and UK TikTok Shop creators, who are mostly on phones and
 * tablets, while the team works on laptops and desktops. CLAUDE.md makes that a
 * standing rule; this makes it checkable instead of a promise.
 *
 * Every signed-in screen is opened at four widths and must:
 *   * not scroll the page sideways
 *   * keep its heading and primary content visible
 *   * put no element outside the viewport
 *   * log nothing to the console
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/check-responsive.mjs [baseUrl]
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4173';

// No service key and no .env.local needed: this suite only drives the browser
// and reads the layout back, so it can run against any deployed URL.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
}

const WIDTHS = [
  { name: 'iPhone SE', width: 375, height: 780 },
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad landscape', width: 1024, height: 800 },
  { name: 'Laptop', width: 1440, height: 900 },
];

const SCREENS = [
  { path: '/admin', name: 'Dashboard', expect: /welcome back/i },
  { path: '/admin/applications', name: 'Applications', expect: /^applications$/i },
  { path: '/admin/activity', name: 'Activity', expect: /^activity$/i },
  { path: '/admin/login', name: 'Staff sign in', expect: /staff access/i, anon: true },
  { path: '/login', name: 'Creator sign in', expect: /welcome back/i, anon: true },
];

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  failures++;
};
const check = (c, m) => (c ? pass(m) : fail(m));

const browser = await chromium.launch();

try {
  console.log(`\nResponsiveness against ${BASE}\n${'='.repeat(70)}`);

  // Sign in once at a wide size, then reuse the session at every width.
  const setup = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const setupPage = await setup.newPage();
  await setupPage.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await setupPage.fill('input[name="email"]', ADMIN_EMAIL);
  await setupPage.fill('input[name="password"]', ADMIN_PASSWORD);
  await setupPage.getByRole('button', { name: /^sign in$/i }).click();
  await setupPage.waitForURL('**/admin', { timeout: 25000 }).catch(() => {});
  const session = await setup.storageState();
  await setup.close();

  for (const size of WIDTHS) {
    console.log(`\n[${size.name}] ${size.width}x${size.height}`);

    for (const screen of SCREENS) {
      const ctx = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        ...(screen.anon ? {} : { storageState: session }),
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

      await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1800);

      // Scoped to <main> on purpose. The desktop rail is rendered at every
      // width and merely hidden by CSS below `lg`, so an unscoped search finds
      // the sidebar's "Applications" link, waits for something deliberately
      // invisible, and reports a layout bug that does not exist.
      const seen = await page
        .locator('main')
        .getByText(screen.expect)
        .first()
        .waitFor({ state: 'visible', timeout: 12000 })
        .then(() => true)
        .catch(() => false);

      // A page wider than its viewport is the classic mobile failure: the whole
      // layout slides sideways and half the controls sit off screen.
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
      }));

      // Find WHICH element is too wide, so a failure is actionable rather than
      // "something, somewhere, is 12px too big".
      const culprits =
        overflow.doc > overflow.win + 1
          ? await page.evaluate(() => {
              const bad = [];
              for (const el of document.querySelectorAll('body *')) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.right > window.innerWidth + 1) {
                  bad.push(
                    `${el.tagName.toLowerCase()}.${String(el.className || '').slice(0, 60)} right=${Math.round(r.right)}`
                  );
                }
                if (bad.length >= 3) break;
              }
              return bad;
            })
          : [];

      const label = `${screen.name} ${screen.path}`;
      check(seen, `${label}: content rendered`);
      check(
        overflow.doc <= overflow.win + 1,
        `${label}: no sideways scroll (page ${overflow.doc}px in ${overflow.win}px)`
      );
      culprits.forEach((c) => console.error(`        too wide: ${c}`));
      check(errors.length === 0, `${label}: clean console (${errors.length})`);
      errors.slice(0, 2).forEach((e) => console.error(`        ${e}`));

      await ctx.close();
    }
  }
  /* ------------------------------------------------------- modals ------- */
  // Screens are only half the story: a dialog is a separate layout that can be
  // taller than a phone. The review dialog once put its own heading above the
  // top of a short viewport with no way to scroll to it, and a page-level
  // check could never have seen that, because the PAGE was fine.
  const SHORT = [
    { name: 'iPhone SE, short', width: 375, height: 600 },
    { name: 'Phone landscape', width: 740, height: 360 },
  ];

  for (const size of SHORT) {
    console.log(`\n[${size.name}] ${size.width}x${size.height}, review dialog`);
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      storageState: session,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/applications?status=pending`, {
      waitUntil: 'networkidle',
    });
    // Wait for the list itself, not a guessed delay: an empty page and a
    // still-loading one look identical, and skipping quietly would hide the
    // very bug this section exists to catch.
    await page
      .waitForSelector('a[href^="/admin/applications/"]', { timeout: 15000 })
      .catch(() => {});

    const selectAll = page
      .getByRole('checkbox', { name: /select every pending application/i })
      .locator('visible=true');
    if ((await selectAll.count()) === 0) {
      console.log('        skipped: nothing pending to select');
      await ctx.close();
      continue;
    }

    await selectAll.first().check();
    await page.getByRole('button', { name: /^approve$/i }).first().click();
    await page.waitForTimeout(700);

    const dialog = page.getByRole('dialog');
    check((await dialog.count()) > 0, `${size.name}: the dialog opened`);

    // The heading must be inside the viewport, or reachable by scrolling the
    // dialog. Anything above y=0 with no scroll is lost for good.
    const heading = dialog.getByRole('heading').first();
    const reachable = await heading
      .evaluate((el) => {
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      })
      .catch(() => false);
    check(reachable, `${size.name}: the dialog heading can actually be seen`);

    const confirm = page.getByRole('button', { name: /^yes,/i }).first();
    const confirmReachable = await confirm
      .evaluate((el) => {
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      })
      .catch(() => false);
    check(confirmReachable, `${size.name}: the confirm button can be reached`);

    await ctx.close();
  }
} catch (e) {
  fail(`unexpected error: ${e.message}`);
} finally {
  await browser.close();
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\n${'='.repeat(70)}`);
if (failures > 0) {
  console.error(`${failures} responsiveness check(s) FAILED.\n`);
  process.exit(1);
}
console.log('Every screen holds up from phone to desktop.\n');
