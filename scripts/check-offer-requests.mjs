#!/usr/bin/env node
/**
 * End to end test of creators asking for offers, and staff deciding.
 *
 * This is the first thing in the product a CREATOR can write, so most of this
 * suite is spent trying to make that write do something it should not: aim it
 * at somebody else's row, decide their own request, take an offer that was
 * never open, or ask twice.
 *
 * It drives the real browser on both sides, checks the database between steps,
 * and cleans up after itself. Run against DEV only.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... SUPABASE_SERVICE_KEY=...
 *   node scripts/check-offer-requests.mjs [baseUrl]
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
const BRAND_NAME = `Wurx Ask Brand ${stamp}`;
const STORE_ID = `ask-store-${stamp}`;
const HANDLE = `askcreator${stamp}`;
const CREATOR_EMAIL = `ask-${stamp}@wurxmediahub.test`;
const RIVAL_EMAIL = `rival-${stamp}@wurxmediahub.test`;
const PASSWORD = 'a-long-enough-test-password-1';

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  failures++;
};
const check = (c, m) => (c ? pass(m) : fail(m));

const made = [];
let brandId = null;
const browser = await chromium.launch();

/** Poll until the database says what we are waiting for, or give up. */
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

/**
 * Fire a request from inside the browser, carrying that user's real token.
 *
 * `json` is parsed from the WHOLE response, `body` is trimmed for readable
 * failure messages. Parsing the trimmed copy turns any long list into "0 rows",
 * which reads exactly like row level security refusing the request.
 */
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
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: res.status, body: text.slice(0, 300), json };
    },
    { url: URL_BASE, key: ANON, path, init: init ?? {} }
  );

const rows = (r) => (Array.isArray(r?.json) ? r.json : []);

/** Sign somebody in and land them in the app. */
async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('**/app', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  // Every real creator meets the welcome once, so every suite has to walk
  // through it before it can see the screen underneath.
  const hello = page.getByRole('button', { name: /let.s go/i });
  if (
    await hello
      .first()
      .waitFor({ state: 'visible', timeout: 6000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await hello.first().click();
    await page.waitForTimeout(1200);
  }
}

/** Make an approved creator, with a handle so the queue has something to find. */
async function makeCreator(email, handle) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: handle },
  });
  if (error) throw new Error(`could not create ${email}: ${error.message}`);
  made.push(data.user.id);

  await admin
    .from('profiles')
    .update({
      role: 'creator',
      tier: 'pro',
      // Settle the one-time moments that are not what this suite is about.
      welcomed_at: new Date().toISOString(),
      approval_celebrated_at: new Date().toISOString(),
    })
    .eq('id', data.user.id);

  // The handle lives on the application, not the profile, and `apply_for_offer`
  // snapshots it onto the request. Without this the admin queue has nothing to
  // search by, so a failure here has to be loud rather than silent.
  const { error: appErr } = await admin.from('applications').insert({
    user_id: data.user.id,
    tiktok_handle: handle,
    niche: 'beauty',
    worked_with_wurx: false,
    video_links: 'https://www.tiktok.com/@example/video/1234567890',
    status: 'approved',
  });
  if (appErr) throw new Error(`could not seed an application: ${appErr.message}`);

  return data.user.id;
}

