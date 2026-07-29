#!/usr/bin/env node
/**
 * End to end test of the admin review pipeline.
 *
 * This is the step where the product starts changing people's accounts, so the
 * suite is built around one idea: an error message is not proof. Every time
 * something is supposed to be blocked, the row is read back afterwards to
 * confirm nothing moved.
 *
 * It creates throwaway accounts, drives the real browser, attacks the API as a
 * signed-in applicant, then deletes everything it made. Run against DEV only.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... SUPABASE_SERVICE_KEY=...
 *   node scripts/check-review.mjs [baseUrl]
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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SERVICE) throw new Error('SUPABASE_SERVICE_KEY must be set');
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
}

const URL_BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });

const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-7);
const PASSWORD = 'a-long-enough-test-password-1';

const PEOPLE = [
  { key: 'known', handle: `wurxrev${stamp}known`, worked: true },
  { key: 'fresh', handle: `wurxrev${stamp}fresh`, worked: false },
];

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  failures++;
};
const check = (c, m) => (c ? pass(m) : fail(m));

const made = [];
const appIds = [];
const browser = await chromium.launch();

/** Sign in through the real login screen, the way a person would. */
async function signIn(ctx, email, password, expectPath, door = '/login') {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}${door}`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(`**${expectPath}`, { timeout: 25000 }).catch(() => {});
  return { page, errors };
}

/**
 * Poll until the database says what we are waiting for, or give up.
 *
 * Not a fixed sleep. A cold Edge Function has to boot Deno and pull its
 * dependencies on the first call after a deploy, which can take several
 * seconds, and a test that assumes a duration reports a product bug that is not
 * there. Waiting for the outcome is both faster in the normal case and honest
 * in the slow one.
 */
async function waitFor(read, ok, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    last = await read();
    if (ok(last)) return last;
    if (Date.now() > deadline) {
      fail(`timed out waiting for ${label} (last saw ${JSON.stringify(last)})`);
      return last;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

/** Fire a request from inside the browser, carrying that user's real token. */
const asUser = (page, path, init) =>
  page.evaluate(
    async ({ url, key, path, init }) => {
      const s = JSON.parse(localStorage.getItem('wurxmediahub-auth'));
      const res = await fetch(`${url}${path}`, {
        ...init,
        headers: {
          apikey: key,
          Authorization: `Bearer ${s.access_token}`,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
      return { status: res.status, body: (await res.text()).slice(0, 300) };
    },
    { url: URL_BASE, key: ANON, path, init: init ?? {} }
  );

try {
  console.log(`\nAdmin review pipeline against ${BASE}\n${'='.repeat(70)}`);

  /* ------------------------------------------------------------ [0] setup */
  console.log('\n[0] Seed two applicants');
  for (const p of PEOPLE) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `${p.handle}@wurxmediahub.test`,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: p.handle },
    });
    if (error) throw new Error(`could not create ${p.handle}: ${error.message}`);
    p.userId = data.user.id;
    made.push(data.user.id);

    const { data: app, error: appErr } = await admin
      .from('applications')
      .insert({
        user_id: p.userId,
        tiktok_handle: p.handle,
        niche: 'Beauty & skincare',
        worked_with_wurx: p.worked,
        video_links: `https://www.tiktok.com/@${p.handle}/video/7300000000000000000`,
      })
      .select('id')
      .single();
    if (appErr) throw new Error(`could not seed application: ${appErr.message}`);
    p.applicationId = app.id;
    appIds.push(app.id);
  }
  pass(`two applicants seeded (${PEOPLE.map((p) => p.handle).join(', ')})`);

  /* ------------------------------------------------- [1] the staff door -- */
  console.log('\n[1] The staff door');
  const doorCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const doorPage = await doorCtx.newPage();

  // A bookmarked admin link, opened signed out, should offer the staff screen
  // rather than a page inviting you to apply.
  await doorPage.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await doorPage.waitForTimeout(1500);
  check(
    new global.URL(doorPage.url()).pathname === '/admin/login',
    `signed out, /admin offers the staff door (got ${new global.URL(doorPage.url()).pathname})`
  );
  check(
    (await doorPage.getByText(/staff access/i).count()) > 0,
    'the staff screen says it is for staff'
  );
  check(
    (await doorPage.getByRole('link', { name: /apply|sign up|join/i }).count()) === 0,
    'it offers no way to sign up, because staff accounts are never self-serve'
  );
  await doorCtx.close();

  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const { page: adminPage, errors: adminErrors } = await signIn(
    adminCtx,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    '/admin',
    '/admin/login'
  );
  console.log('\n[1b] The admin queue');
  check(
    new global.URL(adminPage.url()).pathname === '/admin',
    `admin signs in at the staff door and lands on /admin (got ${new global.URL(adminPage.url()).pathname})`
  );

  const rowLink = (handle) => adminPage.locator(`a[href^="/admin/applications/"]`, { hasText: `@${handle}` });

  await adminPage.waitForSelector('a[href^="/admin/applications/"]', { timeout: 20000 });
  check(await rowLink(PEOPLE[0].handle).first().isVisible(), 'the seeded applicant appears in the queue');
  check(await rowLink(PEOPLE[1].handle).first().isVisible(), 'the second applicant appears too');

  /* ----------------------------------------------------------- [2] filters */
  console.log('\n[2] Filters and search');
  await adminPage.getByRole('button', { name: /worked with wurx/i }).click();
  await adminPage.waitForTimeout(1200);
  check(
    (await rowLink(PEOPLE[0].handle).count()) === 1 &&
      (await rowLink(PEOPLE[1].handle).count()) === 0,
    'the "worked with Wurx" filter narrows to people we already know'
  );
  await adminPage.getByRole('button', { name: /worked with wurx/i }).click();
  await adminPage.waitForTimeout(900);

  await adminPage.fill('input[name="search"]', PEOPLE[1].handle);
  await adminPage.press('input[name="search"]', 'Enter');
  await adminPage.waitForTimeout(1200);
  check(
    (await rowLink(PEOPLE[1].handle).count()) === 1 &&
      (await rowLink(PEOPLE[0].handle).count()) === 0,
    'search by handle finds exactly one'
  );
  check(
    adminPage.url().includes(`q=${PEOPLE[1].handle}`),
    'filters live in the URL, so the view is shareable'
  );

  /* ------------------------------- [3] the applicant is watching, live ---- */
  console.log('\n[3] The applicant sits on their dashboard while this happens');
  const applicantCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const { page: applicantPage, errors: applicantErrors } = await signIn(
    applicantCtx,
    `${PEOPLE[0].handle}@wurxmediahub.test`,
    PASSWORD,
    '/app'
  );
  await applicantPage.waitForTimeout(2000);
  check(
    (await applicantPage.getByText(/pending review/i).count()) > 0,
    'they currently see "pending review"'
  );

  /* ------------------------------------------------------- [4] approve --- */
  console.log('\n[4] Approve');
  await adminPage.goto(`${BASE}/admin/applications/${PEOPLE[0].applicationId}`, {
    waitUntil: 'networkidle',
  });
  await adminPage.waitForTimeout(1200);
  check(
    (await adminPage.getByRole('heading', { name: `@${PEOPLE[0].handle}` }).count()) > 0,
    'the detail screen shows the right application'
  );
  check(
    (await adminPage.getByText(/worked with wurx/i).count()) > 0,
    'it flags that Wurx has worked with them before'
  );

  await adminPage.selectOption('select[name="tier"]', 'pro');
  await adminPage.fill('textarea[name="note"]', 'Great skincare content, welcome in.');
  await adminPage.getByRole('button', { name: /^approve$/i }).click();
  await adminPage.waitForTimeout(400);
  check(
    (await adminPage.getByText(/their account becomes a creator immediately/i).count()) > 0,
    'a confirmation step stands between a click and a real account change'
  );
  await adminPage.getByRole('button', { name: /yes, approve/i }).click();

  const approved = await waitFor(
    async () =>
      (
        await admin
          .from('applications')
          .select('status, reviewed_by, reviewed_at, review_note')
          .eq('id', PEOPLE[0].applicationId)
          .single()
      ).data,
    (r) => r?.status === 'approved',
    'the approval to land'
  );
  check(approved?.status === 'approved', `application is approved (got ${approved?.status})`);
  check(Boolean(approved?.reviewed_by), 'the reviewer was recorded');
  check(Boolean(approved?.reviewed_at), 'the review time was recorded');
  check(
    approved?.review_note === 'Great skincare content, welcome in.',
    'the note was stored'
  );

  const { data: promoted } = await admin
    .from('profiles')
    .select('role, tier')
    .eq('id', PEOPLE[0].userId)
    .single();
  check(promoted?.role === 'creator', `they are now a creator (got ${promoted?.role})`);
  check(promoted?.tier === 'pro', `their tier is pro (got ${promoted?.tier})`);

  // No wait needed: the audit row is written inside the same transaction as the
  // two updates above, so if the status moved this row exists. That is the
  // whole point of doing it in one function rather than three REST calls.
  const { data: logRows } = await admin
    .from('audit_log')
    .select('action, actor_email, target_user_id, detail')
    .eq('subject_id', PEOPLE[0].applicationId);
  const approvalLog = (logRows ?? []).find((r) => r.action === 'application.approved');
  check(Boolean(approvalLog), 'an audit row was written');
  check(approvalLog?.actor_email === ADMIN_EMAIL, `the audit row names the admin (got ${approvalLog?.actor_email})`);
  check(approvalLog?.detail?.tier === 'pro', 'the audit row records the tier granted');

  /* ------------------------------------ [5] the applicant's screen moved -- */
  console.log('\n[5] The applicant sees it without touching anything');
  const sawIt = await applicantPage
    .getByText(/^approved$/i)
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(sawIt, 'their dashboard flipped to "Approved" with no refresh');
  check(
    (await applicantPage.getByText(/your dashboard/i).count()) > 0,
    'the page stopped calling them an applicant, without a new token'
  );
  check(
    (await applicantPage.getByText(/great skincare content/i).count()) > 0,
    'the reviewer note reached them'
  );

  /* ---------------------------------------------------------- [6] reject -- */
  console.log('\n[6] Reject');
  await adminPage.goto(`${BASE}/admin/applications/${PEOPLE[1].applicationId}`, {
    waitUntil: 'networkidle',
  });
  await adminPage.waitForTimeout(1000);
  await adminPage.getByRole('button', { name: /^reject$/i }).click();
  await adminPage.waitForTimeout(400);
  await adminPage.getByRole('button', { name: /yes, reject/i }).click();

  const rejected = await waitFor(
    async () =>
      (
        await admin
          .from('applications')
          .select('status')
          .eq('id', PEOPLE[1].applicationId)
          .single()
      ).data,
    (r) => r?.status === 'rejected',
    'the rejection to land'
  );
  check(rejected?.status === 'rejected', `application is rejected (got ${rejected?.status})`);

  const { data: stillApplicant } = await admin
    .from('profiles')
    .select('role, tier')
    .eq('id', PEOPLE[1].userId)
    .single();
  check(
    stillApplicant?.role === 'applicant' && stillApplicant?.tier === null,
    'a rejection does not touch their role or tier'
  );

  // Snapshot before the attacks: they deliberately provoke 4xx responses, which
  // the browser logs as console errors. Counting those would mean this suite
  // fails precisely because the security worked.
  const adminErrorsBefore = adminErrors.length;
  const applicantErrorsBefore = applicantErrors.length;

  /* --------------------------------------------------------- [7] attacks -- */
  console.log('\n[7] Attacks, run as a real signed-in applicant');
  const victim = PEOPLE[1];
  const { page: attackPage } = await signIn(
    await browser.newContext(),
    `${victim.handle}@wurxmediahub.test`,
    PASSWORD,
    '/app'
  );
  await attackPage.waitForTimeout(1500);

  // a. Call the Edge Function and approve yourself.
  const selfApprove = await asUser(attackPage, '/functions/v1/review-application', {
    method: 'POST',
    body: JSON.stringify({
      applicationId: victim.applicationId,
      decision: 'approved',
      tier: 'elite',
    }),
  });
  check(selfApprove.status === 403, `self-approval through the Edge Function refused (HTTP ${selfApprove.status})`);

  const { data: afterSelf } = await admin
    .from('profiles')
    .select('role, tier')
    .eq('id', victim.userId)
    .single();
  check(
    afterSelf?.role === 'applicant' && afterSelf?.tier === null,
    'and they really are still an applicant afterwards'
  );

  // b. That attempt should be in the log, with their name on it.
  const { data: denied } = await admin
    .from('audit_log')
    .select('action, actor_email')
    .eq('action', 'application.review_denied')
    .eq('actor_id', victim.userId);
  check((denied ?? []).length > 0, 'the blocked attempt was recorded in the audit log');

  // c. Read everyone else's applications.
  const readAll = await asUser(
    attackPage,
    '/rest/v1/applications?select=id,tiktok_handle,status'
  );
  let visible = [];
  try {
    visible = JSON.parse(readAll.body);
  } catch {
    visible = [];
  }
  check(
    Array.isArray(visible) && visible.length === 1 && visible[0]?.id === victim.applicationId,
    `an applicant sees only their own application (${Array.isArray(visible) ? visible.length : '?'} rows)`
  );

  // d. Read the audit log.
  const readLog = await asUser(attackPage, '/rest/v1/audit_log?select=id,action');
  let logVisible = [];
  try {
    logVisible = JSON.parse(readLog.body);
  } catch {
    logVisible = [];
  }
  check(
    Array.isArray(logVisible) && logVisible.length === 0,
    `the audit log is invisible to a non-staff account (${Array.isArray(logVisible) ? logVisible.length : '?'} rows)`
  );

  // e. Write to the audit log, to cover their tracks.
  const forgeLog = await asUser(attackPage, '/rest/v1/audit_log', {
    method: 'POST',
    body: JSON.stringify({ action: 'application.approved', subject_type: 'application' }),
  });
  check(forgeLog.status >= 400, `the audit log cannot be written from a browser (HTTP ${forgeLog.status})`);

  // f. Call the database function directly, skipping the Edge Function.
  const directRpc = await asUser(attackPage, '/rest/v1/rpc/review_application', {
    method: 'POST',
    body: JSON.stringify({
      p_application_id: victim.applicationId,
      p_decision: 'approved',
      p_actor_id: victim.userId,
      p_tier: 'elite',
    }),
  });
  check(
    directRpc.status >= 400,
    `the review function is not reachable with a user token (HTTP ${directRpc.status})`
  );

  // g. No token at all.
  const anonCall = await fetch(`${URL_BASE}/functions/v1/review-application`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationId: victim.applicationId, decision: 'approved', tier: 'elite' }),
  });
  check(anonCall.status === 401, `an anonymous call is rejected (HTTP ${anonCall.status})`);

  /* ------------------------------------------- [8] no double decisions ---- */
  console.log('\n[8] The same application cannot be decided twice');
  const again = await asUser(adminPage, '/functions/v1/review-application', {
    method: 'POST',
    body: JSON.stringify({
      applicationId: PEOPLE[0].applicationId,
      decision: 'rejected',
    }),
  });
  check(again.status === 409, `a second decision is refused (HTTP ${again.status})`);
  check(/already reviewed/i.test(again.body), 'and it says why, in plain English');

  const { data: unchanged } = await admin
    .from('applications')
    .select('status')
    .eq('id', PEOPLE[0].applicationId)
    .single();
  check(unchanged?.status === 'approved', 'the first decision stands');

  /* ----------------------------------------------- [9] a clean console ---- */
  console.log('\n[9] Console');
  check(adminErrorsBefore === 0, `no console errors on the admin path (${adminErrorsBefore})`);
  adminErrors.slice(0, adminErrorsBefore).forEach((e) => console.error(`        ${e}`));
  check(
    applicantErrorsBefore === 0,
    `no console errors on the applicant path (${applicantErrorsBefore})`
  );
  applicantErrors.slice(0, applicantErrorsBefore).forEach((e) => console.error(`        ${e}`));
} catch (e) {
  fail(`unexpected error: ${e.message}`);
  console.error(e.stack);
} finally {
  await browser.close();

  // Audit rows survive account deletion on purpose (the FK is ON DELETE SET
  // NULL), which is right in production and only noise on dev. These belong to
  // applications this script invented, so they go with it.
  if (appIds.length) {
    await admin.from('audit_log').delete().in('subject_id', appIds);
  }
  if (made.length) {
    await admin.from('audit_log').delete().in('actor_id', made);
    for (const id of made) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) fail(`could not delete a test account: ${error.message}`);
    }
    console.log('\n[cleanup] test accounts, applications and their audit rows deleted');
  }
}

console.log(`\n${'='.repeat(70)}`);
if (failures > 0) {
  console.error(`${failures} check(s) FAILED.\n`);
  process.exit(1);
}
console.log('The admin review pipeline works, and holds up under attack.\n');
