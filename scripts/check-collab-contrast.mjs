#!/usr/bin/env node
/**
 * Every piece of text inside Paid Collabs, measured against what is behind it.
 *
 * WHY THIS EXISTS. The vendored WurxBase stylesheet is re-themed by
 * `vendor-wurxbase.mjs`, and most of that mapping is inferred rather than
 * hand-written. The failure it produces is not an error: a label mapped to the
 * wrong token simply disappears into its own background, and the page still
 * renders, still passes every functional check, and looks fine in whichever
 * theme you happened to open. The first v382 pull put near-black creator names
 * on a near-black table and nothing anywhere complained.
 *
 * So this walks the rendered page, resolves the ACTUAL painted colours, and
 * reports the worst pairs. It is the only honest way to know, because the
 * source CSS cannot tell you what ends up on top of what.
 *
 * Needs a server:
 *   pnpm build; pnpm preview
 *   SUPABASE_SERVICE_KEY=... node scripts/check-collab-contrast.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
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
assertDevProject(env.VITE_SUPABASE_URL, 'check-collab-contrast.mjs');
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE) throw new Error('SUPABASE_SERVICE_KEY must be set');
const BASE = process.env.BASE_URL || 'http://localhost:4173';

/** WCAG AA for body text. Large text is allowed 3.0, so 3.0 is the hard floor. */
const FAIL_BELOW = 3.0;
const WARN_BELOW = 4.5;

const admin = createClient(env.VITE_SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
const stamp = Date.now();
const ME = { email: `contrast-${stamp}@wurx.test`, password: 'Contrast!2026' };

let pass = 0, fail = 0;
const ok = (l) => { console.log(`  PASS  ${l}`); pass++; };
const bad = (l, d) => { console.error(`  FAIL  ${l}${d ? `\n        ${d}` : ''}`); fail++; };

/* The measurement runs in the page: only there is the cascade resolved. */
const PROBE = () => {
  const lum = (c) => {
    const s = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  };
  const parse = (str) => {
    const m = /rgba?\(([^)]+)\)/.exec(str || '');
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));

  /*
   * WHAT IS ACTUALLY PAINTED BEHIND AN ELEMENT.
   *
   * Collect every translucent layer up the tree until an opaque one, then
   * composite from the BOTTOM UP. Doing it top-down, as the first version did,
   * loses the order that alpha depends on and throws besides.
   */
  const behind = (el) => {
    const stack = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      /*
       * A GRADIENT IS MEASURED AT ITS STOPS, not skipped.
       *
       * `getComputedStyle` gives no single colour for one, and the first
       * version therefore reported every gradient-backed element as
       * "unmeasured" and PASSED. That is how an unreadable hero card shipped:
       * 49 elements on the reporting screen were sitting on a gradient, and the
       * guard counted all 49 as fine. The stops are right there in the computed
       * value, so each one is composited and the WORST is what counts.
       */
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g);
        if (!stops || !stops.length) return null;         // a url() or similar
        const parsed = stops.map(parse).filter((c) => c && c.a > 0);
        if (!parsed.length) return null;
        /* Composite each stop over whatever is behind the gradient itself. */
        let under = [0, 0, 0];
        let p = n.parentElement;
        while (p && p !== document.documentElement) {
          const pc = parse(getComputedStyle(p).backgroundColor);
          if (pc && pc.a >= 0.999) { under = pc.rgb; break; }
          p = p.parentElement;
        }
        return { stops: parsed.map((c) => over(c, under)) };
      }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 0.999) break;
      }
      n = n.parentElement;
    }
    let base = [0, 0, 0];
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };

  const out = [];
  const root = document.querySelector('.wurxbase-root');
  if (!root) return out;
  for (const el of root.querySelectorAll('*')) {
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (!text || text.length < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.15) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) continue;
    /*
     * SVG TEXT IS PAINTED BY `fill`, NOT `color`.
     *
     * Reading `color` on a <text> gives whatever it inherited and has
     * nothing to do with what is on screen. It reported twelve chart labels
     * as white on white while their `fill` was a perfectly readable muted
     * token: twelve invented failures, on the one screen with real ones.
     */
    const isSvgText = el.ownerSVGElement != null || el.tagName === 'text' || el.tagName === 'tspan';
    const fg = parse(isSvgText ? cs.fill : cs.color);
    if (!fg || fg.a < 0.15) continue;
    const bgAny = behind(el);
    if (!bgAny) { out.push({ unmeasured: true, text: text.slice(0, 24) }); continue; }

    /* A gradient gives several grounds; the text has to survive the worst. */
    const grounds = bgAny.stops ? bgAny.stops : [bgAny];
    let ratio = Infinity;
    let bg = grounds[0];
    for (const g of grounds) {
      const f = over(fg, g);
      const L1 = lum(f), L2 = lum(g);
      const r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (r < ratio) { ratio = r; bg = g; }
    }
    ratio = Math.round(ratio * 100) / 100;
    out.push({
      text: text.slice(0, 32),
      ratio,
      onGradient: Boolean(bgAny.stops),
      fg: isSvgText ? cs.fill : cs.color,
      bg: `rgb(${bg.map(Math.round).join(',')})`,
      size: Math.round(parseFloat(cs.fontSize)),
      cls: (el.className || '').toString().split(' ').slice(0, 2).join(' '),
      path: (() => {
        const bits = [];
        let n = el;
        for (let i = 0; i < 3 && n && n !== document.documentElement; i++) {
          const c = (n.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
          bits.unshift(c ? `${n.tagName.toLowerCase()}.${c}` : n.tagName.toLowerCase());
          n = n.parentElement;
        }
        return bits.join(' > ');
      })(),
    });
  }
  return out;
};

