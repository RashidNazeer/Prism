import { launchBrowser } from './browser.mjs';
const OUT = 'D:/Milestone/WurxMediaHub/shots';
const b = await launchBrowser();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type()==='error') console.log('  [err]', m.text().slice(0,180)); });
await page.goto('http://localhost:4173/admin/login', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[name="email"]', { timeout: 20000 });
await page.fill('input[name="email"]', 'asad@wurxmedia.com');
await page.fill('input[name="password"]', '1234567890');
await page.getByRole('button', { name: /^sign in$/i }).click();
await page.waitForURL(u => !/\/admin\/login/.test(String(u)), { timeout: 40000 }).catch(e => console.log('no url change'));
console.log('after signin url:', page.url());
await page.waitForTimeout(3000);
console.log('now url:', page.url());
const hello = page.getByRole('button', { name: /let.s go/i });
if (await hello.first().isVisible().catch(()=>false)) { console.log('clicking hello'); await hello.first().click(); }
await page.waitForTimeout(2000);
await page.goto('http://localhost:4173/admin/collabs/brands', { waitUntil: 'domcontentloaded' });
for (let i=0;i<15;i++){
  await page.waitForTimeout(2000);
  const info = await page.evaluate(()=>({u:location.href, ct:document.querySelectorAll('.pc-ct-row').length, cards:document.querySelectorAll('[class*="pc-"]').length, txt:document.body.innerText.slice(0,600)}));
  console.log(i, info.u, 'ctrows=',info.ct, 'pcels=',info.cards);
  if (info.cards>0) { console.log(info.txt); break; }
}
await page.screenshot({ path: `${OUT}/_sweep-brands-1500.png`, fullPage:false });
const cls = await page.evaluate(()=>{const s=new Set();document.querySelectorAll('*').forEach(el=>{const c=el.getAttribute&&el.getAttribute('class');if(typeof c==='string')c.split(/\s+/).forEach(x=>{if(/^pc-/.test(x))s.add(x)})});return [...s].sort()});
console.log('PC CLASSES:', cls.join(' '));
await ctx.close(); await b.close();
