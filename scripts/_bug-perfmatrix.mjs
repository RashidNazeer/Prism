import { launchBrowser } from './browser.mjs';
import fs from 'node:fs';

const OUT = 'D:/Milestone/WurxMediaHub/shots/perfmatrix';
fs.mkdirSync(OUT, { recursive: true });

const b = await launchBrowser();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0,160)); });

await page.goto('http://localhost:4173/admin/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[name="email"]', 'asad@wurxmedia.com');
await page.fill('input[name="password"]', '1234567890');
await page.getByRole('button', { name: /^sign in$/i }).click();
await page.waitForURL(u => !/\/admin\/login/.test(String(u)), { timeout: 30000 }).catch(()=>{});
const hello = page.getByRole('button', { name: /let.s go/i });
if (await hello.first().isVisible().catch(()=>false)) await hello.first().click();

await page.goto('http://localhost:4173/admin/collabs/brands', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(24000);

// Performance tab
await page.getByRole('button', { name: /^Performance$/ }).first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/02-performance-list.png`, fullPage: false });

// find Penetrex row
const names = await page.$$eval('*', () => []);
const pen = page.getByText(/Penetrex/i).first();
console.log('penetrex visible:', await pen.isVisible().catch(()=>false));
await pen.click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/03-matrix-top.png` });
console.log('URL', page.url());

// measurements
const info = await page.evaluate(() => {
  const wrap = document.querySelector('.pc-matrix-wrap');
  const head = document.querySelector('.pc-mx-head');
  const mx = document.querySelector('.pc-mx');
  const rows = document.querySelectorAll('.pc-mx-row').length;
  const locked = document.querySelectorAll('.pc-mx-locked').length;
  const pairs = document.querySelectorAll('.pc-mx-month-pair').length;
  const doc = document.documentElement;
  const out = {
    docScrollW: doc.scrollWidth, docClientW: doc.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    rows, locked, pairs,
    wrap: wrap && { sw: wrap.scrollWidth, cw: wrap.clientWidth, oxs: getComputedStyle(wrap).overflowX, rect: wrap.getBoundingClientRect().toJSON() },
    mx: mx && { sw: mx.scrollWidth, rect: mx.getBoundingClientRect().toJSON() },
    headTpl: head && head.style.gridTemplateColumns,
  };
  const tile = document.querySelector('.pc-mxh-tile');
  if (tile) { const cs = getComputedStyle(tile); out.tile = { w: tile.getBoundingClientRect().width, fs: cs.fontSize, text: tile.innerText }; }
  const inp = document.querySelector('.pc-mx-input');
  if (inp) { const cs = getComputedStyle(inp); out.input = { w: inp.getBoundingClientRect().width, h: inp.getBoundingClientRect().height, fs: cs.fontSize, ta: cs.textAlign, bg: cs.backgroundColor, color: cs.color }; }
  const lk = document.querySelector('.pc-mx-locked');
  if (lk) { const cs = getComputedStyle(lk); out.lockedCell = { rect: lk.getBoundingClientRect().toJSON(), color: cs.color, title: lk.getAttribute('title') }; }
  const frozen = document.querySelector('.pc-mx-frozen');
  if (frozen) out.frozen = { rect: frozen.getBoundingClientRect().toJSON(), pos: getComputedStyle(frozen).position };
  return out;
});
console.log(JSON.stringify(info, null, 1));

// horizontal scroll to the right end
await page.evaluate(() => { const w = document.querySelector('.pc-matrix-wrap'); if (w) w.scrollLeft = w.scrollWidth; });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/04-matrix-scrolled-right.png` });

// scroll page down so sticky header engages
await page.evaluate(() => window.scrollTo(0, 700));
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/05-sticky-head.png` });

const st = await page.evaluate(() => {
  const s = document.querySelector('.pc-mx-stickhead');
  const w = document.querySelector('.pc-matrix-wrap');
  return { stickPresent: !!s, stickScrollLeft: s && s.scrollLeft, wrapScrollLeft: w && w.scrollLeft,
    stickRect: s && s.getBoundingClientRect().toJSON(), wrapRect: w && w.getBoundingClientRect().toJSON(),
    stickCS: s && { pos: getComputedStyle(s).position, ox: getComputedStyle(s).overflowX, z: getComputedStyle(s).zIndex } };
});
console.log('STICK', JSON.stringify(st, null, 1));

// zoomed crop of a few rows
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
const clip = await page.evaluate(() => {
  const w = document.querySelector('.pc-matrix-wrap');
  const r = w.getBoundingClientRect();
  return { x: Math.max(0,r.left), y: Math.max(0,r.top), width: Math.min(r.width, 1500-r.left), height: Math.min(420, r.height) };
});
await page.screenshot({ path: `${OUT}/06-crop-rows.png`, clip });

await b.close();
