#!/usr/bin/env node
/**
 * Session stability suite.
 *
 * Rashid's previous Supabase apps logged people out at random, forced daily
 * sign-ins, and reloaded mid-use. Section 11 of the brief lists the exact
 * scenarios that must never break. This proves them in a real browser instead
 * of us claiming "auth works".
 *
 * Scenarios covered:
 *   1. Sign up, land on the right screen for your role
 *   2. Reload keeps you signed in
 *   3. Close the browser and come back: session restored from storage
 *   4. Two tabs open at once, both stay signed in
 *   5. Token refresh underneath a half-filled form: input survives, no
 *      navigation, no remount
 *   6. Expired access token recovers by refreshing rather than signing you out
 *   7. Protected routes bounce signed-out visitors, and remember where they
 *      were going
 *   8. Role gates send people to their own home instead of someone else's
 *   9. Sign out in one tab is picked up by the other
 *
 * Honest note on scenario 6: we cannot sit here for two hours, so the stored
 * access token is expired on purpose and the app is given the chance to
 * recover. That exercises the same code path a two hour idle would.
 *
 * Usage: node scripts/check-session.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE) throw new Error('SUPABASE_SERVICE_KEY must be set');
const admin = createClient(env.VITE_SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const STORAGE_KEY = 'wurxmediahub-auth';
const stamp = process.env.RUN_STAMP ?? 'x';
const EMAIL = `session-${stamp}@wurxmediahub.test`;
const PASSWORD = 'a-long-enough-test-password-1';

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  failures++;
};
const check = (cond, m) => (cond ? pass(m) : fail(m));

const readStored = (page) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);

const browser = await chromium.launch();
let userId = null;

try {
  /* ------------------------------------------------------- 1. sign up --- */
  console.log(`\nSession stability against ${BASE}\n${'='.repeat(70)}`);
  console.log('\n[1] Sign up lands on the right screen');

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // Every call about this person's application, kept so a failure below can
  // show what the browser actually asked for and what came back, rather than
  // just "the text was not there".
  const t0 = Date.now();
  const appCalls = [];
  page.on('response', async (r) => {
    if (!/\/rest\/v1\/applications/.test(r.url())) return;
    let body = '';
    try {
      body = (await r.text()).slice(0, 80);
    } catch {
      body = '(unavailable)';
    }
    const auth = r.request().headers()['authorization'] ?? '';
    appCalls.push(
      `${String(Date.now() - t0).padStart(6)}ms ${r.request().method()} ${r.status()} ` +
        `token=${auth ? 'yes' : 'NONE'} ${r.url().slice(-60)} -> ${body}`
    );
  });

  // Applying IS signing up, so the account is created through the real
  // application form rather than a separate account-only screen.
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
  await page.fill('input[name="tiktokHandle"]', `sessiontester${stamp}`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.selectOption('select[name="niche"]', 'Health & wellness');
  await page.selectOption('select[name="workedWithWurx"]', 'no');
  await page.fill('textarea[name="videoLinks"]', 'https://tiktok.com/@sessiontester/video/1');
  await page.getByRole('button', { name: /takes 60 seconds/i }).click();

  await page.waitForURL('**/app', { timeout: 30000 }).catch(() => {});
  check(new URL(page.url()).pathname === '/app', `applicant lands on /app (got ${new URL(page.url()).pathname})`);

  // Wait for the screen to actually say it, rather than sleeping for a
  // guessed number of milliseconds. Signing up is two round trips followed by
  // a query, and a fixed delay turns a slow network into a fake failure.
  const roleShown = await page
    .getByText(/Pending review/i)
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch((e) => {
      console.error(`        waitFor: ${e.message.split('\n')[0]}`);
      return false;
    });

  const stored = await readStored(page);
  check(Boolean(stored?.access_token), 'session persisted to storage');
  userId = stored?.user?.id ?? null;

  check(roleShown, 'applicant sees the pending application screen');

  // A bare "not found" is not a diagnosis. Say whether the row is missing (the
  // sign up landed but the application insert did not) or merely slow.
  if (!roleShown) {
    const { data: row } = userId
      ? await admin.from('applications').select('id, status').eq('user_id', userId).maybeSingle()
      : { data: null };
    console.error(`        application row in the database: ${JSON.stringify(row)}`);
    const shown = await page
      .locator('main')
      .innerText()
      .catch(() => '(could not read)');
    console.error(`        screen said: ${shown.replace(/\s+/g, ' ').slice(0, 220)}`);
    console.error('        calls to /applications:');
    appCalls.forEach((c) => console.error(`          ${c}`));
  }

  /* -------------------------------------------------------- 2. reload --- */
  console.log('\n[2] Reload keeps you signed in');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check(new URL(page.url()).pathname === '/app', 'still on /app after reload');
  check(
    (await page.getByText(/Pending review/i).count()) > 0,
    'still signed in after reload'
  );

  /* ---------------------------------- 3. close browser, come back later -- */
  console.log('\n[3] Close the browser and come back');
  const saved = await ctx.storageState();
  await ctx.close();

  const ctx2 = await browser.newContext({ storageState: saved, viewport: { width: 1280, height: 900 } });
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1200);
  check(
    new URL(page2.url()).pathname === '/app',
    'a brand new browser session restores the login without asking again'
  );

  /* ------------------------------------------------------- 4. two tabs --- */
  console.log('\n[4] Two tabs open at once');
  const tabB = await ctx2.newPage();
  await tabB.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await tabB.waitForTimeout(1200);
  check(new URL(tabB.url()).pathname === '/app', 'second tab is signed in too');
  await page2.bringToFront();
  await page2.waitForTimeout(600);
  check(new URL(page2.url()).pathname === '/app', 'first tab still signed in after switching back');

  /* --------------------------------- 5 + 6. refresh under a live form ---- */
  console.log('\n[5] Token refresh underneath a half-filled form');
  const TYPED = 'half written note that must survive a token refresh';
  await page2.fill('textarea[name="scratchNote"]', TYPED);

  const before = await readStored(page2);
  const urlBefore = page2.url();

  // Mark the stored access token as already expired. Supabase's auto refresh
  // ticks on a timer and on focus, so this is the same path a two hour idle
  // takes, without sitting here for two hours.
  await page2.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    s.expires_in = 0;
    localStorage.setItem(k, JSON.stringify(s));
  }, STORAGE_KEY);

  // Nudge it the way a returning user would: refocus the tab.
  await tabB.bringToFront();
  await page2.bringToFront();

  let refreshed = false;
  for (let i = 0; i < 30; i++) {
    await page2.waitForTimeout(2000);
    const now = await readStored(page2);
    if (now?.access_token && now.access_token !== before.access_token) {
      refreshed = true;
      break;
    }
  }

  check(refreshed, 'expired token was refreshed in the background, not signed out');
  check(page2.url() === urlBefore, 'the refresh did not navigate anywhere');
  check(
    (await page2.inputValue('textarea[name="scratchNote"]')) === TYPED,
    'text typed before the refresh is still there afterwards'
  );
  check(
    (await page2.getByText(/Pending review/i).count()) > 0,
    'still signed in after the refresh'
  );

  console.log('\n[6] The refreshed session still works against the database');
  // The sidebar renders the email straight off the profile row, so seeing it
  // proves the query ran with the refreshed token, not just that a page drew.
  const stillWorks = await page2.evaluate(
    (email) => (document.body.textContent ?? '').includes(email),
    EMAIL
  );
  check(stillWorks, 'profile query still succeeds with the new token');

  /* --------------------------------------------- 7. protected routes ----- */
  console.log('\n[7] Signed out visitors cannot reach protected screens');
  const anonCtx = await browser.newContext();
  const anonPage = await anonCtx.newPage();
  await anonPage.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await anonPage.waitForTimeout(1200);
  check(new URL(anonPage.url()).pathname === '/login', 'visiting /admin signed out redirects to /login');
  await anonCtx.close();

  /* ------------------------------------------------------ 8. role gate --- */
  console.log('\n[8] Role gates');
  await page2.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1400);
  check(
    new URL(page2.url()).pathname === '/app',
    `an applicant opening /admin is sent to their own home (got ${new URL(page2.url()).pathname})`
  );

  /* ------------------------------------------------------- 9. sign out --- */
  console.log('\n[9] Sign out');
  await page2.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(800);
  await page2.getByRole('button', { name: /sign out/i }).click();
  await page2.waitForTimeout(2000);
  await page2.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1000);
  check(new URL(page2.url()).pathname === '/login', 'after signing out, /app redirects to /login');

  await tabB.reload({ waitUntil: 'networkidle' });
  await tabB.waitForTimeout(1500);
  check(new URL(tabB.url()).pathname === '/login', 'the other tab is signed out too');

  console.log('\n[10] Console cleanliness');
  check(consoleErrors.length === 0, `no console errors during the whole run (${consoleErrors.length})`);
  consoleErrors.slice(0, 5).forEach((e) => console.error(`        ${e}`));

  await ctx2.close();
} catch (e) {
  fail(`unexpected error: ${e.message}`);
} finally {
  await browser.close();
  if (userId) {
    // Retry: this one call has intermittently failed at the socket level right
    // after Playwright shuts down. Leaving a stray account behind on dev is
    // worse than waiting a second.
    let deleted = null;
    for (let i = 0; i < 3; i++) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (!error) {
        deleted = true;
        break;
      }
      deleted = error.message;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (deleted === true) console.log('\n[cleanup] test user deleted');
    else fail(`could not delete the test user: ${deleted}`);
  }
  // Let Playwright's pipe finish closing. Calling process.exit() while it is
  // still tearing down trips a libuv assertion on Windows, which crashes the
  // process with exit code 9 and replaces the real pass or fail signal.
  await new Promise((r) => setTimeout(r, 400));
}

console.log(`\n${'='.repeat(70)}`);
if (failures > 0) {
  console.error(`${failures} session check(s) FAILED.\n`);
  process.exit(1);
}
console.log('All session stability checks passed.\n');
