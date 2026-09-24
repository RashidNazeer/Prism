#!/usr/bin/env node
/**
 * THE BY-PRODUCT BAND ON A BRAND'S PAGE.
 *
 *   pnpm build && pnpm preview
 *   node scripts/check-product-band.mjs
 *
 * Rashid, 2026-09-24: "is it possible to get the product wise gmv, product wise
 * creators and product wise videos ... a beautifully iconed and pilled style
 * display without disturbing the ui ... for the current month that user
 * selected".
 *
 * THE CHECK THAT MATTERS IS RECONCILIATION. A breakdown that does not add up to
 * the total directly above it is worse than no breakdown, because both numbers
 * look authoritative and only one can be right. The same TikTok video sits under
 * two deals of one creator 32 times in a single brand-month on dev, so a naive
 * per-product sum comes out HIGHER than the GMV card. This compares the pills'
 * GMV against that card's own `data-value`, as numbers.
 *
 * It also refuses to grade a brand that shows no pills at all — "0 pills, 0
 * discrepancy, everything reconciles" is the shape of lie this project keeps
 * catching.
 */
import { launchBrowser } from './browser.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
/* A brand with several products, and one with a single product, so a
   one-pill band cannot pass by accident. */
const BRANDS = (process.env.BAND_BRANDS || 'Penetrex,Apothecary,Biostime').split(',').map((s) => s.trim());

const pass = [], fail = [];
const check = (ok, m, d) => (ok ? pass : fail).push(d ? `${m} — ${d}` : m);

