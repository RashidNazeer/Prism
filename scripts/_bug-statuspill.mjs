import { launchBrowser } from './browser.mjs';
const SHOTS = 'D:/Milestone/WurxMediaHub/shots';
const b = await launchBrowser();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,200)); });

await page.goto('http://localhost:4173/admin/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[name="email"]', 'asad@wurxmedia.com');
await page.fill('input[name="password"]', '1234567890');
await page.getByRole('button', { name: /^sign in$/i }).click();
await page.waitForURL(u => !/\/admin\/login/.test(String(u)), { timeout: 30000 }).catch(()=>{});
const hello = page.getByRole('button', { name: /let.s go/i });
if (await hello.first().isVisible().catch(()=>false)) await hello.first().click();
await page.goto('http://localhost:4173/admin/collabs/brands', { waitUntil: 'domcontentloaded' });

// wait for brand rows
await page.waitForSelector('.pc-bt-row', { timeout: 30000 }).catch(()=>console.log('NO .pc-bt-row'));
await page.waitForTimeout(3000);
console.log('URL', page.url());
console.log('brand rows', await page.locator('.pc-bt-row').count());

// session identity as their app sees it
const sess = await page.evaluate(() => sessionStorage.getItem('ch_user'));
console.log('ch_user =', sess);

// open first brand
await page.locator('.pc-bt-row').first().click();
await page.waitForTimeout(6000);
await page.waitForSelector('.pc-ct-row', { timeout: 30000 }).catch(()=>console.log('NO .pc-ct-row'));
await page.waitForTimeout(2000);
console.log('creator rows', await page.locator('.pc-ct-row').count());
await page.screenshot({ path: SHOTS + '/_bug-statuspill-1-table.png', fullPage: false });

// cell count vs track count
const geom = await page.evaluate(() => {
  const row = document.querySelector('.pc-ct-row');
  const head = document.querySelector('.pc-ct-head');
  if (!row) return { err: 'no row' };
  const cs = getComputedStyle(row);
  const out = {
    rowChildren: row.children.length,
    headChildren: head ? head.children.length : null,
    tracks: cs.gridTemplateColumns,
    trackCount: cs.gridTemplateColumns.split(' ').length,
    gap: cs.columnGap,
    headTracks: head ? getComputedStyle(head).gridTemplateColumns : null,
    cells: [...row.children].map(el => {
      const r = el.getBoundingClientRect();
      const kid = el.firstElementChild;
      const kr = kid ? kid.getBoundingClientRect() : null;
      return {
        label: el.getAttribute('data-label') || el.className,
        cellLeft: Math.round(r.left), cellRight: Math.round(r.right), cellW: Math.round(r.width),
        kid: kid ? kid.className : null,
        kidLeft: kr ? Math.round(kr.left) : null,
        kidRight: kr ? Math.round(kr.right) : null,
        kidW: kr ? Math.round(kr.width) : null,
        overflowX: getComputedStyle(el).overflowX,
      };
    }),
  };
  return out;
});
console.log(JSON.stringify(geom, null, 1));
await b.close();
