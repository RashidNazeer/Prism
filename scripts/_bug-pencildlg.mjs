import { launchBrowser } from './browser.mjs';

const b = await launchBrowser();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text().slice(0,200)); });

await page.goto('http://localhost:4173/admin/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[name="email"]', 'asad@wurxmedia.com');
await page.fill('input[name="password"]', '1234567890');
await page.getByRole('button', { name: /^sign in$/i }).click();
await page.waitForURL(u => !/\/admin\/login/.test(String(u)), { timeout: 30000 }).catch(()=>{});
const hello = page.getByRole('button', { name: /let.s go/i });
if (await hello.first().isVisible().catch(()=>false)) await hello.first().click();
await page.goto('http://localhost:4173/admin/collabs/brands', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(25000);

// enumerate all buttons whose title mentions edit, plus pencil svgs
const inv = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button').forEach((el, i) => {
    const t = (el.getAttribute('title') || '') + '|' + (el.getAttribute('aria-label') || '') + '|' + (el.textContent||'').trim().slice(0,30);
    const hasPencilPath = !!el.querySelector('path[d*="18.5 2.5"], path[d*="M17 3a2.828"], path[d*="2.828"]');
    if (/edit/i.test(t) || hasPencilPath) {
      const r = el.getBoundingClientRect();
      out.push({ i, t, hasPencilPath, cls: el.className, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], visible: r.width>0 && r.height>0 });
    }
  });
  return out;
});
console.log('URL', page.url());
console.log('EDIT/PENCIL BUTTONS:', JSON.stringify(inv, null, 1));

const fenceInfo = await page.evaluate(() => {
  const f = document.querySelector('.wurxbase-fence');
  if (!f) return null;
  const cs = getComputedStyle(f);
  return { scrollTop: f.scrollTop, scrollHeight: f.scrollHeight, clientHeight: f.clientHeight, transform: cs.transform, contain: cs.contain, overflow: cs.overflow, height: cs.height };
});
console.log('FENCE:', JSON.stringify(fenceInfo));
console.log('WINDOW scrollY', await page.evaluate(()=>window.scrollY), 'docScrollHeight', await page.evaluate(()=>document.documentElement.scrollHeight));

await page.screenshot({ path: 'D:/Milestone/WurxMediaHub/shots/pencil-00-brands.png' });
await b.close();