let browser;
try {
  const { data, error } = await admin.auth.admin.createUser({
    email: ME.email, password: ME.password, email_confirm: true,
  });
  if (error) throw error;
  ME.id = data.user.id;
  await admin.from('profiles').update({ role: 'admin', is_active: true }).eq('id', ME.id);

  browser = await launchBrowser();

  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    await ctx.addInitScript(({ t }) => {
      localStorage.setItem('wurxmediahub-theme', t);
      /* SUPERADMIN, not the 'lead' viewer this used to use. A viewer has no
         tabDiscovery capability, so /admin/collabs/discovery correctly bounces
         them to Brands and the sixth screen was never measured at all. The
         point of this guard is to see every surface, which means signing in as
         the role that can reach every surface. */
      sessionStorage.setItem('ch_user', JSON.stringify({ id: 'asad', username: 'Asad', role: 'superadmin', display: 'Asad' }));
    }, { t: theme });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', ME.email);
    await page.fill('input[name="password"]', ME.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL((u) => !/\/admin\/login/.test(String(u)), { timeout: 30_000 }).catch(() => {});
    const hello = page.getByRole('button', { name: /let.s go/i });
    if (await hello.first().isVisible().catch(() => false)) await hello.first().click();

    await page.goto(`${BASE}/admin/collabs`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3200);

    console.log(`\n[${theme}]`);
    /*
     * EVERY TAB, AND THE OMISSION HERE IS WHY A BAD RESKIN SHIPPED.
     *
     * The first version checked four of the six and reported "8 checks passed",
     * which read as "the reskin is verified". Reporting and Discovery were
     * never opened, and Reporting was the worst screen in the build: unreadable
     * text on a brown hero and an off-palette blue footer. A guard that covers
     * part of a surface and reports a pass is worse than no guard, because it
     * is believed.
     */
    /*
     * NAVIGATE BY URL, AND PROVE THE SCREEN CHANGED.
     *
     * This used to click a button named after each tab. On 2026-08-28 the six
     * tabs became six routes in our own sidebar and the rail inside the app was
     * removed, so `if (await b.count())` found nothing, skipped silently, and
     * this guard measured the SAME screen six times while printing six passes.
     * It went from "11 of 12" to "12 of 12" on a change that touched no colour.
     *
     * That is the third time a check here has passed by not looking. So the
     * fingerprint below is not defensive tidiness: two tabs in a row that
     * render an identical set of labels is now a FAILURE, because the only
     * innocent explanation is that navigation stopped working.
     */
    let lastPrint = null;
    for (const [tab, slug] of [
      ['Brands', 'brands'],
      ['Creators', 'creators'],
      ['Performance', 'performance'],
      ['Reporting', 'reporting'],
      ['Leaderboard', 'leaderboard'],
      ['Discovery', 'discovery'],
    ]) {
      await page.goto(`${BASE}/admin/collabs/${slug}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2200);

      if (!page.url().includes(`/admin/collabs/${slug}`)) {
        bad(`${tab}: asked for /admin/collabs/${slug} and landed on ${page.url()}`);
        continue;
      }

      const all = await page.evaluate(PROBE);
      const unmeasured = all.filter((r) => r.unmeasured).length;
      const results = all.filter((r) => !r.unmeasured);
      if (results.length === 0) { bad(`${tab}: nothing measurable rendered, so this check is vacuous`); continue; }

      /* What this screen actually says, cheaply. Identical to the previous tab
         means the route did not take us anywhere. */
      const print = `${results.length}|${results.slice(0, 12).map((r) => r.text).join('~')}`;
      if (print === lastPrint) {
        bad(`${tab}: rendered exactly what the previous tab did — navigation is not working, so this check would be measuring the same screen twice`);
        lastPrint = print;
        continue;
      }
      lastPrint = print;


      const failures = results.filter((r) => r.ratio < FAIL_BELOW);
      const warns = results.filter((r) => r.ratio >= FAIL_BELOW && r.ratio < WARN_BELOW);

      if (failures.length === 0) {
        ok(
          `${tab}: ${results.length} text elements, worst ${Math.min(...results.map((r) => r.ratio))}:1` +
            `${warns.length ? `, ${warns.length} below AA` : ''}` +
            `${unmeasured ? `, ${unmeasured} on gradients not measurable` : ''}`
        );
      } else {
        /* Group, so one bad token does not print two hundred times. */
        const byPair = new Map();
        for (const f of failures) {
          const k = `${f.fg} on ${f.bg}`;
          const e = byPair.get(k) ?? { n: 0, ratio: f.ratio, sample: f.text, cls: f.cls, path: f.path };
          e.n++;
          byPair.set(k, e);
        }
        bad(
          `${tab}: ${failures.length} of ${results.length} text elements below ${FAIL_BELOW}:1`,
          [...byPair]
            .sort((a, b) => b[1].n - a[1].n)
            .slice(0, 6)
            .map(([k, v]) => `${String(v.n).padStart(4)}x  ${v.ratio}:1  ${k}\n              "${v.sample}"  at  ${v.path}`)
            .join('\n        ')
        );
      }
    }
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  if (ME.id) await admin.auth.admin.deleteUser(ME.id);
}

console.log('\n' + '='.repeat(70));
if (fail) {
  console.error(`${fail} failed, ${pass} passed. Text is disappearing into its background.\n`);
  process.exit(1);
}
console.log(`${pass} checks passed. Every label is readable on what is actually behind it.\n`);
