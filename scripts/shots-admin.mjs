#!/usr/bin/env node
/**
 * Retina screenshots of any ADMIN screen, both themes, four widths.
 *
 * Rashid reviews design by looking, and he cannot read a console. `shots.mjs`
 * covers the pages a signed-out visitor can reach; everything behind
 * `/admin` needed a password nobody wanted to keep in an environment variable,
 * so the responsive and collabs suites both ask for `ADMIN_EMAIL` and
 * `ADMIN_PASSWORD` before they will run.
 *
 * This makes its own admin instead: a throwaway account with a known password,
 * used once, deleted in a `finally`. So a screen can be looked at with one
 * command and nothing is left behind in the database.
 *
 *   SUPABASE_SERVICE_KEY=... node scripts/shots-admin.mjs /admin/offers
 *   SUPABASE_SERVICE_KEY=... node scripts/shots-admin.mjs /admin/offers http://localhost:4173
 *
 * DEV ONLY, and checked before anything runs: it creates and deletes an account.
 * Needs a server on `baseUrl` — `pnpm build` then `pnpm preview`.
 */

import { mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';
import { assertDevProject } from './lib/dev-guard.mjs';

const PATHNAME = process.argv[2] ?? '/admin';
const BASE = process.argv[3] ?? 'http://localhost:4173';

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
assertDevProject(URL_, 'shots-admin.mjs');
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE) throw new Error('SUPABASE_SERVICE_KEY must be set in the environment');

const slug = PATHNAME.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'admin';
const OUT = `shots/${slug}`;
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 800 },
  { name: '768', width: 768, height: 900 },
  { name: '375', width: 375, height: 812 },
];

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const stamp = String(Date.now()).slice(-6);
const email = `shots-admin-${stamp}@wurxmediahub.test`;
const password = 'a-long-enough-test-password-1';
let userId = null;
let browser = null;
const consoleErrors = [];

try {
  const { data: made, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create the shots admin: ${error.message}`);
  userId = made.user.id;
  await admin.from('profiles').update({ role: 'admin', is_active: true }).eq('id', userId);

  browser = await launchBrowser();

  for (const theme of ['dark', 'light']) {
    for (const size of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 2,
      });

      // Planted before any script on the page runs, so the app never paints in
      // the wrong theme first and the shot has no flash in it.
      await ctx.addInitScript((t) => localStorage.setItem('wurxmediahub-theme', t), theme);

      const page = await ctx.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`[${theme} ${size.name}] ${msg.text()}`);
      });

      /*
       * `domcontentloaded`, NEVER `networkidle`.
       *
       * These screens hold a Supabase realtime socket open, and a page with a
       * live socket on it may never go network-idle at all. It looked like a
       * flaky machine — dark mode would shoot cleanly and then the first light
       * run would sit for thirty seconds and throw — which is the worst kind of
       * failure to diagnose, because the code it blames is the code that works.
       * Wait for the thing being photographed instead.
       */
      await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('input[name="email"]', { timeout: 20_000 });
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]');
      // Away from the login screen, not merely "somewhere under /admin", which
      // /admin/login matches and would let a failed sign-in through silently.
      await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25_000 });

      await page.goto(`${BASE}${PATHNAME}`, { waitUntil: 'domcontentloaded' });
      // Something real on the screen: a list, a card grid, or the designed
      // empty state. Any of the three means the query came back.
      await page
        .waitForSelector('main ul li, main [class*="rounded"]', { timeout: 25_000 })
        .catch(() => {});

      /*
       * Faces arrive as SIGNED urls, so they are still resolving when the page
       * is otherwise idle. A shot taken now is a page of initials, which looks
       * exactly like the avatars being broken. Wait for the images actually on
       * the page to have decoded, then give the entrance animation its moment.
       */
      /*
       * TWO WAITS, AND THE FIRST ONE IS THE POINT.
       *
       * This was one wait — "every image on the page has decoded" — which is
       * TRUE OF A PAGE WITH NO IMAGES ON IT, because `[].every()` is true. An
       * avatar's `<img>` only mounts once its signed URL has arrived, so the
       * check passed instantly, the shot was taken, and the result was a page
       * of initials that looked exactly like the pictures being broken. It
       * caught the 1440 shots by luck and missed the 375 ones.
       *
       * So: wait for at least one image to EXIST (briefly — a screen with no
       * faces on it is normal and must not pay for this), then wait for the
       * ones that exist to have decoded.
       */
      const hasFaces = await page
        .waitForFunction(() => document.images.length > 0, { timeout: 8_000 })
        .then(() => true)
        .catch(() => false);

      if (hasFaces) {
        await page
          .waitForFunction(
            () => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
            { timeout: 15_000 }
          )
          .catch(() => {});
      }
      await page.waitForTimeout(900);

      // What actually gets judged: the fold, then the whole thing.
      await page.screenshot({
        path: `${OUT}/${theme}-${size.name}-fold.png`,
        clip: { x: 0, y: 0, width: size.width, height: size.height },
      });
      await page.screenshot({ path: `${OUT}/${theme}-${size.name}-full.png`, fullPage: true });

      /*
       * A second pair with something OPEN. Half of any screen with an accordion,
       * a drawer or a dialog on it is invisible in a screenshot of its resting
       * state, and that half is usually the half being reviewed.
       *
       *   SHOT_CLICK='[aria-expanded]' node scripts/shots-admin.mjs /admin/offers
       */
      if (process.env.SHOT_CLICK) {
        const target = page.locator(process.env.SHOT_CLICK).first();
        if (await target.count()) {
          await target.click();
          await page.waitForTimeout(600);
          await page.screenshot({
            path: `${OUT}/${theme}-${size.name}-open-fold.png`,
            clip: { x: 0, y: 0, width: size.width, height: size.height },
          });
        }
      }

      // A page that scrolls sideways is a bug at every width. Rule: wide things
      // scroll inside their own container, never the document.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1
      );
      console.log(
        `  ${theme.padEnd(5)} ${String(size.name).padStart(4)}  ` +
          (overflow ? 'HORIZONTAL SCROLL' : 'ok')
      );

      await ctx.close();
    }
  }

  console.log(`\nWrote ${OUT}/`);
  if (consoleErrors.length) {
    console.error('\nCONSOLE ERRORS:');
    for (const e of consoleErrors) console.error(`  ${e}`);
    process.exitCode = 1;
  } else {
    console.log('No console errors.');
  }
} finally {
  if (browser) await browser.close();
  if (userId) {
    /*
     * RETRIED, because the alternative is litter. A single `fetch failed` on
     * this machine — which happens often enough to have cost three runs on
     * 2026-08-21 — used to leave a throwaway admin in dev for good. Deleting is
     * idempotent, so trying again is free, and the last word is a loud one so
     * nobody has to notice a silent leftover a day later.
     */
    let removed = false;
    let why = '';
    for (let attempt = 1; attempt <= 4 && !removed; attempt++) {
      try {
        await admin.from('audit_log').delete().eq('actor_id', userId);
        await admin.from('audit_log').delete().eq('target_user_id', userId);
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (!error) removed = true;
        else why = error.message;
      } catch (e) {
        why = e?.message ?? String(e);
      }
      if (!removed && attempt < 4) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
    if (removed) console.log(`Shots admin ${email} removed.`);
    else {
      console.error(`\nCOULD NOT DELETE the shots admin ${email}: ${why}`);
      console.error('Remove it by hand before anybody reads the profile counts.');
      process.exitCode = 1;
    }
  }
}
