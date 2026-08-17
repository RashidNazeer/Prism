#!/usr/bin/env node
/**
 * Creator ad numbers: does it work, and can anyone see what is not theirs.
 *
 * This runs the WHOLE chain against the real TikTok API: it maps a store to a
 * brand, puts a real video under it, runs the nightly sync, and then checks the
 * figures that come back against the ones Rashid verified by hand. Anything
 * less would prove the pipeline moves data, not that it moves the RIGHT data.
 *
 * Then it attacks it. Two creators, each with a video, and the question is
 * whether either can reach the other's money. That boundary is a row level
 * security policy, so the only honest way to test it is to sign in and try.
 *
 * DEV ONLY. Needs SUPABASE_SERVICE_KEY. Everything it makes, it removes.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL_ = env.VITE_SUPABASE_URL;
const PUBLISHABLE = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !PUBLISHABLE) throw new Error('.env.local is missing the Supabase URL or key');
if (!SERVICE) throw new Error('SUPABASE_SERVICE_KEY must be set');

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anonClient = () => createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m, d) => {
  console.error(`  FAIL  ${m}${d ? `\n        ${d}` : ''}`);
  failures++;
};
const check = (cond, m, d) => (cond ? pass(m) : fail(m, d));

const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6);
const PASSWORD = 'a-long-enough-test-password-1';

/*
 * A REAL VIDEO WITH REAL SPEND, from Rashid's own account. Known good for
 * 1-16 Aug 2026: cost 223.47, gross_revenue 94.75, orders 5, roi 0.42.
 * Using an invented id would prove the plumbing and nothing about the numbers.
 */
const REAL_ITEM = '7672433177599773983';
const REAL_STORE = '7495965060132604461';
const REAL_ADVERTISER = '7427187763989987329';

const users = [];
const made = { brand: null, offer: null, application: null, submissions: [], mappedStore: false };

async function makeUser(role, tag) {
  const email = `perf-${tag}-${stamp}@wurxmediahub.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create ${tag}: ${error.message}`);
  users.push(data.user.id);
  await admin.from('profiles').update({ role, is_active: true }).eq('id', data.user.id);
  const client = anonClient();
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return { client, id: data.user.id, email };
}

async function cleanup() {
  for (const s of made.submissions) await admin.from('content_submissions').delete().eq('id', s);
  if (made.application) await admin.from('offer_applications').delete().eq('id', made.application);
  if (made.offer) await admin.from('offers').delete().eq('id', made.offer);
  if (made.mappedStore) {
    await admin
      .from('tiktok_stores')
      .update({ brand_id: null, mapped_by: null, mapped_at: null })
      .eq('store_id', REAL_STORE)
      .eq('advertiser_id', REAL_ADVERTISER);
  }
  if (made.brand) await admin.from('brands').delete().eq('id', made.brand);
  for (const id of users) {
    await admin.from('audit_log').delete().eq('actor_id', id);
    await admin.auth.admin.deleteUser(id);
  }
}

console.log(`\nCreator ad numbers against ${URL_}\n${'='.repeat(70)}\n`);

