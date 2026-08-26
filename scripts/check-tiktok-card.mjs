#!/usr/bin/env node
/**
 * The creator's TikTok card, in a real browser, in both of the states it has.
 *
 * WHY THIS EXISTS AS ITS OWN SUITE. The profile block added on 2026-08-26 has a
 * branch that no other check can reach: the account totals are HIDDEN when the
 * `user.info.stats` permission was never granted, and SHOWN — with a dash for
 * anything TikTok withheld — when it was. Those two cases look identical from
 * the database and identical from the Edge Function. They differ only on the
 * screen, which is the one place `verify:creator-tiktok` cannot look.
 *
 * The stakes are ordinary but specific: every connection made before that date,
 * PRODUCTION INCLUDED, carries the narrower pair. If the strip rendered three
 * dashes for them, a creator would read "you have no followers, no likes and no
 * videos" about their own account. That is why the absent case is asserted just
 * as hard as the present one.
 *
 * Makes its own creator and deletes it in a `finally`. Dev only.
 *
 * Needs a server:
 *   pnpm build; pnpm preview        (in another shell)
 *   SUPABASE_SERVICE_KEY=... node scripts/check-tiktok-card.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
import { assertDevProject } from './lib/dev-guard.mjs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

assertDevProject(env.VITE_SUPABASE_URL, 'check-tiktok-card.mjs');
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE) throw new Error('SUPABASE_SERVICE_KEY must be set');
const BASE = process.env.BASE_URL || 'http://localhost:4173';

const admin = createClient(env.VITE_SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
const ok = (l) => { console.log(`  PASS  ${l}`); pass++; };
const bad = (l, d) => { console.error(`  FAIL  ${l}${d ? `\n        ${d}` : ''}`); fail++; };

const stamp = Date.now();
const ME = { email: `tt-card-${stamp}@wurx.test`, password: 'TtCard!2026' };

const WIDTHS = [
  { w: 375, h: 900, name: 'phone' },
  { w: 768, h: 1024, name: 'tablet' },
  { w: 1440, h: 900, name: 'desktop' },
];

const FULL_SCOPE = 'user.info.basic,user.info.profile,user.info.stats,video.list';
const LEGACY_SCOPE = 'user.info.basic,video.list';

mkdirSync('shots/tiktok-card', { recursive: true });

let browser;
try {
  const { data, error } = await admin.auth.admin.createUser({
    email: ME.email,
    password: ME.password,
    email_confirm: true,
  });
  if (error) throw error;
  ME.id = data.user.id;
  await admin.from('profiles').update({ role: 'creator', tier: 'pro' }).eq('id', ME.id);

  await admin.from('creator_tiktok_connections').insert({
    creator_id: ME.id,
    open_id: `card-${stamp}`,
    display_name: 'Card Test',
    username: 'card_test',
    profile_deep_link: 'https://www.tiktok.com/@card_test',
    is_verified: true,
    follower_count: 128_400,
    /* A DELIBERATE NULL, so the dash branch is exercised rather than assumed.
       "TikTok did not tell us" has to look different from "we were told 0". */
    likes_count: null,
    video_count: 37,
    scope: FULL_SCOPE,
    profile_synced_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
  });
  await admin.from('creator_tiktok_videos').insert({
    creator_id: ME.id,
    video_id: `cardvid-${stamp}`,
    title: 'A test video',
    view_count: 1241,
    like_count: 65,
    comment_count: 4,
    share_count: 0,
    posted_at: new Date().toISOString(),
  });

  browser = await launchBrowser();

  /* ------------------------------------------------------------ sign in -- */
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', ME.email);
  await page.fill('input[name="password"]', ME.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('**/app**', { timeout: 30_000 }).catch(() => {});
  const hello = page.getByRole('button', { name: /let.s go/i });
  if (await hello.count()) await hello.first().click().catch(() => {});

  await page.goto(`${BASE}/app/profile`, { waitUntil: 'networkidle' });

  const card = page.locator('section', { hasText: 'Your TikTok account' }).first();
  if (await card.count()) ok('the TikTok card renders on the profile page');
  else bad('the TikTok card is not on the profile page — every check below is vacuous');

  console.log('\n[1] The stats permission WAS granted');
  {
    const text = (await card.innerText()).replace(/\s+/g, ' ');

    if (/@card_test/.test(text)) ok('the @handle is shown');
    else bad('the @handle is missing', text.slice(0, 200));

    /*
     * THE BLURB MUST KNOW WHICH STATE IT IS IN. It read "Connect it to see how
     * your own videos performed" whether or not somebody had connected, so a
     * connected creator was still being asked to connect — on the same card
     * that says "Connected" two lines below. Cheap to reintroduce, so pinned.
     */
    if (!/Connect it to/i.test(text)) ok('a connected creator is not still asked to connect');
    else bad('the card still says "Connect it to..." while connected', text.slice(0, 200));

    /*
     * '128k', NOT '128.4k'. `compact()` keeps one decimal only below 10,000,
     * because above that a tenth of a thousand is noise on a follower count.
     * This assertion first expected the decimal and failed a correct product,
     * which is the right way round for a test to be wrong.
     */
    if (/FOLLOWERS/i.test(text) && /\b128k\b/i.test(text)) ok('the follower count is shown, compacted (128k)');
    else bad('the follower count is wrong or missing', text.slice(0, 300));

    if (/VIDEOS/i.test(text) && /\b37\b/.test(text)) ok('the video count is shown');
    else bad('the video count is missing', text.slice(0, 300));

    /*
     * THE NULL BRANCH. `likes_count` was seeded null on purpose. A zero here
     * would be a number a creator would believe about their own account.
     */
    if (!/LIKES 0\b/i.test(text)) ok('a withheld likes_count is NOT rendered as 0');
    else bad('a null likes_count rendered as zero', text.slice(0, 300));

    const verified = await card.getByText('Verified on TikTok').count();
    if (verified) ok('the verified badge carries a text label for screen readers');
    else bad('the verified badge is decorative only');

    const link = card.locator('a[href="https://www.tiktok.com/@card_test"]');
    if (await link.count()) {
      const rel = await link.first().getAttribute('rel');
      if ((rel ?? '').includes('noopener') && (rel ?? '').includes('noreferrer')) {
        ok('the profile link opens safely (rel=noopener noreferrer)');
      } else {
        bad('the profile link is missing rel=noopener noreferrer', String(rel));
      }
    } else {
      bad('the profile deep link is not rendered as a link');
    }
  }

  console.log('\n[2] Every width, no sideways scroll');
  for (const { w, h, name } of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    if (!overflow) ok(`${name} (${w}px): no horizontal page scroll`);
    else bad(`${name} (${w}px): THE PAGE SCROLLS SIDEWAYS`);

    /* The three figures must still be readable, not clipped to nothing. */
    const box = await card.boundingBox();
    if (box && box.width > 0) ok(`${name} (${w}px): the card has a real box (${Math.round(box.width)}px)`);
    else bad(`${name} (${w}px): the card has no box`);

    await page.screenshot({
      path: `shots/tiktok-card/granted-${name}.png`,
      fullPage: false,
    });
  }

  console.log('\n[3] The stats permission was NOT granted (every pre-2026-08-26 connection)');
  {
    /*
     * The SAME row, narrowed to the legacy scope. Nothing else changes, so any
     * difference below is the branch under test and not a side effect.
     */
    await admin
      .from('creator_tiktok_connections')
      .update({ scope: LEGACY_SCOPE })
      .eq('creator_id', ME.id);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const text = (await card.innerText()).replace(/\s+/g, ' ');

    /* First prove we are looking at the right card, or the rest is vacuous. */
    if (/Card Test/.test(text)) {
      ok('the card still renders with the narrower legacy scope');

      if (!/FOLLOWERS/i.test(text)) ok('the totals strip is HIDDEN, not shown as three dashes');
      else bad('the totals strip is still shown without permission', text.slice(0, 300));

      /* The videos are still theirs: video.list is in the legacy pair. */
      if (/1,?241|1\.2k/.test(text)) ok('the per-video figures still show, as they should');
      else bad('the video figures vanished with the profile scope', text.slice(0, 300));
    } else {
      bad('the card did not re-render — [3] would be vacuous', text.slice(0, 200));
    }

    await page.screenshot({ path: 'shots/tiktok-card/legacy-desktop.png' });
  }

  console.log('\n[4] The console');
  {
    /* Third-party avatar 404s are not ours; anything else is. */
    const ours = consoleErrors.filter((e) => !/tiktokcdn|favicon/i.test(e));
    if (ours.length === 0) ok('no console errors');
    else bad(`${ours.length} console error(s)`, ours.slice(0, 3).join(' | '));
  }
} finally {
  if (browser) await browser.close();
  if (ME.id) {
    await admin.from('creator_tiktok_videos').delete().eq('creator_id', ME.id);
    await admin.from('creator_tiktok_connections').delete().eq('creator_id', ME.id);
    await admin.auth.admin.deleteUser(ME.id);
  }
  console.log('\n[cleanup] the test creator and its rows are gone');
}

console.log('\n' + '='.repeat(70));
if (fail) {
  console.error(`${fail} failed, ${pass} passed.  Shots in shots/tiktok-card/\n`);
  process.exit(1);
}
console.log(`${pass} checks passed.  Shots in shots/tiktok-card/\n`);
