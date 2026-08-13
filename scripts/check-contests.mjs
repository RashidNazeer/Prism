#!/usr/bin/env node
/**
 * The contest suite.
 *
 * Drives the ADMIN SCREENS in a real browser: the Contests tab inside a brand,
 * and the setup screen that creates one. Then attacks the same data as a real
 * signed-in creator over the wire, because a screen looking right proves
 * nothing about who can read the money behind it.
 *
 * Makes its own throwaway accounts and removes them again, so it never touches
 * Rashid's admin. Run against dev only.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=... node scripts/check-contests.mjs [url]
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { launchBrowser } from './browser.mjs';

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

const URL = env.VITE_SUPABASE_URL;
const PUB = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
const ok = (name) => {
  pass += 1;
  console.log(`  PASS  ${name}`);
};
const bad = (name, detail) => {
  fail += 1;
  console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
};
const check = (name, cond, detail) => (cond ? ok(name) : bad(name, detail));

const STAMP = Date.now().toString(36);
const ADMIN_EMAIL = `contests-admin-${STAMP}@wurxmediahub.test`;
const CREATOR_EMAIL = `contests-creator-${STAMP}@wurxmediahub.test`;
const PW = 'Wx-contests-suite-2026!';
const CONTEST_NAME = `Suite contest ${STAMP}`;

const made = { users: [], contests: [] };

async function makeUser(email, role) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw error;
  made.users.push(data.user.id);
  const patch = role === 'creator' ? { role: 'creator', tier: 'creator' } : { role: 'admin' };
  const { error: pErr } = await admin.from('profiles').update(patch).eq('id', data.user.id);
  if (pErr) throw pErr;
  return data.user.id;
}

async function cleanup() {
  for (const id of made.contests) {
    await admin.from('audit_log').delete().eq('subject_id', id);
    await admin.from('contests').delete().eq('id', id);
  }
  await admin.from('contests').delete().like('name', 'Suite contest %');
  for (const id of made.users) await admin.auth.admin.deleteUser(id);
}

async function signIn(page, email) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/admin/login'), { timeout: 20_000 });
}

console.log(`\nContests suite against ${BASE}\n${'='.repeat(70)}\n`);

const browser = await launchBrowser();
const errors = [];

try {
  await makeUser(ADMIN_EMAIL, 'admin');
  await makeUser(CREATOR_EMAIL, 'creator');

  const { data: brand } = await admin
    .from('brands')
    .select('id, name')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!brand) throw new Error('No active brand on dev to hang a contest off');

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  // ------------------------------------------------------------- the tab --
  console.log('1. The Contests tab');
  await signIn(page, ADMIN_EMAIL);
  await page.goto(`${BASE}/admin/brands/${brand.id}?section=contests`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('text=New contest', { timeout: 20_000 });
  ok('the tab renders and offers a new contest');

  const bodyText = await page.textContent('body');
  check(
    'no id, slug or route is shown to an admin',
    !bodyText.includes(brand.id),
    'the brand uuid appears on screen'
  );

  // ------------------------------------------------------- creating one --
  console.log('\n2. Creating a contest through the screen');
  await page.click('text=New contest');
  await page.waitForURL(/\/contests\/new$/, { timeout: 20_000 });
  ok('the setup screen is its own route, not a dialog');

  // By label, not by an attribute. The first version of this suite found the
  // name box by maxlength and broke the moment that number was corrected.
  const nameBox = () => page.getByLabel('Name', { exact: true });
  await nameBox().fill(CONTEST_NAME);
  await page.fill('input[type="date"]', '2027-03-14');
  await page.fill('input[type="time"]', '23:59');

  const echo = await page.textContent('body');
  check(
    'the deadline is echoed as a creator will read it, with a zone',
    /14 Mar 2027, 11:59pm [A-Z]{2,5}/.test(echo),
    'no zone-named deadline echo found on the form'
  );

  await page.click('button[type="submit"]');
  await page.waitForURL(/\/contests\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  ok('saving lands on the saved contest');

  const { data: saved } = await admin
    .from('contests')
    .select('id, name, expires_at, expires_at_timezone, status, needs_admin_approval')
    .eq('name', CONTEST_NAME)
    .maybeSingle();
  check('the contest reached the database', Boolean(saved));
  if (saved) {
    made.contests.push(saved.id);
    check('its timezone was stored as an IANA name', /^[A-Za-z]+\/[A-Za-z_]+$|^UTC$/.test(saved.expires_at_timezone), saved.expires_at_timezone);
    check('a new contest is off until switched on', saved.status === 'inactive', saved.status);
  }

  // ------------------------------------------------------ what it refuses --
  console.log('\n3. What the screen refuses');
  await page.goto(`${BASE}/admin/brands/${brand.id}/contests/new`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByLabel('Name', { exact: true }).fill(`Suite contest ${STAMP} past`);
  await page.fill('input[type="date"]', '2020-01-01');
  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="alert"]', { timeout: 10_000 });
  const alertText = await page.textContent('[role="alert"]');
  check('a deadline in the past is refused', /passed/i.test(alertText), alertText);

  const { count: pastCount } = await admin
    .from('contests')
    .select('id', { count: 'exact', head: true })
    .eq('name', `Suite contest ${STAMP} past`);
  check('and nothing was written when it refused', (pastCount ?? 0) === 0);

  // --------------------------------------------------------- every width --
  console.log('\n4. Every width, both themes');
  for (const width of [375, 768, 1024, 1440]) {
    for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`${BASE}/admin/brands/${brand.id}?section=contests`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('text=New contest', { timeout: 20_000 });
      const scrolls = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      check(`tab has no sideways scroll at ${width}px ${theme}`, !scrolls);

      await page.goto(`${BASE}/admin/brands/${brand.id}/contests/new`, {
        waitUntil: 'domcontentloaded',
      });
      await page.getByLabel('Name', { exact: true }).waitFor({ timeout: 20_000 });
      const formScrolls = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      check(`setup has no sideways scroll at ${width}px ${theme}`, !formScrolls);
    }
  }

  // ------------------------------------------------------- tap targets ---
  console.log('\n5. Tap targets');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/admin/brands/${brand.id}?section=contests`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('text=New contest', { timeout: 20_000 });
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[href]')]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => (el.textContent ?? '').trim().slice(0, 30))
      .filter(Boolean)
  );
  check('every control is at least 44px tall on a phone', small.length === 0, small.join(' | '));

  // ------------------------------------------------- the money, on the wire --
  console.log('\n6. As a real creator, over the wire');
  const asCreator = createClient(URL, PUB, { auth: { persistSession: false } });
  const { error: sErr } = await asCreator.auth.signInWithPassword({
    email: CREATOR_EMAIL,
    password: PW,
  });
  check('the creator can sign in', !sErr, sErr?.message);

  const commercials = await asCreator.from('contest_commercials').select('total_budget');
  check(
    'a creator reads nothing from the budget table',
    (commercials.data ?? []).length === 0,
    JSON.stringify(commercials.data)
  );

  const asColumn = await asCreator.from('contests').select('id, total_budget');
  check('a budget is not a column they can even ask for', Boolean(asColumn.error));

  const exclusions = await asCreator.from('contest_exclusions').select('id');
  check('a creator reads nothing from the exclusion list', (exclusions.data ?? []).length === 0);

  const targets = await asCreator.from('contest_entry_targets').select('entry_id');
  check("a creator reads nobody else's private target", (targets.data ?? []).length === 0);

  const totals = await asCreator.from('contest_totals').select('contest_id');
  check('a creator reads nothing from the staff totals view', (totals.data ?? []).length === 0);

  const writeAttempt = await asCreator
    .from('contests')
    .insert({ brand_id: brand.id, name: 'creator made this' });
  check('a creator cannot insert a contest', Boolean(writeAttempt.error));

  const fnAttempt = await asCreator.functions.invoke('manage-contest', {
    body: { action: 'contest.delete', contestId: saved?.id ?? made.contests[0] },
  });
  check('a creator is refused by the edge function', Boolean(fnAttempt.error));

  await asCreator.auth.signOut();

  // ------------------------------------------------------------ console ---
  console.log('\n7. The console');
  check('zero console errors across every screen and width', errors.length === 0, errors.join('\n        '));
} catch (err) {
  bad('the suite itself threw', String(err));
} finally {
  await browser.close();
  await cleanup();
}

console.log(`\n${'='.repeat(70)}`);
console.log(`${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