try {
  /* ------------------------------------------------------ [0] the fixtures */
  console.log('[0] A brand, a store mapping, and a real video');

  const { data: store } = await admin
    .from('tiktok_stores')
    .select('store_id, brand_id')
    .eq('store_id', REAL_STORE)
    .eq('advertiser_id', REAL_ADVERTISER)
    .maybeSingle();

  if (!store) {
    fail('the real Penetrex store is known', 'connect TikTok and press Re-check first');
    throw new Error('no store to test with');
  }
  pass('the real Penetrex store is known');

  const { data: brand, error: brandErr } = await admin
    .from('brands')
    .insert({
      name: `Perf test ${stamp}`,
      slug: `perf-test-${stamp}`,
      store_id: `perf-${stamp}`,
      is_active: true,
    })
    .select('id')
    .single();
  check(!brandErr, 'a brand to hang it off', brandErr?.message);
  made.brand = brand?.id ?? null;

  await admin
    .from('tiktok_stores')
    .update({ brand_id: made.brand, mapped_at: new Date().toISOString() })
    .eq('store_id', REAL_STORE)
    .eq('advertiser_id', REAL_ADVERTISER);
  made.mappedStore = true;
  pass('the store is matched to it');

  const creatorA = await makeUser('creator', 'a');
  const creatorB = await makeUser('creator', 'b');

  const { data: offer, error: offerErr } = await admin
    .from('offers')
    .insert({
      brand_id: made.brand,
      title: `Perf offer ${stamp}`,
      video_count: 1,
      reward_amount: 100,
      status: 'active',
      needs_application: false,
    })
    .select('id')
    .single();
  // A fixture that fails quietly turns into a feature that looks broken three
  // checks later, so every one of them is asserted at the point it is made.
  check(!offerErr, 'an offer under it', offerErr?.message);
  made.offer = offer?.id ?? null;

  const { data: app, error: appErr } = await admin
    .from('offer_applications')
    .insert({
      offer_id: made.offer,
      brand_id: made.brand,
      creator_id: creatorA.id,
      status: 'approved',
    })
    .select('id')
    .single();
  check(!appErr, 'and an approved application', appErr?.message);
  made.application = app?.id ?? null;

  const mkVideo = async (creatorId, embedId) => {
    const { data, error } = await admin
      .from('content_submissions')
      .insert({
        application_id: made.application,
        creator_id: creatorId,
        brand_id: made.brand,
        offer_id: made.offer,
        video_url: `https://www.tiktok.com/@wurxtest/video/${embedId}`,
        ad_code: `PERF${stamp}`,
        ad_authorized: true,
        embed_id: embedId,
      })
      .select('id')
      .single();
    if (error) throw new Error(`could not seed a video: ${error.message}`);
    made.submissions.push(data.id);
    return data.id;
  };

  await mkVideo(creatorA.id, REAL_ITEM);
  // Creator B gets a DIFFERENT video, so "can B see A's money" is a real
  // question rather than two people sharing one row.
  await mkVideo(creatorB.id, '7000000000000000001');
  pass('two creators, each with their own video');

  /* ----------------------------------------------------------- [1] the sync */
  console.log('\n[1] The nightly sync, run for real');

  const adminUser = await makeUser('admin', 'adm');
  const { data: sess } = await adminUser.client.auth.getSession();

  const syncRes = await fetch(`${URL_}/functions/v1/tiktok-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${sess.session.access_token}`,
      'x-region': 'ap-northeast-1',
    },
    body: JSON.stringify({ days: 12, force: true }),
  });
  const syncBody = await syncRes.json();
  check(syncRes.status === 200 && syncBody.ok, 'the sync ran', JSON.stringify(syncBody).slice(0, 300));
  check(
    (syncBody.calls ?? 0) > 0 && (syncBody.failures ?? []).length === 0,
    `it called TikTok ${syncBody.calls} time(s) with no failures`,
    JSON.stringify(syncBody.failures ?? [])
  );

  const { count: dailyRows } = await admin
    .from('tiktok_video_daily')
    .select('*', { count: 'exact', head: true })
    .eq('item_id', REAL_ITEM);
  check((dailyRows ?? 0) > 0, `it wrote ${dailyRows} day(s) for the real video`);

  {
    const { count: todayRows } = await admin
      .from('tiktok_video_daily')
      .select('*', { count: 'exact', head: true })
      .gte('stat_date', new Date().toISOString().slice(0, 10));
    check(
      (todayRows ?? 0) === 0,
      'and it stored nothing for today, which is still accruing'
    );
  }

  /* ------------------------------------------- [2] a creator reads their own */
  console.log('\n[2] What creator A sees');

  const { data: windowA, error: winErr } = await creatorA.client.rpc(
    'creator_performance_window'
  );
  check(!winErr && (windowA ?? []).length === 1, 'the window loads', winErr?.message);
  check(Number(windowA?.[0]?.videos ?? 0) === 1, 'and it counts their one video');

  const { data: perfA, error: perfErr } = await creatorA.client.rpc('creator_video_performance', {
    p_from: '2026-08-01',
    p_to: '2026-08-16',
  });
  check(!perfErr && (perfA ?? []).length === 1, 'their video comes back', perfErr?.message);

  const row = (perfA ?? [])[0];
  check(row?.item_id === REAL_ITEM, 'and it is the right video');
  check(Number(row?.cost ?? 0) > 0, `with real spend on it (${row?.cost})`);
  check(row?.currency === 'USD', 'denominated in the account currency');
  // ROI is derived, never averaged. revenue / cost.
  if (Number(row?.cost) > 0) {
    const expected = Number(row.gross_revenue) / Number(row.cost);
    check(
      Math.abs(Number(row.roi) - expected) < 0.02,
      `ROI is revenue over cost (${row.roi} vs ${expected.toFixed(2)})`
    );
  }

  const { data: dailyA } = await creatorA.client.rpc('creator_daily_performance', {
    p_from: '2026-08-01',
    p_to: '2026-08-16',
  });
  check((dailyA ?? []).length > 0, `their daily series has ${(dailyA ?? []).length} day(s)`);

  /* ------------------------------------------------ [3] THE ONE THAT MATTERS */
  console.log("\n[3] Creator B tries to reach creator A's money");

  {
    const { data } = await creatorB.client
      .from('tiktok_video_daily')
      .select('*')
      .eq('item_id', REAL_ITEM);
    check(
      (data ?? []).length === 0,
      "B CANNOT READ A'S ROWS, even naming the video id exactly",
      `returned ${(data ?? []).length} row(s)`
    );
  }

  {
    const { data } = await creatorB.client.rpc('creator_video_performance', {
      p_from: '2026-08-01',
      p_to: '2026-08-16',
    });
    const leaked = (data ?? []).filter((r) => r.item_id === REAL_ITEM);
    check(leaked.length === 0, "and A's video is absent from B's own report");
    const spend = (data ?? []).reduce((s, r) => s + Number(r.cost), 0);
    check(spend === 0, "and B's totals carry none of A's spend", `saw ${spend}`);
  }

  {
    const { data } = await creatorB.client.rpc('creator_daily_performance', {
      p_from: '2026-08-01',
      p_to: '2026-08-16',
    });
    check((data ?? []).length === 0, "and B's daily series is empty");
  }

  /* ---------------------------------------------------- [4] nobody can write */
  console.log('\n[4] Nobody can write a number');

  {
    const { error } = await creatorA.client
      .from('tiktok_video_daily')
      .insert({ item_id: REAL_ITEM, stat_date: '2026-08-01', advertiser_id: REAL_ADVERTISER, cost: 0 });
    check(error !== null, 'a creator cannot invent a row');
  }
  {
    const { data } = await creatorA.client
      .from('tiktok_video_daily')
      .update({ gross_revenue: 999999 })
      .eq('item_id', REAL_ITEM)
      .select('item_id');
    check((data ?? []).length === 0, 'a creator cannot inflate their own GMV');
  }
  {
    const { data } = await creatorA.client
      .from('tiktok_video_daily')
      .delete()
      .eq('item_id', REAL_ITEM)
      .select('item_id');
    check((data ?? []).length === 0, 'a creator cannot delete a bad day');
  }

  /* --------------------------------------------------------- [5] signed out */
  console.log('\n[5] Signed out');
  const out = anonClient();
  {
    const { data } = await out.from('tiktok_video_daily').select('*').limit(5);
    check((data ?? []).length === 0, 'sees no ad numbers');
  }
  {
    const { error } = await out.rpc('creator_video_performance', {
      p_from: '2026-08-01',
      p_to: '2026-08-16',
    });
    check(error !== null, 'and cannot call the report function');
  }

  /* ------------------------------------------------ [6] the sync's own door */
  console.log("\n[6] The sync refuses everyone else");
  {
    const { data: s } = await creatorA.client.auth.getSession();
    const res = await fetch(`${URL_}/functions/v1/tiktok-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PUBLISHABLE,
        Authorization: `Bearer ${s.session.access_token}`,
        'x-region': 'ap-northeast-1',
      },
      body: JSON.stringify({ days: 1 }),
    });
    check(res.status === 403, 'a creator cannot trigger a sync', `got ${res.status}`);
  }
  {
    const res = await fetch(`${URL_}/functions/v1/tiktok-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE, 'x-sync-secret': 'wrong' },
      body: JSON.stringify({ days: 1 }),
    });
    check(res.status === 401, 'a wrong scheduler secret is refused', `got ${res.status}`);
  }
} catch (e) {
  fail('the suite itself threw', e.message);
} finally {
  await cleanup();
  console.log('\n  cleaned up');
}

console.log(`\n${'='.repeat(70)}`);
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED.\n`);
  process.exit(1);
}
console.log('\nEvery check passed.\n');
process.exit(0);
