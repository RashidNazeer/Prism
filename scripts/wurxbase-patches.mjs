#!/usr/bin/env node
/**
 * Re-apply OUR additions to the vendored WurxBase code.
 *
 * Run after `scripts/vendor-wurxbase.mjs` has pulled a new release in. Every
 * block below is fenced `WURX-ADDED ... WURX-END` in the file, and this script
 * is the only thing that puts them there, so the vendored copy is always
 * "theirs, plus exactly these blocks" and never a merge nobody can retrace.
 *
 * IT REFUSES RATHER THAN GUESSES. If an anchor has moved or appears twice, it
 * stops and says which block and why. A patch script that silently no-ops is
 * how you end up shipping a build with half a feature in it — and here the
 * feature is Ad spend and ROI, which somebody reads as money.
 *
 * IDEMPOTENT. A block already present is left alone, so running twice is safe.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/vendor/wurxbase/WurxUI.jsx';
let src = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');

let applied = 0, already = 0;
const fail = (msg) => { console.error('  FAIL  ' + msg); process.exitCode = 1; };

const PATCHES = [
  {
    "name": "the import",
    "mode": "prepend",
    "re": null,
    "anchor": null,
    "body": "/* WURX-ADDED · Ad Spend and ROI ─────────────────────────────────────────────\n   This file is otherwise a VERBATIM copy of the WurxBase app. Every change of\n   ours sits inside a WURX-ADDED ... WURX-END block, so pulling a newer version\n   from upstream is a find-and-reapply job rather than diff archaeology. Nothing\n   of theirs is edited or removed; these blocks only add.\n\n   The import reads OUR ad figures out of a React context that our own route\n   provides. It is NOT our Supabase client and names no project of ours, so this\n   file still cannot reach our database — which is what pnpm verify:isolation\n   asserts on every build. See src/routes/admin/collab-ad-figures.tsx.\n\n   The join needs no brand matching: their video links carry TikTok's numeric\n   video id, and that is the same id our ad figures are keyed on. */\nimport {\n  useCollabAdFigures as wxAdsHook,\n  videoIdsOf as wxVideoIds,\n  totalsOf as wxTotals,\n  tiktokVideoId as wxVideoId,\n  money as wxMoney,\n  roiText as wxRoi,\n} from '@/routes/admin/collab-ad-figures';\n/* WURX-END */\n"
  },
  {
    "name": "BrandDrilldown month effect",
    "mode": "afterRegex",
    "re": "function BrandDrilldown\\(\\{[^}]*\\}\\) \\{\\n",
    "anchor": null,
    "body": "  /* WURX-ADDED · tell our ad figures which month is on screen.\n\n     THIS IS THE WHOLE REASON THE COLUMNS MATCH THE ROW THEY SIT IN. Everything\n     else on this screen — the budget, the allocation, the GMV — is filtered by\n     the month selector above, so an ad spend summed over all time would be a\n     different period sitting in the same line of numbers, inviting a\n     comparison that is not valid. 'All Time' sends '' and means no bounds.\n\n     ONE COMPONENT OWNS THIS because only one brand drilldown is ever open, so\n     a single period is enough and every row and video panel below inherits it\n     without a prop being threaded through them. */\n  const wxSetMonth = wxAdsHook().setMonth;\n  useEffect(() => {\n    wxSetMonth(allTime ? '' : (month || ''));\n  }, [wxSetMonth, allTime, month]);\n  /* WURX-END */\n"
  },
  {
    "name": "creators list headers",
    "mode": "afterLast",
    "re": null,
    "anchor": "\n            <div className=\"pc-num\">Items sold</div>\n",
    "body": "            {/* WURX-ADDED · from OUR TikTok ads data, summed over this\n                creator's DISTINCT delivered videos. */}\n            <div className=\"pc-num\">Ad spend</div>\n            <div className=\"pc-num\">ROI</div>\n            {/* WURX-END */}\n"
  },
  {
    "name": "creator row figures",
    "mode": "afterLast",
    "re": null,
    "anchor": "\n  const profile = eukaProfileFor(euka, [c.tiktok_account, c.tiktok_account_2]);\n  const tier = creatorTier(c, euka);\n",
    "body": "  /* WURX-ADDED · our ad figures for this creator's videos.\n\n     DEDUPED BY TIKTOK VIDEO ID, which is about money rather than tidiness:\n     the same link can sit in video_codes twice after a bulk paste, and adding\n     its cost twice would inflate a brand's real ad spend.\n\n     ROI is revenue over cost computed from the SUMS, never an average of the\n     per-video ratios. A ratio cannot be summed; only this version agrees with\n     what TikTok itself reports. */\n  const wxAds = wxAdsHook();\n  const wxIds = wxVideoIds(c.video_codes);\n  wxAds.ensure(wxIds);\n  const wxT = wxTotals(wxAds.get, wxIds);\n  const wxNote = wxT.withData && wxT.withData < wxIds.length\n    ? ` · from ${wxT.withData} of ${wxIds.length} videos`\n    : '';\n  /* WURX-END */\n"
  },
  {
    "name": "creator row cells",
    "mode": "afterLast",
    "re": null,
    "anchor": "\n      <div className=\"pc-cell pc-num\" data-label=\"Items sold\">\n        {itemsSold > 0 ? <span className=\"pc-metric\">{kNum(itemsSold)}</span> : <span className=\"pc-handle\">-</span>}\n      </div>\n",
    "body": "      {/* WURX-ADDED · ad spend and ROI for this creator's videos.\n\n          A DASH IS NOT A ZERO. No ad data means we cannot answer, which is a\n          different statement from \"nothing was spent\" — and a wrong zero about\n          money is the kind somebody acts on. */}\n      <div className=\"pc-cell pc-num wx-collab-figure\" data-label=\"Ad spend\"\n        title={wxT.withData\n          ? 'Ad spend across this creator\\'s videos' + wxNote\n          : (wxIds.length ? 'No ad data for these videos' : 'No TikTok video links yet')}>\n        {wxT.withData && !wxT.mixedCurrency\n          ? <span className=\"pc-metric\">{wxMoney(wxT.cost, wxT.currency)}</span>\n          : <span className=\"pc-handle\">-</span>}\n      </div>\n      <div className=\"pc-cell pc-num wx-collab-figure\" data-label=\"ROI\"\n        title={wxT.roi === null\n          ? 'No ad spend, so there is no return to divide by it'\n          : wxMoney(wxT.revenue, wxT.currency) + ' back on ' + wxMoney(wxT.cost, wxT.currency) + wxNote}>\n        {wxT.roi === null\n          ? <span className=\"pc-handle\">-</span>\n          : <span className=\"pc-metric\">{wxRoi(wxT.roi)}</span>}\n      </div>\n      {/* WURX-END */}\n"
  },
  {
    "name": "videos panel hook",
    "mode": "afterLast",
    "re": null,
    "anchor": "\nfunction DrilldownVideosPanel({ c, euka, onUpdateCreator, onManage }) {\n",
    "body": "  /* WURX-ADDED · ad figures for the videos this panel lists. */\n  const wxAdsP = wxAdsHook();\n  wxAdsP.ensure(wxVideoIds(c.video_codes));\n  /* WURX-END */\n"
  },
  {
    "name": "card layout figures",
    "mode": "afterLast",
    "re": null,
    "anchor": "\n                  : <div className=\"pc-vxm-nocode\">No ad code yet</div>}\n",
    "body": "                {/* WURX-ADDED · the same two figures on the CARD layout.\n\n                    THERE ARE TWO LAYOUTS AND BOTH NEED THIS. Brands on EUKA get\n                    the table below; every other brand gets these cards. Adding\n                    the figures only to the table would have shipped a feature\n                    that worked on some brands and silently did nothing on the\n                    rest — and the brand somebody opened first would decide\n                    which impression they formed of it. */}\n                {(() => {\n                  const vid = wxVideoId(r.video);\n                  const f = vid ? wxAdsP.get(vid) : null;\n                  const roi = f && f.cost > 0 ? f.revenue / f.cost : null;\n                  return (\n                    <div className=\"wx-collab-vm-figures\">\n                      <span>\n                        <em>Ad spend</em>\n                        <b>{f && !f.mixedCurrency ? wxMoney(f.cost, f.currency) : '-'}</b>\n                      </span>\n                      <span>\n                        <em>ROI</em>\n                        <b>{roi === null ? '-' : wxRoi(roi)}</b>\n                      </span>\n                    </div>\n                  );\n                })()}\n                {/* WURX-END */}\n"
  },
  {
    "name": "per-video headers",
    "mode": "afterLast",
    "re": null,
    "anchor": "\n              <div className=\"pc-num\">Items sold</div>\n",
    "body": "              {/* WURX-ADDED · the same two figures, per video. */}\n              <div className=\"pc-num\">Ad spend</div>\n              <div className=\"pc-num\">ROI</div>\n              {/* WURX-END */}\n"
  },
  {
    "name": "per-video cells",
    "mode": "afterLast",
    "re": null,
    "anchor": "\n                <div className=\"pc-num\">{Number(r.items) > 0 ? kNum(r.items) : <span className=\"pc-vxp-dash\">-</span>}</div>\n",
    "body": "                {/* WURX-ADDED · what THIS video cost to advertise, and what came\n                    back. Keyed on TikTok's own video id, so it is exact. */}\n                {(() => {\n                  const vid = wxVideoId(r.video);\n                  const f = vid ? wxAdsP.get(vid) : null;\n                  const roi = f && f.cost > 0 ? f.revenue / f.cost : null;\n                  return (\n                    <>\n                      <div className=\"pc-num wx-collab-figure\">\n                        {f && !f.mixedCurrency\n                          ? <span className=\"pc-metric\">{wxMoney(f.cost, f.currency)}</span>\n                          : <span className=\"pc-vxp-dash\">-</span>}\n                      </div>\n                      <div className=\"pc-num wx-collab-figure\">\n                        {roi === null\n                          ? <span className=\"pc-vxp-dash\">-</span>\n                          : <span className=\"pc-metric\">{wxRoi(roi)}</span>}\n                      </div>\n                    </>\n                  );\n                })()}\n                {/* WURX-END */}\n"
  }
];

