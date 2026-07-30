#!/usr/bin/env node
/**
 * End to end test of the Brand Hub, admin side.
 *
 * Brands hold commercial data (an allocated budget, the client's name) and
 * offers decide what creators get paid, so this suite spends most of its time
 * trying to break in rather than admiring the happy path.
 *
 * It creates a brand and offers through the real UI, checks the database, then
 * attacks the tables and the Edge Function as a signed-in creator, and cleans
 * up after itself. Run against DEV only.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... SUPABASE_SERVICE_KEY=...
 *   node scripts/check-brands.mjs [baseUrl]
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
const BRAND_NAME = `Wurx Test Brand ${stamp}`;
const STORE_ID = `store-${stamp}`;
const BUDGET = '25000';
const CREATOR_EMAIL = `brandspy-${stamp}@wurxmediahub.test`;
const CREATOR_PASSWORD = 'a-long-enough-test-password-1';

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

/**
 * Poll until the database says what we are waiting for, or give up.
 *
 * Not a fixed sleep. A cold Edge Function boots Deno and pulls its dependencies
 * on the first call after a deploy, which takes seconds, and a test that
 * assumes a duration reports a product bug that is not there.
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
  console.log(`\nBrand Hub against ${BASE}\n${'='.repeat(70)}`);

  /* ----------------------------------------------------- [1] create it -- */
  console.log('\n[1] An admin creates a brand');
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await adminCtx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) {
      consoleErrors.push(m.text());
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('**/admin', { timeout: 25000 }).catch(() => {});

  await page.goto(`${BASE}/admin/brands`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.getByRole('button', { name: /add brand/i }).first().click();
  await page.waitForTimeout(700);
  check((await page.getByRole('dialog').count()) > 0, 'the add brand dialog opens');

  await page.fill('input[name="name"]', BRAND_NAME);
  await page.fill('input[name="storeId"]', STORE_ID);
  await page.fill('input[name="clientName"]', 'Test Client Ltd');
  await page.fill('input[name="budget"]', BUDGET);
  await page.getByRole('button', { name: /^add brand$/i }).last().click();

  const brand = await waitFor(
    async () =>
      (
        await admin
          .from('brands')
          .select('id, name, slug, store_id, client_name, budget_allocated, currency, is_active')
          .eq('store_id', STORE_ID)
          .maybeSingle()
      ).data,
    (r) => Boolean(r?.id),
    'the brand to be created'
  );

  brandId = brand?.id ?? null;
  check(Boolean(brand), 'the brand reached the database');
  check(brand?.name === BRAND_NAME, `name stored (got ${brand?.name})`);
  check(
    brand?.slug?.startsWith('wurx-test-brand-'),
    `a URL safe slug was generated (got ${brand?.slug})`
  );
  check(brand?.client_name === 'Test Client Ltd', 'client name stored');
  check(
    Number(brand?.budget_allocated) === Number(BUDGET),
    `budget stored exactly (got ${brand?.budget_allocated})`
  );
  check(brand?.currency === 'USD', 'currency defaults to USD');
  check(brand?.is_active === true, 'a new brand is active');

  const { data: brandLog } = await admin
    .from('audit_log')
    .select('action, actor_email')
    .eq('subject_id', brandId);
  check(
    (brandLog ?? []).some((r) => r.action === 'brand.created'),
    'creating a brand is audited'
  );

  /* ------------------------------------------------ [2] duplicate store -- */
  console.log('\n[2] Two brands cannot share a store id');
  await page.goto(`${BASE}/admin/brands`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /add brand/i }).first().click();
  await page.waitForTimeout(700);
  await page.fill('input[name="name"]', `${BRAND_NAME} clone`);
  await page.fill('input[name="storeId"]', STORE_ID);
  await page.getByRole('button', { name: /^add brand$/i }).last().click();

  const refused = await page
    .getByText(/already uses that store id/i)
    .first()
    .waitFor({ state: 'visible', timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  check(refused, 'the duplicate is refused, in plain English');
  const { count: brandCount } = await admin
    .from('brands')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', STORE_ID);
  check(brandCount === 1, `and only one brand exists with that store id (${brandCount})`);

  await page.getByRole('button', { name: /^cancel$/i }).last().click();
  await page.waitForTimeout(600);

  /* ----------------------------------------------------- [3] the offer -- */
  console.log('\n[3] An offer inside the hub');
  await page.goto(`${BASE}/admin/brands/${brandId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  check(
    (await page.getByRole('heading', { name: BRAND_NAME }).count()) > 0,
    'the brand hub opens on the right brand'
  );
  check(
    (await page.getByText(/\$25,000/).count()) > 0,
    'the budget is shown as money, not a raw number'
  );

  await page.getByRole('button', { name: /new offer|create the first offer/i }).first().click();
  await page.waitForTimeout(700);

  // A corrected field must clear its own error. It used to stay red until the
  // next submit, so somebody who typed 0, was told "between 1 and 1000", then
  // fixed it to 1 still saw the complaint and assumed they were still wrong.
  await page.fill('input[name="title"]', 'Draft');
  await page.fill('input[name="videoCount"]', '0');
  await page.fill('input[name="rewardAmount"]', '10');
  await page.getByRole('button', { name: /^create offer$/i }).click();
  await page.waitForTimeout(600);
  check(
    (await page.getByText(/between 1 and 1000 videos/i).count()) > 0,
    'zero videos is refused'
  );
  await page.fill('input[name="videoCount"]', '1');
  await page.waitForTimeout(400);
  check(
    (await page.getByText(/between 1 and 1000 videos/i).count()) === 0,
    'and correcting it clears the error, without another submit'
  );

  // Description is optional on an open offer and required on one creators must
  // apply for.
  check(
    (await page.getByText(/needs a description of what to deliver/i).count()) > 0,
    'an offer creators apply for demands a description'
  );
  await page.locator('input[name="needsApplication"]').uncheck();
  await page.waitForTimeout(400);
  check(
    (await page.getByText(/needs a description of what to deliver/i).count()) === 0,
    'and unticking "needs application" makes it optional again'
  );
  await page.locator('input[name="needsApplication"]').check();
  await page.waitForTimeout(300);

  await page.fill('input[name="title"]', 'Starter bundle');
  await page.fill('input[name="badgeTitle"]', 'TOP PICK');
  await page.fill('textarea[name="description"]', 'Five in-feed videos, posted within 30 days.');
  await page.fill('input[name="videoCount"]', '5');
  await page.fill('input[name="rewardAmount"]', '300');
  await page.waitForTimeout(400);
  check(
    (await page.getByText(/5 videos for \$300/i).count()) > 0,
    'the deal is summarised before it is saved'
  );
  await page.getByRole('button', { name: /^create offer$/i }).click();

  const offer = await waitFor(
    async () =>
      (
        await admin
          .from('offers')
          .select('id, title, badge_title, video_count, reward_amount, currency, status, needs_application')
          .eq('brand_id', brandId)
          .maybeSingle()
      ).data,
    (r) => Boolean(r?.id),
    'the offer to be created'
  );

  check(Boolean(offer), 'the offer reached the database');
  check(offer?.video_count === 5, `video count stored (got ${offer?.video_count})`);
  check(
    Number(offer?.reward_amount) === 300,
    `reward stored exactly (got ${offer?.reward_amount})`
  );
  check(offer?.badge_title === 'TOP PICK', 'badge stored');
  check(offer?.status === 'active', 'status defaults to active');
  check(
    offer?.needs_application === true,
    'needs application defaults to true, so nothing is given away by accident'
  );
  const saysApply = await page
    .getByText(/apply first/i)
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(saysApply, 'and the card says so');

  /* ------------------------------------------------- [4] edit the offer -- */
  console.log('\n[4] Editing it');
  await page.getByRole('button', { name: /^edit$/i }).first().click();
  await page.waitForTimeout(800);
  await page.fill('input[name="rewardAmount"]', '450.55');
  await page.locator('input[name="needsApplication"]').uncheck();
  await page.getByRole('button', { name: /^save changes$/i }).click();

  const edited = await waitFor(
    async () =>
      (
        await admin
          .from('offers')
          .select('reward_amount, needs_application')
          .eq('id', offer.id)
          .single()
      ).data,
    (r) => r?.needs_application === false,
    'the offer edit to land'
  );
  await page.waitForTimeout(1200);
  check(
    Number(edited?.reward_amount) === 450.55,
    `pennies survive the round trip (got ${edited?.reward_amount})`
  );
  check(edited?.needs_application === false, 'the offer is now open to all');
  check(
    (await page.getByText(/open to all/i).count()) > 0,
    'the card updated without a reload'
  );


  /* ---------------------------------------------------- [5] the attacks -- */
  console.log('\n[5] Attacks, run as a real signed-in creator');
  const { data: spy } = await admin.auth.admin.createUser({
    email: CREATOR_EMAIL,
    password: CREATOR_PASSWORD,
    email_confirm: true,
  });
  made.push(spy.user.id);
  await admin.from('profiles').update({ role: 'creator', tier: 'pro' }).eq('id', spy.user.id);

  const spyCtx = await browser.newContext();
  const spyPage = await spyCtx.newPage();
  await spyPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await spyPage.fill('input[name="email"]', CREATOR_EMAIL);
  await spyPage.fill('input[name="password"]', CREATOR_PASSWORD);
  await spyPage.getByRole('button', { name: /^sign in$/i }).click();
  await spyPage.waitForURL('**/app', { timeout: 25000 }).catch(() => {});
  await spyPage.waitForTimeout(1800);

  // a. Read the brands table, budget and all.
  const readBrands = await asUser(spyPage, '/rest/v1/brands?select=id,name,budget_allocated');
  let seenBrands = [];
  try {
    seenBrands = JSON.parse(readBrands.body);
  } catch {
    seenBrands = [];
  }
  check(
    Array.isArray(seenBrands) && seenBrands.length === 0,
    `a creator cannot read brands, so budgets stay internal (${Array.isArray(seenBrands) ? seenBrands.length : readBrands.status})`
  );

  // b. Read the offers table.
  const readOffers = await asUser(spyPage, '/rest/v1/offers?select=id,title,reward_amount');
  let seenOffers = [];
  try {
    seenOffers = JSON.parse(readOffers.body);
  } catch {
    seenOffers = [];
  }
  check(
    Array.isArray(seenOffers) && seenOffers.length === 0,
    `and cannot read offers yet either (${Array.isArray(seenOffers) ? seenOffers.length : readOffers.status})`
  );

  // c. Write a brand straight to the table.
  const insertBrand = await asUser(spyPage, '/rest/v1/brands', {
    method: 'POST',
    body: JSON.stringify({ name: 'Mine now', slug: `mine-${stamp}`, store_id: `x-${stamp}` }),
  });
  check(insertBrand.status >= 400, `inserting a brand is refused (HTTP ${insertBrand.status})`);

  // d. Raise their own reward.
  const raiseReward = await asUser(spyPage, `/rest/v1/offers?id=eq.${offer.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ reward_amount: 999999 }),
  });
  const { data: afterRaise } = await admin
    .from('offers')
    .select('reward_amount')
    .eq('id', offer.id)
    .single();
  check(
    raiseReward.status >= 400 || Number(afterRaise?.reward_amount) === 450.55,
    `cannot raise their own reward (HTTP ${raiseReward.status}, still ${afterRaise?.reward_amount})`
  );

  // e. Call the Edge Function.
  const viaFunction = await asUser(spyPage, '/functions/v1/manage-brand', {
    method: 'POST',
    body: JSON.stringify({
      action: 'offer.save',
      brandId,
      title: 'Free money',
      videoCount: 1,
      rewardAmount: 100000,
    }),
  });
  check(viaFunction.status === 403, `the Edge Function refuses a creator (HTTP ${viaFunction.status})`);

  const { data: denied } = await admin
    .from('audit_log')
    .select('action')
    .eq('action', 'brand.write_denied')
    .eq('actor_id', spy.user.id);
  check((denied ?? []).length > 0, 'and the attempt is recorded with their name on it');

  // f. Call the database functions directly.
  const directRpc = await asUser(spyPage, '/rest/v1/rpc/save_offer', {
    method: 'POST',
    body: JSON.stringify({
      p_actor_id: spy.user.id,
      p_brand_id: brandId,
      p_title: 'Free money',
      p_video_count: 1,
      p_reward_amount: 100000,
    }),
  });
  check(directRpc.status >= 400, `save_offer is unreachable with a user token (HTTP ${directRpc.status})`);

  const directBrand = await asUser(spyPage, '/rest/v1/rpc/save_brand', {
    method: 'POST',
    body: JSON.stringify({ p_actor_id: spy.user.id, p_name: 'Mine', p_store_id: 'x' }),
  });
  check(directBrand.status >= 400, `save_brand is unreachable too (HTTP ${directBrand.status})`);

  // g. No token at all.
  const anonCall = await fetch(`${URL_BASE}/functions/v1/manage-brand`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'brand.save', name: 'Anon', storeId: 'anon' }),
  });
  check(anonCall.status === 401, `an anonymous call is rejected (HTTP ${anonCall.status})`);

  const { count: stillOne } = await admin
    .from('brands')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', STORE_ID);
  check(stillOne === 1, 'after all of that, nothing was created or changed');

  /* ------------------------------------------------------- [6] deleting -- */
  console.log('\n[6] Deleting an offer keeps the record');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // The button is labelled "Delete Starter bundle", not just "Delete": with
  // several offers on screen, "Delete" alone tells a screen reader nothing.
  await page.getByRole('button', { name: /^delete\s+\S/i }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /yes, delete/i }).click();

  const offersLeft = await waitFor(
    async () =>
      (
        await admin
          .from('offers')
          .select('id', { count: 'exact', head: true })
          .eq('brand_id', brandId)
      ).count,
    (n) => n === 0,
    'the offer to be deleted'
  );
  check(offersLeft === 0, `the offer is gone (${offersLeft} left)`);

  const { data: deleteLog } = await admin
    .from('audit_log')
    .select('action, detail')
    .eq('subject_id', offer.id)
    .eq('action', 'offer.deleted');
  check((deleteLog ?? []).length === 1, 'and the audit log still says what it was');
  check(
    deleteLog?.[0]?.detail?.title === 'Starter bundle',
    'including its title and reward, after the row itself is gone'
  );

  /* -------------------------------------------------------- [7] console -- */
  console.log('\n[7] Console');
  // This suite deliberately provokes refusals: a duplicate store id, and a
  // creator reaching for things they may not have. The browser logs each of
  // those as a failed request, and counting them would mean the suite fails
  // precisely because the security worked. Anything else, including a 500 or a
  // thrown error, still counts.
  const expected = /Failed to load resource.*(401|403|409)/i;
  const real = consoleErrors.filter((e) => !expected.test(e));
  const refusals = consoleErrors.length - real.length;
  check(real.length === 0, `no unexpected console errors (${real.length})`);
  real.slice(0, 3).forEach((e) => console.error(`        ${e}`));
  console.log(`        (${refusals} deliberate refusals logged by the browser, ignored)`);

  await spyCtx.close();
  await adminCtx.close();
} catch (e) {
  fail(`unexpected error: ${e.message}`);
  console.error(e.stack);
} finally {
  await browser.close();

  if (brandId) {
    await admin.from('audit_log').delete().eq('subject_id', brandId);
    const { data: offerIds } = await admin.from('offers').select('id').eq('brand_id', brandId);
    for (const o of offerIds ?? []) {
      await admin.from('audit_log').delete().eq('subject_id', o.id);
    }
    await admin.from('brands').delete().eq('id', brandId);
  }
  for (const id of made) {
    await admin.from('audit_log').delete().eq('actor_id', id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) fail(`could not delete a test account: ${error.message}`);
  }
  console.log('\n[cleanup] test brand, offers, audit rows and accounts removed');
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\n${'='.repeat(70)}`);
if (failures > 0) {
  console.error(`${failures} check(s) FAILED.\n`);
  process.exit(1);
}
console.log('The Brand Hub works, and holds up under attack.\n');
