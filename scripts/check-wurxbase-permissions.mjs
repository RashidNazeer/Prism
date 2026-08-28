#!/usr/bin/env node
/**
 * Prove a person keeps THEIR OWN WurxBase permissions, not ones derived from
 * their role in our app.
 *
 *   pnpm build && pnpm preview
 *   SUPABASE_SERVICE_KEY=... node scripts/check-wurxbase-permissions.mjs
 *
 * WHY THIS MATTERS ON MONDAY. Their login was removed, so identity comes from
 * our auth, and the fallback mapping turns any `ops` account into their
 * `admin` — full edit on deals and money. Their team is five roles, and two of
 * them (Fahad, Lead) are VIEWERS. Rashid, asked about exactly this: "i dont
 * want any leak."
 *
 * So this creates a throwaway admin in OUR app, points a VIEWER row in
 * `wurxbase.app_users` at that email, and checks the person arrives as a
 * viewer — with the viewer's tabs in the sidebar, not the six an ops account
 * would otherwise have been handed.
 *
 * It borrows a real row rather than inventing one, because inventing one would
 * not prove the join works against the data that actually exists. The
 * `hub_email` it sets is put back to null in a finally.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { launchBrowser } from './browser.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY must be set');
if (/prod/i.test(env.VITE_SUPABASE_URL || '')) throw new Error('.env.local points at production. Refusing.');

const auth = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const wb = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'wurxbase' },
});

const pass = [];
const fail = [];
const check = (ok, msg, detail) => (ok ? pass : fail).push(detail ? `${msg} — ${detail}` : msg);

const ME = { email: `perm-${Date.now()}@wurx.test`, password: 'Perm!2026xy' };
let borrowed = null;
let browser;

try {
  /* A real viewer from their team. */
  const { data: viewers } = await wb.from('app_users').select('id,display,role').eq('role', 'viewer').order('id');
  if (!viewers?.length) throw new Error('no viewer row in wurxbase.app_users to borrow');
  borrowed = viewers[0];

  let created = null;
  for (let i = 0; i < 5 && !created?.data?.user; i++) {
    created = await auth.auth.admin.createUser({ email: ME.email, password: ME.password, email_confirm: true });
    if (!created?.data?.user) await new Promise((s) => setTimeout(s, 8000));
  }
  if (!created?.data?.user) throw new Error('could not create a throwaway admin');
  ME.id = created.data.user.id;
  /* ADMIN in our app — the most permissive role we have, on purpose. If the
     lookup works, it is overruled by the viewer row below. */
  await auth.from('profiles').update({ role: 'admin', is_active: true, display_name: 'Permission Probe' }).eq('id', ME.id);

  const link = await wb.from('app_users').update({ hub_email: ME.email }).eq('id', borrowed.id).select('id');
  if (link.error) throw new Error(`could not link the viewer row: ${link.error.message}`);

  browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', ME.email);
  await page.fill('input[name="password"]', ME.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !/\/admin\/login/.test(String(u)), { timeout: 30000 }).catch(() => {});
  const hello = page.getByRole('button', { name: /let.s go/i });
  if (await hello.first().isVisible().catch(() => false)) await hello.first().click();

  await page.goto(`${BASE}/admin/collabs/brands`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  /* 1. The session carries THEIR role, not the one derived from ours. */
  const session = await page.evaluate(() => {
    try { return JSON.parse(sessionStorage.getItem('ch_user') || 'null'); } catch { return null; }
  });
  check(
    session?.role === 'viewer',
    'an admin of ours arrives with the VIEWER role their own row carries',
    `role = ${session?.role ?? '(none)'} — 'superadmin' here would be the leak`,
  );

  /* 2. The sidebar offers only what a viewer can open. A viewer has no
        tabDiscovery, so that row must not be drawn. */
  const rows = (await page.locator('aside a[href^="/admin/collabs/"]').allTextContents()).map((t) => t.trim()).filter(Boolean);
  check(rows.length > 0, 'the sidebar still offers Paid Collabs rows', rows.join(' | '));
  check(
    !rows.some((r) => /discovery/i.test(r)),
    'Discovery is NOT offered to a viewer',
    rows.join(' | '),
  );

  /* 3. And the route agrees with the sidebar. */
  await page.goto(`${BASE}/admin/collabs/discovery`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  check(
    !page.url().includes('/collabs/discovery'),
    'asking for Discovery directly does not open it',
    `landed on ${page.url()}`,
  );
} finally {
  if (browser) await browser.close();
  if (borrowed) await wb.from('app_users').update({ hub_email: null }).eq('id', borrowed.id);
  if (ME.id) await auth.auth.admin.deleteUser(ME.id);
}

console.log('');
for (const p of pass) console.log(`  PASS  ${p}`);
for (const f of fail) console.log(`  FAIL  ${f}`);
console.log(`\n${pass.length} passed, ${fail.length} failed.`);
process.exit(fail.length ? 1 : 0);