for (const p of PATCHES) {
  const marker = p.body.split('\n')[0].trim();
  if (src.includes(marker)) { console.log(`  skip  ${p.name} (already present)`); already++; continue; }

  if (p.mode === 'prepend') {
    src = p.body + src;
    console.log(`  ok    ${p.name} (prepended)`);
    applied++;
    continue;
  }

  if (p.mode === 'afterRegex') {
    const re = new RegExp(p.re);
    const m = re.exec(src);
    if (!m) { fail(`${p.name}: anchor /${p.re}/ not found`); continue; }
    const all = src.match(new RegExp(p.re, 'g')) || [];
    if (all.length !== 1) { fail(`${p.name}: anchor matched ${all.length} times`); continue; }
    src = src.slice(0, m.index + m[0].length) + p.body + src.slice(m.index + m[0].length);
    console.log(`  ok    ${p.name}`);
    applied++;
    continue;
  }

  const n = src.split(p.anchor).length - 1;
  if (n === 0) { fail(`${p.name}: anchor not found\n        ${p.anchor.trim().slice(0, 100)}`); continue; }
  if (n > 1) { fail(`${p.name}: anchor appears ${n} times, refusing to guess`); continue; }
  const at = src.indexOf(p.anchor) + p.anchor.length;
  src = src.slice(0, at) + p.body + src.slice(at);
  console.log(`  ok    ${p.name}`);
  applied++;
}

const a = (src.match(/WURX-ADDED/g) || []).length;
const b = (src.match(/WURX-END/g) || []).length;
if (a !== b) fail(`unbalanced markers: ${a} WURX-ADDED, ${b} WURX-END`);

if (process.exitCode) {
  console.error('\nNOTHING WRITTEN. Fix the anchors above and run again.');
} else {
  writeFileSync(FILE, src);
  console.log(`\n${applied} applied, ${already} already there. ${a} blocks in the file.`);
}