const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e.message).slice(0, 140)));

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', process.env.COLLAB_STAFF_EMAIL || 'asad@wurxmedia.com');
  await page.fill('input[name="password"]', process.env.COLLAB_STAFF_PASSWORD || '1234567890');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !/\/admin\/login/.test(String(u)), { timeout: 40000 }).catch(() => {});
  const hi = page.getByRole('button', { name: /let.s go/i });
  if (await hi.first().isVisible().catch(() => false)) await hi.first().click();

  const openBrand = async (brand) => {
    await page.goto(`${BASE}/admin/collabs/brands`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pc-bt-row, .pc-back', { timeout: 60000 }).catch(() => {});
    const back = page.locator('.pc-back');
    if (await back.first().isVisible().catch(() => false)) { await back.first().click(); await page.waitForTimeout(2500); }
    await page.waitForSelector('.pc-bt-row', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    const row = page.locator('.pc-bt-row')
      .filter({ has: page.locator('.pc-brandname', { hasText: new RegExp(`^\\s*${brand}\\s*$`) }) }).first();
    if (!(await row.count().catch(() => 0))) return false;
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await row.click();
    await page.waitForSelector('.pc-ct-row, .pc-empty', { timeout: 30000 });
    await page.waitForTimeout(1800);
    return true;
  };

  for (const brand of BRANDS) {
    if (!(await openBrand(brand))) { check(false, `${brand} is on the Brands screen`); continue; }

    const band = await page.evaluate(() => {
      const el = document.querySelector('[data-wx="product-band"]');
      if (!el) return null;
      const pills = [...document.querySelectorAll('[data-wx="product-pill"]')].map((p) => ({
        gmv: Number(p.getAttribute('data-gmv')),
        creators: Number(p.getAttribute('data-creators')),
        videos: Number(p.getAttribute('data-videos')),
        name: (p.querySelector('.wx-prodpill-name')?.textContent || '').trim(),
        stats: p.querySelectorAll('.wx-prodpill-stats > span').length,
        tile: !!p.querySelector('.wx-prodpill-name') && !!p.firstElementChild,
      }));
      const card = document.querySelector('.pc-topvids-stat.gmv');
      const head = (el.querySelector('.wx-prodband-head')?.textContent || '').trim();
      return {
        pills,
        cardGmv: card ? Number(card.getAttribute('data-value')) : null,
        head,
        rowScrollsInside: (() => {
          const r = el.querySelector('[data-wx="product-band-row"]');
          return r ? r.scrollWidth - r.clientWidth >= 0 && getComputedStyle(r).overflowX === 'auto' : false;
        })(),
        pageSideScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    if (!band) { check(false, `${brand}: the by-product band is on the page`); continue; }

    /* THE GUARD. Everything below is vacuous without pills. */
    check(band.pills.length > 0, `${brand}: the band shows at least one product`, `${band.pills.length} pills`);
    if (!band.pills.length) continue;

    const sumGmv = band.pills.reduce((t, p) => t + p.gmv, 0);
    const sumVideos = band.pills.reduce((t, p) => t + p.videos, 0);
    check(band.cardGmv !== null, `${brand}: the GMV card above it was readable`, String(band.cardGmv));
    if (band.cardGmv !== null) {
      /* Rounding per pill against one rounded total: a dollar per product. */
      const slack = Math.max(2, band.pills.length);
      check(Math.abs(sumGmv - band.cardGmv) <= slack,
        `${brand}: the products' GMV adds up to the GMV card above them`,
        `pills $${sumGmv} vs card $${band.cardGmv}`);
    }
    check(band.pills.every((p) => Number.isFinite(p.gmv) && Number.isFinite(p.creators) && Number.isFinite(p.videos)),
      `${brand}: every pill carries all three figures`);
    check(band.pills.every((p) => p.creators > 0 && p.videos > 0),
      `${brand}: no pill claims zero creators or zero videos`,
      band.pills.map((p) => `${p.creators}c/${p.videos}v`).join(' '));
    check(band.pills.every((p) => p.videos >= p.creators),
      `${brand}: a product never has more creators than videos`,
      band.pills.map((p) => `${p.creators}c/${p.videos}v`).join(' '));
    check(band.pills.every((p) => p.name.length > 0), `${brand}: every pill is named`);
    check(band.pills.every((p) => p.stats === 3), `${brand}: each pill shows exactly the three figures asked for`,
      band.pills.map((p) => p.stats).join(','));
    /* Sorted by GMV, biggest first. */
    const sorted = band.pills.every((p, i) => i === 0 || band.pills[i - 1].gmv >= p.gmv);
    check(sorted, `${brand}: the biggest earner is first`, band.pills.map((p) => p.gmv).join(' ≥ '));
    check(/by product/i.test(band.head) && /\d{4}|all time/i.test(band.head),
      `${brand}: the heading names the period on screen`, `"${band.head}"`);
    check(band.pageSideScroll <= 1, `${brand}: the band does not make the page scroll sideways`,
      `${band.pageSideScroll}px`);
    console.log(`  · ${brand}: ${band.pills.length} products · $${sumGmv} GMV · ${sumVideos} videos · card $${band.cardGmv}`);
  }

  /* ── every width, because this is a new row on a full screen ─────────── */
  for (const w of [375, 768, 1024, 1440]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 900 } });
    const p2 = await c2.newPage();
    await p2.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
    await p2.fill('input[name="email"]', process.env.COLLAB_STAFF_EMAIL || 'asad@wurxmedia.com');
    await p2.fill('input[name="password"]', process.env.COLLAB_STAFF_PASSWORD || '1234567890');
    await p2.getByRole('button', { name: /^sign in$/i }).click();
    await p2.waitForURL((u) => !/\/admin\/login/.test(String(u)), { timeout: 40000 }).catch(() => {});
    const hi2 = p2.getByRole('button', { name: /let.s go/i });
    if (await hi2.first().isVisible().catch(() => false)) await hi2.first().click();
    await p2.goto(`${BASE}/admin/collabs/brands`, { waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('.pc-bt-row, .pc-back', { timeout: 60000 }).catch(() => {});
    const b2 = p2.locator('.pc-back');
    if (await b2.first().isVisible().catch(() => false)) { await b2.first().click(); await p2.waitForTimeout(2500); }
    const row = p2.locator('.pc-bt-row').filter({ has: p2.locator('.pc-brandname', { hasText: /^\s*Penetrex\s*$/ }) }).first();
    if (!(await row.count().catch(() => 0))) { check(false, `${w}px: Penetrex row found`); await c2.close(); continue; }
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await row.click();
    await p2.waitForSelector('.pc-ct-row, .pc-empty', { timeout: 30000 });
    /* WAIT FOR THE BAND, not for a pause. The table's first row appears before
       the month's creators have all landed, and a fixed wait passed at two
       widths and failed at the other two — which read as a layout fault and was
       nothing but timing. */
    await p2.waitForSelector('[data-wx="product-pill"]', { timeout: 25000 }).catch(() => {});
    await p2.waitForTimeout(600);
    const m = await p2.evaluate(() => {
      const el = document.querySelector('[data-wx="product-band"]');
      const r = el?.querySelector('[data-wx="product-band-row"]');
      return {
        there: !!el,
        pills: document.querySelectorAll('[data-wx="product-pill"]').length,
        pageSideScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        /* Nothing inside may be wider than the band itself. */
        spills: el ? [...el.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().width > el.getBoundingClientRect().width + 1).length : -1,
        rowOverflow: r ? getComputedStyle(r).overflowX : null,
      };
    });
    check(m.there && m.pills > 0, `${w}px: the band is there with its pills`, `${m.pills} pills`);
    check(m.pageSideScroll <= 1, `${w}px: no horizontal page scroll`, `${m.pageSideScroll}px`);
    check(m.spills === 0, `${w}px: nothing spills out of the band`, `${m.spills} wider than the band`);
    await c2.close();
  }

  check(errors.length === 0, 'zero console errors', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log('');
for (const p of pass) console.log('  PASS  ' + p);
for (const f of fail) console.log('  FAIL  ' + f);
console.log(`\n${pass.length} passed, ${fail.length} failed.`);
process.exit(fail.length ? 1 : 0);