try {
  console.log(`\nOffer requests against ${BASE}\n${'='.repeat(70)}`);

  /* ------------------------------------------------------- [0] the setup -- */
  console.log('\n[0] A brand with three kinds of offer');

  const { data: staff } = await admin
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'ops'])
    .eq('is_active', true)
    .limit(1)
    .single();

  const { data: brand, error: brandErr } = await admin.rpc('save_brand', {
    p_actor_id: staff.id,
    p_name: BRAND_NAME,
    p_store_id: STORE_ID,
    p_brand_id: null,
    p_client_name: 'Ask Client Ltd',
    p_budget: 41000,
    p_currency: 'USD',
    p_is_active: true,
  });
  if (brandErr || !brand) throw new Error(`could not create the brand: ${brandErr?.message}`);
  brandId = brand.id;
  check(Boolean(brandId), 'the brand exists');

  const makeOffer = async (title, videos, reward, needsApplication) => {
    const { data, error } = await admin.rpc('save_offer', {
      p_actor_id: staff.id,
      p_brand_id: brandId,
      p_title: title,
      p_video_count: videos,
      p_reward_amount: reward,
      p_description: 'Something to make.',
      p_currency: 'USD',
      p_status: 'active',
      p_needs_application: needsApplication,
    });
    if (error) throw new Error(`could not create "${title}": ${error.message}`);
    return data;
  };

  const fixed = await makeOffer('Fixed terms deal', 5, 300, true);
  const openEnded = await makeOffer('Name your price', null, null, true);
  const takeIt = await makeOffer('Already yours', 1, 60, false);
  check(
    Boolean(fixed?.id && openEnded?.id && takeIt?.id),
    'three offers: fixed terms, open ended, and one nobody has to ask for'
  );

  const creatorId = await makeCreator(CREATOR_EMAIL, HANDLE);
  const rivalId = await makeCreator(RIVAL_EMAIL, `rival${stamp}`);
  check(Boolean(creatorId && rivalId), 'two approved creators exist');

  /* -------------------------------------------------- [1] the creator's view */
  console.log('\n[1] What a creator sees before asking');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) {
      consoleErrors.push(m.text());
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await signIn(page, CREATOR_EMAIL);
  await page.goto(`${BASE}/app/brands/${brand.slug}?section=offers`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3000);

  check(
    (await page.getByText('Fixed terms deal').count()) > 0,
    'the offers are on screen'
  );
  check(
    (await page.getByText(/already on this one/i).count()) > 0,
    'an offer nobody has to apply for says it is already theirs'
  );
  check(
    (await page.getByText(/no fixed deliverable or fee/i).count()) === 0,
    'and the old "no fixed deliverable" line is gone for good'
  );

  // The header used to be a tall card with the name set large, pushing the
  // actual content off the first screen.
  const headerBottom = await page
    .getByRole('tablist', { name: /brand hub sections/i })
    .evaluate((el) => el.getBoundingClientRect().bottom);
  check(
    headerBottom < 220,
    `the tabs start high on the page, not below a hero (${Math.round(headerBottom)}px)`
  );

  /* ------------------------------------------------ [2] taking it as offered */
  console.log('\n[2] Taking an offer as it is written');
  // Named by its card, never "the first Apply on the page". Cards are newest
  // first, so an unscoped click applies for whichever offer was created last.
  const offerCard = (title) => page.locator('li').filter({ hasText: title });

  await offerCard('Fixed terms deal')
    .getByRole('button', { name: /apply for this/i })
    .first()
    .click();
  await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 20000 });

  check(
    (await page.getByRole('radio', { name: /take it as offered/i }).count()) > 0,
    'the dialog offers both taking it and countering it'
  );
  await page.getByRole('button', { name: /^send request$/i }).click();

  const asOffered = await waitFor(
    async () =>
      (
        await admin
          .from('offer_applications')
          .select('id, status, proposed_video_count, proposed_amount, creator_handle')
          .eq('offer_id', fixed.id)
          .eq('creator_id', creatorId)
          .maybeSingle()
      ).data,
    (r) => Boolean(r?.id),
    'the request to be stored'
  );
  check(asOffered?.status === 'pending', 'it lands as pending');
  check(
    asOffered?.proposed_video_count === null && asOffered?.proposed_amount === null,
    'taking it as offered stores no counter terms, rather than copying theirs'
  );
  check(
    asOffered?.creator_handle === HANDLE,
    `the handle is snapshotted onto the row (got ${asOffered?.creator_handle})`
  );
  const withTeam = await page
    .getByText(/with the team/i)
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(withTeam, 'and the card says it is with the team');

  /* ----------------------------------------------------- [3] naming a price */
  console.log('\n[3] Countering with their own terms');
  await offerCard('Name your price')
    .getByRole('button', { name: /apply for this/i })
    .first()
    .click();
  await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 20000 });

  // An offer with no set terms has nothing to accept, so there is no choice to
  // make and the numbers are compulsory.
  check(
    (await page.getByRole('radio', { name: /take it as offered/i }).count()) === 0,
    'an offer with no set terms does not offer to be taken as written'
  );
  await page.getByRole('button', { name: /^send request$/i }).click();
  await page.waitForTimeout(800);
  const demanded = await page.locator('[role="alert"]').allInnerTexts();
  check(
    demanded.some((t) => /how many videos/i.test(t)),
    `it demands the videos and the price (${demanded.join(' | ') || 'none'})`
  );

  await page.fill('input[name="videoCount"]', '8');
  await page.fill('input[name="amount"]', '640');
  await page.fill('textarea[name="note"]', 'I already use this every day.');
  await page.getByRole('button', { name: /^send request$/i }).click();

  const counter = await waitFor(
    async () =>
      (
        await admin
          .from('offer_applications')
          .select('id, proposed_video_count, proposed_amount, note, currency')
          .eq('offer_id', openEnded.id)
          .eq('creator_id', creatorId)
          .maybeSingle()
      ).data,
    (r) => Boolean(r?.id),
    'the counter offer to be stored'
  );
  check(counter?.proposed_video_count === 8, `videos stored (${counter?.proposed_video_count})`);
  check(
    Number(counter?.proposed_amount) === 640,
    `their price stored exactly (${counter?.proposed_amount})`
  );
  check(counter?.note?.startsWith('I already use'), 'and the note they wrote');

  /* --------------------------------------------------------- [4] the attacks */
  console.log('\n[4] Attacks, run as a real signed-in creator');

  // a. Write the row by hand.
  const insertDirect = await asUser(page, '/rest/v1/offer_applications', {
    method: 'POST',
    body: JSON.stringify({
      offer_id: fixed.id,
      brand_id: brandId,
      creator_id: creatorId,
      status: 'approved',
    }),
  });
  check(insertDirect.status >= 400, `inserting a request by hand is refused (HTTP ${insertDirect.status})`);

  // b. Approve their own.
  const selfApprove = await asUser(
    page,
    `/rest/v1/offer_applications?id=eq.${asOffered.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }
  );
  const { data: stillPending } = await admin
    .from('offer_applications')
    .select('status')
    .eq('id', asOffered.id)
    .single();
  check(
    selfApprove.status >= 400 || stillPending?.status === 'pending',
    `cannot approve their own request (HTTP ${selfApprove.status}, still ${stillPending?.status})`
  );

  // c. Approve their own through the front door.
  const viaFunction = await asUser(page, '/functions/v1/manage-offer-application', {
    method: 'POST',
    body: JSON.stringify({
      action: 'application.review',
      applicationId: asOffered.id,
      decision: 'approved',
    }),
  });
  check(
    viaFunction.status === 403,
    `and the Edge Function refuses a creator reviewing (HTTP ${viaFunction.status})`
  );
  const { data: denied } = await admin
    .from('audit_log')
    .select('action')
    .eq('action', 'offer_application.write_denied')
    .eq('actor_id', creatorId);
  check((denied ?? []).length > 0, 'the attempt is recorded with their name on it');

  // d. Ask twice.
  const twice = await asUser(page, '/functions/v1/manage-offer-application', {
    method: 'POST',
    body: JSON.stringify({ action: 'application.create', offerId: fixed.id }),
  });
  check(
    twice.status === 409,
    `asking for the same offer twice is refused (HTTP ${twice.status})`
  );

  // e. Ask for an offer that never needed asking.
  const pointless = await asUser(page, '/functions/v1/manage-offer-application', {
    method: 'POST',
    body: JSON.stringify({ action: 'application.create', offerId: takeIt.id }),
  });
  check(
    pointless.status === 400 && /already yours/i.test(pointless.body),
    `applying for an open offer is refused, in plain English (HTTP ${pointless.status})`
  );

  // f. Half a counter offer.
  const halfCounter = await asUser(page, '/functions/v1/manage-offer-application', {
    method: 'POST',
    body: JSON.stringify({
      action: 'application.create',
      offerId: takeIt.id,
      videoCount: 3,
    }),
  });
  check(
    halfCounter.status === 400 && /both/i.test(halfCounter.body),
    `naming videos without a price is refused (HTTP ${halfCounter.status})`
  );

  // g. Read somebody else's request.
  const rivalCtx = await browser.newContext();
  const rivalPage = await rivalCtx.newPage();
  await signIn(rivalPage, RIVAL_EMAIL);
  await admin.rpc('apply_for_offer', {
    p_actor_id: rivalId,
    p_offer_id: fixed.id,
    p_note: 'mine',
  });
  const spying = await asUser(rivalPage, '/rest/v1/offer_applications?select=id,creator_id');
  check(
    rows(spying).length > 0 && rows(spying).every((r) => r.creator_id === rivalId),
    `a creator sees only their own requests (${rows(spying).length} rows, all theirs: ${rows(spying).every((r) => r.creator_id === rivalId)})`
  );

  // h. Withdraw somebody else's.
  const stealWithdraw = await asUser(rivalPage, '/functions/v1/manage-offer-application', {
    method: 'POST',
    body: JSON.stringify({
      action: 'application.withdraw',
      applicationId: asOffered.id,
    }),
  });
  check(
    stealWithdraw.status === 404,
    `and cannot withdraw somebody else's (HTTP ${stealWithdraw.status})`
  );
  await rivalCtx.close();

  /* --------------------------------------------------------- [5] the queue */
  console.log('\n[5] The admin queue');
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const adminPage = await adminCtx.newPage();
  adminPage.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) {
      consoleErrors.push(`admin: ${m.text()}`);
    }
  });
  adminPage.on('pageerror', (e) => consoleErrors.push(`admin pageerror: ${e.message}`));

  await adminPage.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await adminPage.fill('input[name="email"]', ADMIN_EMAIL);
  await adminPage.fill('input[name="password"]', ADMIN_PASSWORD);
  await adminPage.getByRole('button', { name: /^sign in$/i }).click();
  await adminPage.waitForURL('**/admin', { timeout: 30000 }).catch(() => {});

  await adminPage.goto(`${BASE}/admin/offers`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForTimeout(3000);

  check(
    (await adminPage.getByText(`@${HANDLE}`).count()) > 0,
    'the request is in the queue, under the creator handle'
  );
  check(
    (await adminPage.getByText(/8 videos for \$640/i).count()) > 0,
    'and the counter offer is spelled out as numbers, not buried in a note'
  );

  // Search narrows to one creator.
  await adminPage.fill('input[name="search"]', HANDLE);
  await adminPage.press('input[name="search"]', 'Enter');
  await adminPage.waitForTimeout(2000);
  check(
    (await adminPage.getByText(`@rival${stamp}`).count()) === 0,
    'searching by handle drops everyone else'
  );
  await adminPage.fill('input[name="search"]', '');
  await adminPage.press('input[name="search"]', 'Enter');
  await adminPage.waitForTimeout(1500);

  // Brand filter.
  await adminPage.selectOption('select[name="brand"]', { label: BRAND_NAME });
  await adminPage.waitForTimeout(2000);
  check(
    (await adminPage.getByText(`@${HANDLE}`).count()) > 0,
    'filtering by brand keeps this brand'
  );

  /* ------------------------------------------------------ [6] the decision */
  console.log('\n[6] Approving, and the creator being told');
  // Bring the creator's screen back to the offers tab and leave it there, so
  // the decision has to arrive on its own.
  await page.goto(`${BASE}/app/brands/${brand.slug}?section=offers`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2500);

  /*
   * Scoped to the row, not "the first Approve button on the page".
   *
   * The queue is newest first and this suite deliberately creates several
   * requests, so an unscoped click decides whichever one happens to sort first
   * and then reports that the one being watched never changed. It cost half an
   * hour once already.
   */
  const rowFor = (title) =>
    adminPage
      .locator('li')
      .filter({ hasText: title })
      // Both creators asked for the fixed terms offer, so the title alone is
      // not enough to name a single row.
      .filter({ hasText: `@${HANDLE}` });

  await rowFor('Fixed terms deal')
    .getByRole('button', { name: /^approve$/i })
    .first()
    .click();
  await adminPage.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 20000 });
  check(
    (await adminPage.getByText(/taking it exactly as offered|they are asking for/i).count()) > 0,
    'the dialog restates the terms being agreed to'
  );
  await adminPage.fill('textarea[name="note"]', 'Happy with that.');
  await adminPage.getByRole('button', { name: /yes, approve/i }).click();

  const approved = await waitFor(
    async () =>
      (
        await admin
          .from('offer_applications')
          .select('status, decided_by, decided_at, decision_note')
          .eq('id', asOffered.id)
          .single()
      ).data,
    (r) => r?.status === 'approved',
    'the approval to land'
  );
  check(approved?.status === 'approved', 'the request is approved');
  check(Boolean(approved?.decided_by && approved?.decided_at), 'with who decided it and when');
  check(approved?.decision_note === 'Happy with that.', 'and what they said');

  const { data: approvalLog } = await admin
    .from('audit_log')
    .select('action, target_user_id')
    .eq('subject_id', asOffered.id)
    .eq('action', 'offer_application.approved');
  check((approvalLog ?? []).length === 1, 'the decision is audited');
  check(
    approvalLog?.[0]?.target_user_id === creatorId,
    'against the creator it was about, not just the admin who made it'
  );

  // The creator was never told to refresh.
  const toldLive = await page
    .getByText(/you are in/i)
    .first()
    .waitFor({ state: 'visible', timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  check(toldLive, 'and it reaches the creator without a reload');

  // Deciding twice is refused, whichever admin gets there second.
  const again = await asUser(adminPage, '/functions/v1/manage-offer-application', {
    method: 'POST',
    body: JSON.stringify({
      action: 'application.review',
      applicationId: asOffered.id,
      decision: 'rejected',
    }),
  });
  check(again.status === 409, `a second decision on the same request is refused (HTTP ${again.status})`);

  /* ------------------------------------------------------ [7] the refusal */
  console.log('\n[7] Rejecting, and asking again');
  await adminPage.reload({ waitUntil: 'domcontentloaded' });
  await adminPage.waitForTimeout(2500);
  await rowFor('Name your price')
    .getByRole('button', { name: /^reject$/i })
    .first()
    .click();
  await adminPage.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 20000 });
  await adminPage.fill('textarea[name="note"]', 'Not at that price for now.');
  await adminPage.getByRole('button', { name: /yes, reject/i }).click();

  const rejected = await waitFor(
    async () =>
      (
        await admin
          .from('offer_applications')
          .select('id, status, decision_note')
          .eq('creator_id', creatorId)
          .eq('status', 'rejected')
          .maybeSingle()
      ).data,
    (r) => Boolean(r?.id),
    'the rejection to land'
  );
  check(Boolean(rejected), 'the other request is rejected');

  // A rejection is not a ban. The partial unique index only covers pending and
  // approved rows, so they can come back with a different number.
  const reapply = await admin.rpc('apply_for_offer', {
    p_actor_id: creatorId,
    p_offer_id: openEnded.id,
    p_video_count: 4,
    p_amount: 260,
  });
  check(!reapply.error, `a rejected creator can ask again (${reapply.error?.message ?? 'ok'})`);

  /* -------------------------------------------- [8] offers people rely on */
  console.log('\n[8] An offer somebody is waiting on');
  const blocked = await admin.rpc('delete_offer', {
    p_actor_id: staff.id,
    p_offer_id: fixed.id,
  });
  check(
    Boolean(blocked.error) && /waiting on this offer/i.test(blocked.error?.message ?? ''),
    `deleting an offer with a live request is refused (${blocked.error?.message ?? 'it was allowed'})`
  );

  /* -------------------------------------------------------- [9] console -- */
  console.log('\n[9] Console');
  // This suite provokes refusals on purpose: a creator reviewing, a duplicate
  // request, an offer that needed no application. The browser logs each as a
  // failed request, and counting them would mean failing because the security
  // worked.
  const expected = /Failed to load resource.*(400|401|403|404|409)/i;
  const real = consoleErrors.filter((e) => !expected.test(e));
  check(real.length === 0, `no unexpected console errors (${real.length})`);
  real.slice(0, 3).forEach((e) => console.error(`        ${e}`));
  console.log(
    `        (${consoleErrors.length - real.length} deliberate refusals logged by the browser, ignored)`
  );

  await adminCtx.close();
  await ctx.close();
} catch (e) {
  fail(`unexpected error: ${e.message}`);
  console.error(e.stack);
} finally {
  await browser.close();

  if (brandId) {
    const { data: offerIds } = await admin.from('offers').select('id').eq('brand_id', brandId);
    const { data: requestIds } = await admin
      .from('offer_applications')
      .select('id')
      .eq('brand_id', brandId);
    for (const r of requestIds ?? []) {
      await admin.from('audit_log').delete().eq('subject_id', r.id);
    }
    // Requests cascade with the offer, but the audit rows above do not.
    await admin.from('offer_applications').delete().eq('brand_id', brandId);
    for (const o of offerIds ?? []) {
      await admin.from('audit_log').delete().eq('subject_id', o.id);
    }
    await admin.from('audit_log').delete().eq('subject_id', brandId);
    await admin.from('brands').delete().eq('id', brandId);
  }
  for (const id of made) {
    await admin.from('audit_log').delete().eq('actor_id', id);
    await admin.from('audit_log').delete().eq('target_user_id', id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) fail(`could not delete a test account: ${error.message}`);
  }
  console.log('\n[cleanup] test brand, offers, requests, audit rows and accounts removed');
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\n${'='.repeat(70)}`);
if (failures > 0) {
  console.error(`${failures} check(s) FAILED.\n`);
  process.exit(1);
}
console.log('Creators can ask, staff can decide, and nobody can do it for them.\n');
