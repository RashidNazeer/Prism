#!/usr/bin/env node
/**
 * The Brand Hub, as a creator sees it, every section, both themes, four widths.
 *
 * Rashid checks work in a browser and cannot read a console, so a section is
 * not "enabled" until somebody has looked at it on a phone and on a laptop in
 * dark and light. This signs in as a REAL dev creator with real money at the
 * real brand, walks every tab, and photographs it.
 *
 * It writes nothing. No throwaway creator, no seeded rows: it uses a creator
 * who already has approved videos, so what is photographed is what Rashid will
 * see when he signs in as the same person.
 *
 * Usage, with `pnpm build && pnpm preview` running in another shell:
 *   SUPABASE_SERVICE_KEY=... node scripts/shots-hub.mjs [baseUrl]
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

assertDevProject(env.VITE_SUPABASE_URL, 'shots-hub.mjs');
const BASE = process.argv[2] ?? 'http://localhost:4173';
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE) throw new Error('SUPABASE_SERVICE_KEY must be set');

const admin = createClient(env.VITE_SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
const PASSWORD = '1234567890';
const OUT = 'shots/hub';
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { w: 375, h: 900, name: 'phone' },
  { w: 768, h: 1100, name: 'tablet' },
  { w: 1024, h: 900, name: 'laptop' },
  { w: 1440, h: 950, name: 'desktop' },
];
const SECTIONS = ['overview', 'offers', 'numbers', 'contests', 'leaderboards'];

const { data: brand } = await admin.from('brands').select('id, name, slug').limit(1).single();

/* The creator with the most money at that brand: the most that can look wrong. */
const { data: subs } = await admin
  .from('content_submissions')
  .select('creator_id')
  .eq('brand_id', brand.id)
  .eq('status', 'approved');
const tally = {};
for (const r of subs ?? []) tally[r.creator_id] = (tally[r.creator_id] ?? 0) + 1;
const creatorId = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
const { data: who } = await admin
  .from('profiles')
  .select('email, display_name')
  .eq('id', creatorId)
  .single();

console.log(`\n${brand.name} hub, as ${who.display_name} <${who.email}>`);
console.log(`Sections: ${SECTIONS.join(', ')}\n`);

const errors = [];

async function settle(page) {
  /*
   * NOT `networkidle`. These screens hold a realtime socket open, so the network
   * is never idle and the wait times out on every single shot.
   *
   * And NOT a bare `.every()` over images either: `[].every()` is true, so a
   * page whose pictures have not started loading would report itself ready and
   * be photographed as a grey box. Wait for the skeletons to go, then for the
   * images only if there ARE any.
   */
  await page
    .waitForFunction(() => document.querySelectorAll('.wx-skeleton').length === 0, {
      timeout: 20000,
    })
    .catch(() => {});
  await page
    .waitForFunction(
      () => {
        const imgs = [...document.images];
        return imgs.length === 0 || imgs.every((i) => i.complete);
      },
      { timeout: 10000 }
    )
    .catch(() => {});
  await page.waitForTimeout(400);
}

const browser = await launchBrowser();
try {
  for (const theme of ['dark', 'light']) {
    for (const { w, h, name } of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      await ctx.addInitScript(
        ([t]) => window.localStorage.setItem('wurxmediahub-theme', t),
        [theme]
      );
      const page = await ctx.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`[${theme} ${name}] ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`[${theme} ${name}] ${e.message}`));

      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await page.fill('input[name="email"]', who.email);
      await page.fill('input[name="password"]', PASSWORD);
      await page.getByRole('button', { name: /^sign in$/i }).click();
      await page.waitForURL('**/app**', { timeout: 30000 }).catch(() => {});
      const hello = page.getByRole('button', { name: /let.s go/i });
      if (await hello.first().isVisible({ timeout: 4000 }).catch(() => false)) {
        await hello.first().click();
      }

      for (const section of SECTIONS) {
        const q = section === 'overview' ? '' : `?section=${section}`;
        await page.goto(`${BASE}/app/brands/${brand.slug}${q}`, {
          waitUntil: 'domcontentloaded',
        });
        await settle(page);
        const file = `${OUT}/${theme}-${name}-${section}.png`;
        await page.screenshot({ path: file, fullPage: true });

        // No horizontal page scroll, at any width. Checked, not assumed.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        const flag = overflow > 1 ? `  <-- PAGE SCROLLS ${overflow}px SIDEWAYS` : '';
        console.log(`  ${theme.padEnd(5)} ${String(w).padStart(4)}px ${section.padEnd(13)} ${file}${flag}`);
        if (overflow > 1) errors.push(`[${theme} ${name}] ${section} scrolls ${overflow}px sideways`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of [...new Set(errors)]) console.error(`  ${e}`);
  process.exit(1);
}
console.log('\nEvery section, both themes, four widths. No console errors, no sideways scroll.\n');
