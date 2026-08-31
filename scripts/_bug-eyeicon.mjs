import { launchBrowser } from './browser.mjs';

const SHOTS = 'D:/Milestone/WurxMediaHub/shots';
const b = await launchBrowser();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

await page.goto('http://localhost:4173/admin/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[name="email"]', 'asad@wurxmedia.com');
await page.fill('input[name="password"]', '1234567890');
await page.getByRole('button', { name: /^sign in$/i }).click();
await page.waitForURL(u => !/\/admin\/login/.test(String(u)), { timeout: 30000 }).catch(() => {});
const hello = page.getByRole('button', { name: /let.s go/i });
if (await hello.first().isVisible().catch(() => false)) await hello.first().click();

await page.goto('http://localhost:4173/admin/collabs/brands', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pc-bt-row', { timeout: 40000 });
await page.waitForTimeout(8000);
const brandRows = page.locator('.pc-bt-row');
console.log('brand rows:', await brandRows.count());
await brandRows.first().click();
await page.waitForTimeout(15000);
await page.screenshot({ path: SHOTS + '/_eye-03-drilldown.png' });
console.log('URL', page.url());
console.log('pc-actbtn count:', await page.locator('.pc-actbtn').count());
console.log('pc-ct-row count:', await page.locator('.pc-ct-row').count());
const cls = await page.evaluate(() => Array.from(new Set([...document.querySelectorAll('[class*="pc-"]')].map(e => String(e.className)))).slice(0, 200));
console.log(JSON.stringify(cls));
console.log('ERRORS', errs.slice(0, 10));
await b.close();
