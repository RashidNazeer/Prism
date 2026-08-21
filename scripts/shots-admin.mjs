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

      await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]');
      // Away from the login screen, not merely "somewhere under /admin", which
      // /admin/login matches and would let a failed sign-in through silently.
      await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });

      await page.goto(`${BASE}${PATHNAME}`, { waitUntil: 'networkidle' });

      /*
       * Faces arrive as SIGNED urls, so they are still resolving when the page
       * is otherwise idle. A shot taken now is a page of initials, which looks
       * exactly like the avatars being broken. Wait for the images actually on
       * the page to have decoded, then give the entrance animation its moment.
       */
      await page
        .waitForFunction(
          () =>
            Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
          { timeout: 15_000 }
        )
        .catch(() => {});
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
    await admin.from('audit_log').delete().eq('actor_id', userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`\nCOULD NOT DELETE the shots admin ${email}: ${error.message}`);
    else console.log(`Shots admin ${email} removed.`);
  }
}
