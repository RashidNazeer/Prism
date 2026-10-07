/* WURX-ADDED · Categorise button for Creative angle testing ──────────────────
   Every change of ours to this file sits inside a WURX-ADDED ... WURX-END block,
   so pulling a newer version from upstream is a find-and-reapply job. Nothing
   of theirs is edited or removed; these blocks only add.

   This imports OUR route component, which asks our `collab-angles` function to
   sort a brand-month's videos into angles. It is NOT a Supabase client and
   names no project of ours, so this file still cannot reach our database,
   which is what pnpm verify:isolation asserts on every build. Same arrangement
   as the ad figures in WurxUI.jsx. See
   src/routes/admin/collab-angle-categorise.tsx. */
import { CollabAngleCategorise } from '@/routes/admin/collab-angle-categorise';
/* WURX-END */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  getAngles, getAllAngles, getAngleMeta, saveAngles, fetchAngles, newAngleId, brandVideos, angleStats, videoFig, pruneAngle,
} from './angleStore';

/* ════════════════════════════════════════════════════════════════
   Creative Angle Testing

   One list, one card per angle, and the card is a drawer: the header
   always carries the five figures, so a shut angle still answers "how
   many videos, how many views, how much GMV, how much spend, what
   return" without being opened. Opening it shows the videos those
   figures came from, one row each.

   Views come off the video (EUKA). GMV does too, EXCEPT where the brand
   is not on EUKA at all, so every GMV cell can be typed over and the row
   says whether it is fetched or typed. Ad spend has no API anywhere, so
   it is typed per video. Both roll straight up into the header totals.
   ════════════════════════════════════════════════════════════════ */

const PALETTE = ['#1259C3', '#0E7A3A', '#6D28D9', '#C2410C', '#0B8793', '#B7791F', '#A6236B', '#4A4238'];
const PICK_KEY = 'wurx_angle_brand_v1';
const SHUT_KEY = 'wurx_angle_shut_v1';

const kNum = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v));
};
const ago = (iso) => {
  const t = Date.parse(iso);
  if (!t) return '';
  const sec = Math.max(0, (Date.now() - t) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const readSet = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k)) || []); } catch (e) { return new Set(); } };
const writeSet = (k, s) => { try { localStorage.setItem(k, JSON.stringify([...s])); } catch (e) {} };

export default function CreativeAngles({ creators, brand: brandProp, month, monthLabel, currentUser, money, canEdit = true, canType = true, onGoToMonth, onProvideExport }) {
  /* Read-only is a real state here, not a disabled-looking copy of the
     editable one: someone without the grant still needs to read the test,
     so the figures stay and only the ways of changing them go. */
  const [picked, setPicked] = useState(() => { try { return localStorage.getItem(PICK_KEY) || ''; } catch (e) { return ''; } });
  const [angles, setAngles] = useState([]);
  const [shut, setShut] = useState(() => readSet(SHUT_KEY));
  const [picking, setPicking] = useState(null);
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [undo, setUndo] = useState(null);

  /* Deleting an angle throws away figures that were typed by hand, so it
     asks first and then leaves the door open for five seconds. */
  useEffect(() => {
    if (!undo) return undefined;
    const t = setTimeout(() => setUndo(null), 5200);
    return () => clearTimeout(t);
  }, [undo]);

  const fmt = money || ((n) => '$' + Math.round(Number(n) || 0).toLocaleString());

  /* only brands that actually posted this month · offering a brand with
     nothing to file is a dead end */
  const choices = useMemo(() => {
    const m = {};
    (creators || []).forEach(c => {
      const b = (c.brand || '').trim();
      if (!b) return;
      const hire = String(c.hiring_date || '').slice(0, 7);
      (Array.isArray(c.video_codes) ? c.video_codes : []).forEach(v => {
        if (!v || !String(v.video || '').trim()) return;
        const vm = String(v.date || '').slice(0, 7) || hire;
        if (month && vm !== month) return;
        m[b] = (m[b] || 0) + 1;
      });
    });
    return Object.entries(m).map(([b, k]) => ({ brand: b, videos: k }))
      .sort((a, b) => b.videos - a.videos || a.brand.localeCompare(b.brand));
  }, [creators, month]);

  const brand = (brandProp && brandProp !== 'All')
    ? brandProp
    : (choices.some(c => c.brand === picked) ? picked : (choices[0] ? choices[0].brand : ''));

  const choose = (b) => { setPicked(b); try { localStorage.setItem(PICK_KEY, b); } catch (e) {} };

  /* The whole mirror, not just this brand+month, so an empty screen can say
     where the tests actually are. */
  const [all, setAll] = useState(() => getAllAngles());
  const reload = useCallback(() => {
    setAngles(getAngles(brand, month));
    setMeta(getAngleMeta(brand, month));
    setAll(getAllAngles());
  }, [brand, month]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    window.addEventListener('wurx-angles', reload);
    return () => window.removeEventListener('wurx-angles', reload);
  }, [reload]);

  const videos = useMemo(() => brandVideos(creators, brand, month), [creators, brand, month]);
  const index = useMemo(() => { const m = {}; videos.forEach(v => { m[v.url] = v; }); return m; }, [videos]);

  /* EVERY brand+month that actually holds angles, minus the one being looked
     at.
     WHY THIS EXISTS. Masifa set up four tests and Asad reported he could not
     see them. Nothing was wrong with his access — he is superadmin and the
     rows were already in his browser. The tests were saved against AUGUST and
     the report opens on the CURRENT month, so he was looking at an empty
     September and the screen said only "start your first angle". A test that
     is scoped to one brand in one cycle has to say which cycle, or it reads
     as data loss. */
  const elsewhere = useMemo(() => {
    return Object.entries(all || {})
      .map(([key, row]) => {
        const i = key.lastIndexOf('::');
        if (i < 0) return null;
        const n = Array.isArray(row && row.angles) ? row.angles.length : 0;
        if (!n) return null;
        return { brand: key.slice(0, i), month: key.slice(i + 2), count: n, savedBy: (row && row.savedBy) || '' };
      })
      .filter(Boolean)
      .filter(e => !(e.brand === brand && e.month === month))
      .sort((a, b) => b.month.localeCompare(a.month) || a.brand.localeCompare(b.brand));
  }, [all, brand, month]);

  const goTo = useCallback((e) => {
    if (e.month !== month && onGoToMonth) {
      const [y, m] = e.month.split('-');
      onGoToMonth(Number(y), Number(m) - 1);
    }
    choose(e.brand);
  }, [month, onGoToMonth]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* THE CSV THE TEAM FILLS IN BY HAND.

     One row per video, the angle named once at the top of its group — a CSV
     has no merged cells, and repeating the name down 66 rows is what makes a
     sheet unreadable. Views, GMV, ad spend and ROAS ship EMPTY on purpose:
     this is the sheet somebody fills in, not a report. */
  const exportAnglesCsv = useCallback(() => {
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Creative angle', 'Videos Link', 'Views', 'GMV', 'Ad Spend', 'ROAS']];
    (angles || []).forEach((a) => {
      const name = (a.title || '').trim() || 'Untitled angle';
      const urls = Array.isArray(a.videos) ? a.videos.filter(Boolean) : [];
      if (!urls.length) { rows.push([name, '', '', '', '', '']); return; }
      urls.forEach((u, i) => rows.push([i === 0 ? name : '', u, '', '', '', '']));
    });
    const csv = '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const safe = (t) => String(t || '').replace(/[\\\/:*?"<>|]+/g, ' ').trim();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safe(brand) + ' - ' + safe(monthLabel || month) + ' - creative angles.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [angles, brand, month, monthLabel]);

  /* ════════ IMPORTING THE FILLED-IN SHEET ════════════════════════════

     The same CSV comes back with Views, GMV and Ad Spend typed in, and each
     figure has to land on the exact video it was typed against. THE VIDEO
     LINK IS THE KEY — never the row order and never the angle name. A sheet
     that has been sorted, filtered, or had rows deleted in Excel is the
     normal case, not the exception, and matching on position would silently
     put one creator's ad spend on another creator's video.

     Nothing is written on file-open. The file is read, matched and counted,
     and what it WOULD change is shown first. This is money going onto rows;
     an import that just happens is an import nobody can check.

     A BLANK CELL MEANS "not provided", NOT "clear it". Someone filling in
     ad spend only must not wipe the GMV that is already there.

     ROAS is ignored on purpose. It is GMV over ad spend, computed on the
     way out; storing a typed one would let the sheet disagree with itself. */
  const [imported, setImported] = useState(null);   // the staged preview
  const fileRef = useRef(null);

  /* A CSV parser small enough to read: quotes, doubled quotes inside them,
     commas and newlines inside quotes, CRLF or LF, and a leading BOM. */
  const parseCsv = (text) => {
    const t = String(text || '').replace(/^\ufeff/, '');
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
  };

  const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z]/g, '');
  /* "$1,234.50" and " 4,576 " are what a spreadsheet hands back. */
  const num = (v) => {
    const raw = String(v == null ? '' : v).trim();
    if (raw === '') return null;
    const n = Number(raw.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  const readSheet = useCallback((text) => {
    const rows = parseCsv(text);
    if (!rows.length) return { error: 'That file is empty.' };
    const head = rows[0].map(norm);
    const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
    const cLink = col('videoslink', 'videolink', 'video', 'link', 'url');
    const cViews = col('views');
    const cGmv = col('gmv');
    const cAd = col('adspend', 'adspent', 'spend');
    if (cLink < 0) {
      return { error: 'No "Videos Link" column in that file. Export the sheet again and fill that one in.' };
    }

    /* every video that is actually in an angle on this brand + month */
    const home = new Map();
    angles.forEach((a) => (a.videos || []).forEach((u) => { if (!home.has(u)) home.set(u, a.id); }));

    const changes = [];       // { angleId, url, field, from, to }
    const unmatched = [];
    const bad = [];
    let seen = 0;

    for (let i = 1; i < rows.length; i++) {
      const link = String(rows[i][cLink] || '').trim();
      if (!link) continue;
      seen++;
      const angleId = home.get(link);
      if (!angleId) { unmatched.push(link); continue; }
      const angle = angles.find((a) => a.id === angleId);
      const fig = videoFig(angle, link, index);

      const want = [
        { field: 'viewsOverride', raw: cViews >= 0 ? rows[i][cViews] : '', api: fig.apiViews, now: fig.views },
        { field: 'gmvOverride',   raw: cGmv   >= 0 ? rows[i][cGmv]   : '', api: fig.apiGmv,   now: fig.gmv },
        { field: 'spend',         raw: cAd    >= 0 ? rows[i][cAd]    : '', api: null,         now: fig.ad },
      ];
      for (const w of want) {
        const n = num(w.raw);
        if (n === null) continue;                       // blank = not provided
        if (Number.isNaN(n)) { bad.push(link + ' · ' + w.field + ' = ' + w.raw); continue; }
        if (n === w.now) continue;                      // already that
        changes.push({ angleId, url: link, field: w.field, from: w.now, to: n, api: w.api });
      }
    }
    return { seen, changes, unmatched, bad, matched: seen - unmatched.length };
  }, [angles, index]);

  const onFile = useCallback((file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const res = readSheet(String(r.result || ''));
      setImported({ ...res, name: file.name });
    };
    r.onerror = () => setImported({ error: 'That file could not be read.', name: file.name });
    r.readAsText(file);
  }, [readSheet]);

  const applyImport = useCallback(() => {
    if (!imported || !imported.changes || !imported.changes.length) { setImported(null); return; }
    /* Mirror what typing does, exactly. A views or GMV figure that equals the
       figure EUKA already reports is stored as no override at all, so the
       sheet round-trips without leaving a manual flag on every row. Ad spend
       has no API value, so it is always stored. */
    const byAngle = new Map();
    imported.changes.forEach((c) => {
      if (!byAngle.has(c.angleId)) byAngle.set(c.angleId, []);
      byAngle.get(c.angleId).push(c);
    });
    const next = angles.map((a) => {
      const list = byAngle.get(a.id);
      if (!list) return a;
      const maps = { viewsOverride: { ...(a.viewsOverride || {}) }, gmvOverride: { ...(a.gmvOverride || {}) }, spend: { ...(a.spend || {}) } };
      list.forEach((c) => {
        if (c.field !== 'spend' && c.api != null && Number(c.to) === Number(c.api)) delete maps[c.field][c.url];
        else maps[c.field][c.url] = c.to;
      });
      return { ...a, ...maps };
    });
    const n = imported.changes.length;
    commit(next, 'Imported ' + n + ' figure' + (n === 1 ? '' : 's'));
    setImported(null);
  }, [imported, angles]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* The button lives in the Reporting header, one component up, so hand the
     function to it rather than drawing a second CSV button here. */
  useEffect(() => {
    if (onProvideExport) onProvideExport(exportAnglesCsv);
  }, [onProvideExport, exportAnglesCsv]);

  const assigned = useMemo(() => {
    const s = new Set();
    angles.forEach(a => (a.videos || []).forEach(u => s.add(u)));
    return s;
  }, [angles]);
  const pool = useMemo(() => videos.filter(v => !assigned.has(v.url)), [videos, assigned]);

  const rows = useMemo(() => angles.map((a, i) => ({
    ...a, stats: angleStats(a, index), colour: PALETTE[i % PALETTE.length],
  })), [angles, index]);

  /* Leading is judged on return where there is spend to judge it by, and
     on GMV where there is not · calling an angle best with no spend just
     rewards whichever one got the most videos. */
  const leadId = useMemo(() => {
    if (rows.length < 2) return null;
    const paid = rows.filter(r => r.stats.roas != null);
    if (paid.length >= 2) return [...paid].sort((a, b) => b.stats.roas - a.stats.roas)[0].id;
    const earning = rows.filter(r => r.stats.gmv > 0);
    if (earning.length >= 2) return [...earning].sort((a, b) => b.stats.gmv - a.stats.gmv)[0].id;
    return null;
  }, [rows]);

  async function commit(raw, msg) {
    const next = (raw || []).map(pruneAngle);
    setAngles(next);
    setSaving(true);
    try {
      const res = await saveAngles(brand, month, next, currentUser);
      setMeta({ savedBy: (currentUser && currentUser.display) || '', savedAt: (res && res.savedAt) || new Date().toISOString() });
      if (msg) { setNote(msg); setTimeout(() => setNote(null), 2200); }
    } catch (e) {
      /*
       * A REFUSAL IS NOT A FAILURE, AND MUST NOT READ LIKE ONE.
       *
       * The store now conditions every write on the revision this screen
       * loaded, so a save can come back refused for a reason that is nobody's
       * mistake: somebody else saved first, or this browser never managed to
       * load the test at all. Both used to end here as "Could not save", which
       * says the right thing about the write and the wrong thing about what to
       * do next — and in the second case the old code would already have
       * deleted the team's work by the time it printed anything.
       *
       * So say which it was. The reload is genuinely a repair now: it pulls
       * what the server actually holds, and the conflicting edit is one
       * keystroke to redo rather than an afternoon to reconstruct.
       */
      if (e && e.conflict) {
        setNote(e.current
          ? 'Changed by ' + (e.current.savedBy || 'someone else') + ' while you had this open. Reloaded.'
          : 'This test could not be loaded, so nothing was changed. Reloaded.');
        setTimeout(() => setNote(null), 5200);
        await fetchAngles().catch(() => {});
      } else {
        setNote('Could not save'); setTimeout(() => setNote(null), 2600);
      }
      reload();
    } finally {
      setSaving(false);
    }
  }
  const patch = (id, p, msg) => commit(angles.map(a => (a.id === id ? { ...a, ...p } : a)), msg);
  const addAngle = () => {
    const a = { id: newAngleId(), title: 'Angle ' + (angles.length + 1), videos: [], spend: {}, gmvOverride: {}, viewsOverride: {} };
    commit([...angles, a]);
  };
  const remove = (id) => {
    const at = angles.findIndex(a => a.id === id);
    if (at < 0) return;
    const gone = angles[at];
    setConfirmDel(null);
    commit(angles.filter(a => a.id !== id));
    setUndo({ angle: gone, at, stamp: Date.now() });
  };
  const undoDelete = () => {
    if (!undo) return;
    const next = [...angles];
    next.splice(Math.min(undo.at, next.length), 0, undo.angle);
    setUndo(null);
    commit(next, 'Angle restored');
  };
  /* pruneAngle strips whatever was typed against the video on the way
     out, so nothing is left behind to resurrect later */
  const detach = (id, url) => {
    const a = angles.find(x => x.id === id);
    patch(id, { videos: (a.videos || []).filter(u => u !== url) });
  };
  const attach = (id, urls) => {
    const a = angles.find(x => x.id === id);
    patch(id, { videos: [...new Set([...(a.videos || []), ...urls])] },
      urls.length + ' video' + (urls.length === 1 ? '' : 's') + ' added');
    setPicking(null);
  };

  /* a typed cell · an empty box clears it back to whatever the API says */
  const setCell = (id, field, url, raw) => {
    const a = angles.find(x => x.id === id);
    if (!a) return;
    const map = { ...(a[field] || {}) };
    const val = String(raw == null ? '' : raw).trim();
    if (val === '') delete map[url]; else map[url] = Number(val) || 0;
    patch(id, { [field]: map });
  };

  const toggle = (id) => setShut(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    writeSet(SHUT_KEY, n);
    return n;
  });

  const head = (
    <header className="cx-head">
      <span className="cx-h-ic" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3h6M10 3v6L5.2 17.4A2 2 0 0 0 6.9 20.5h10.2a2 2 0 0 0 1.7-3.1L14 9V3" /><path d="M8 15h8" />
        </svg>
      </span>
      <div className="cx-h-l">
        <h3>Creative angle testing</h3>
        <div className="cx-h-chips">
          <span className="cx-chip">{monthLabel}</span>
          {brand && (
            <span className="cx-chip">
              {videos.length} video{videos.length === 1 ? '' : 's'} posted
            </span>
          )}
          {rows.length > 0 && (
            <span className="cx-chip">{rows.length} angle{rows.length === 1 ? '' : 's'}</span>
          )}
          {brand && month && (
            <span className={'cx-saved' + (saving ? ' busy' : '')}>
              {saving ? 'Saving'
                : meta && meta.savedAt
                  ? 'Saved ' + ago(meta.savedAt) + (meta.savedBy ? ' by ' + meta.savedBy : '')
                  : 'Nothing saved yet'}
            </span>
          )}
        </div>
      </div>
      <div className="cx-h-r">
        {!canEdit && (
          <span className="cx-ro" title="You can read this test but not change it">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            View only
          </span>
        )}
        {choices.length > 0 && month && <BrandMenu choices={choices} value={brand} onPick={choose} />}
        {/* Import sits next to New angle because it is the other way figures
            get in. Gated on canType — the same capability that unlocks the
            cells it writes — so somebody who cannot type ad spend cannot
            paste a sheet of it either. */}
        {brand && month && canType && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => { onFile(e.target.files && e.target.files[0]); e.target.value = ''; }}
            />
            <button className="cx-import" onClick={() => fileRef.current && fileRef.current.click()}
              title="Upload the exported sheet with Views, GMV and Ad Spend filled in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 9 12 4 17 9" /><line x1="12" y1="4" x2="12" y2="16" />
              </svg>
              Import
            </button>
          </>
        )}
        {brand && month && canEdit && (
          <button className="cx-new" onClick={addAngle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New angle
          </button>
        )}
        {/* WURX-ADDED · the Categorise button, straight after New angle.

            It renders nothing unless there is a brand, a month and edit rights,
            so it needs no gate here. onFiled re-reads the angle store when the
            filer has put videos into angles, so the cards update without a
            reload. fetchAngles() is already imported above and its rejection is
            swallowed the same way App.jsx does at boot: a failed refresh is not
            worth an error on a screen that is otherwise working. */}
        <CollabAngleCategorise
          brand={brand}
          month={month}
          canEdit={canEdit}
          onFiled={() => { fetchAngles().catch(() => {}); }}
        />
        {/* WURX-END */}
      </div>
    </header>
  );

  if (!month) {
    return (
      <section className="cx">{head}
        <div className="cx-blank">
          <b>Pick a month</b>
          <span>A test compares hooks inside one cycle. Turn off All time and choose the month you are reporting on.</span>
          <Elsewhere items={elsewhere} onGo={goTo} jumpable={!!onGoToMonth} />
        </div>
      </section>
    );
  }
  if (!brand) {
    return (
      <section className="cx">{head}
        <div className="cx-blank">
          <b>Nothing posted in {monthLabel}</b>
          <span>There are no videos to test yet for this month.</span>
          <Elsewhere items={elsewhere} onGo={goTo} jumpable={!!onGoToMonth} />
        </div>
      </section>
    );
  }

  return (
    <section className="cx">
      {head}
      {note && <div className="cx-note">{note}</div>}

      {/* NOTHING HAS BEEN WRITTEN YET. This is what the file WOULD do. */}
      {imported && (
        <div className="cx-imp" role="status">
          {imported.error ? (
            <>
              <b>{imported.error}</b>
              <div className="cx-imp-act">
                <button className="cx-imp-b" onClick={() => setImported(null)}>Close</button>
              </div>
            </>
          ) : (
            <>
              <b>{imported.name}</b>
              <div className="cx-imp-rows">
                <span><u>{imported.matched}</u> of {imported.seen} rows matched a video in this test</span>
                <span className={imported.changes.length ? 'on' : ''}>
                  <u>{imported.changes.length}</u> figure{imported.changes.length === 1 ? '' : 's'} would change
                </span>
                {imported.unmatched.length > 0 && (
                  <span className="warn">
                    <u>{imported.unmatched.length}</u> link{imported.unmatched.length === 1 ? '' : 's'} not in this test — ignored
                  </span>
                )}
                {imported.bad.length > 0 && (
                  <span className="warn"><u>{imported.bad.length}</u> cell{imported.bad.length === 1 ? '' : 's'} were not numbers — skipped</span>
                )}
              </div>
              {imported.unmatched.length > 0 && (
                <details className="cx-imp-more">
                  <summary>Which links were ignored</summary>
                  <ul>{imported.unmatched.slice(0, 12).map((u, i) => <li key={i}>{u}</li>)}</ul>
                  {imported.unmatched.length > 12 && <p>…and {imported.unmatched.length - 12} more.</p>}
                </details>
              )}
              <div className="cx-imp-act">
                <button className="cx-imp-b" onClick={() => setImported(null)}>Cancel</button>
                <button className="cx-imp-b primary" disabled={!imported.changes.length} onClick={applyImport}>
                  {imported.changes.length ? 'Apply ' + imported.changes.length + ' change' + (imported.changes.length === 1 ? '' : 's') : 'Nothing to apply'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {rows.length === 0 && !canEdit ? (
        <div className="cx-blank">
          <b>No angles yet</b>
          <span>Nobody has set up a test for {brand} in {monthLabel}. You can read one here once it exists.</span>
          <Elsewhere items={elsewhere} onGo={goTo} jumpable={!!onGoToMonth} />
        </div>
      ) : rows.length === 0 ? (
        <div className="cx-blank">
          <b>Start your first angle</b>
          <span>
            An angle is the hook you are testing, something like "doctor explains" or "before and after".
            Add one, drop this month's videos into it, then type the ad spend behind each video.
          </span>
          <Elsewhere items={elsewhere} onGo={goTo} jumpable={!!onGoToMonth} />
          <button className="cx-new" onClick={addAngle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New angle
          </button>
        </div>
      ) : (
        <div className="cx-list">
          {rows.map(r => (
            <AngleCard key={r.id} r={r} n={rows.indexOf(r) + 1} open={!shut.has(r.id)} leading={leadId === r.id}
              index={index} fmt={fmt} poolLeft={pool.length} canEdit={canEdit} canType={canType}
              onToggle={() => toggle(r.id)}
              onRename={(t) => patch(r.id, { title: t.trim() || 'Untitled angle' })}
              onRemove={() => setConfirmDel(r.id)}
              onDetach={(url) => detach(r.id, url)}
              onCell={(field, url, val) => setCell(r.id, field, url, val)}
              onAdd={() => setPicking(r.id)} />
          ))}
        </div>
      )}

      {picking && (
        <Picker
          pool={pool} fmt={fmt}
          angles={rows.map((r, i) => ({ id: r.id, title: r.title, colour: r.colour, n: i + 1, count: (r.videos || []).length }))}
          activeId={picking}
          onCancel={() => setPicking(null)}
          onAdd={(urls, angleId) => attach(angleId || picking, urls)} />
      )}

      {confirmDel && (() => {
        const r = rows.find(x => x.id === confirmDel);
        if (!r) return null;
        return (
          <Confirm angle={r} n={rows.indexOf(r) + 1} fmt={fmt}
            onCancel={() => setConfirmDel(null)} onGo={() => remove(r.id)} />
        );
      })()}

      {undo && (
        <div className="cx-undo" key={undo.stamp}>
          <span className="cx-undo-ic" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M3.5 13a9 9 0 1 0 2.1-6.4L3 9" /></svg>
          </span>
          <b>{undo.angle.title} deleted</b>
          <button onClick={undoDelete}>Undo</button>
          <i className="cx-undo-bar" aria-hidden />
        </div>
      )}
    </section>
  );
}

/* ── one angle · a drawer that keeps its figures on the outside ── */
function AngleCard({ r, n, open, leading, index, fmt, poolLeft, canEdit, canType, onToggle, onRename, onRemove, onDetach, onCell, onAdd }) {
  const s = r.stats;
  const [q, setQ] = useState('');
  const [needOnly, setNeedOnly] = useState(false);

  /* Every video in the angle, with its figures resolved once. */
  const all = (r.videos || []).map(url => ({ url, f: videoFig(r, url, index) }));
  const needing = all.filter(x => !x.f.ad).length;

  /* A hundred videos in one angle is a page you scroll past, not a list
     you work in, so past a dozen the rows get their own scroll with the
     column headers pinned, plus a way to find one row without hunting. */
  const long = all.length > 12;
  const needle = q.trim().toLowerCase();
  const shown = all.filter(x => {
    if (needOnly && x.f.ad) return false;
    if (!needle) return true;
    const v = x.f.v;
    return !!v && ((v.creator || '').toLowerCase().includes(needle) || (v.product || '').toLowerCase().includes(needle));
  });
  return (
    <article className={'cx-card' + (open ? ' open' : '')} style={{ '--cx': r.colour }}>
      <div className="cx-c-head" onClick={onToggle}>
        <div className="cx-c-line">
          <span className="cx-num">{n}</span>
          <input className="cx-name" defaultValue={r.title} key={r.id + '|' + r.title} readOnly={!canEdit}
            onClick={e => e.stopPropagation()}
            onBlur={e => { if (canEdit && e.target.value !== r.title) onRename(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          {leading && <span className="cx-lead">Leading</span>}
          {canEdit && (
            <button className="cx-x" title="Delete angle"
              onClick={e => { e.stopPropagation(); onRemove(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
          <span className="cx-chev" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </span>
        </div>

        {/* the five figures live out here, so a shut angle still reports */}
        <div className="cx-sum">
          <span><b>{s.count}</b><small>videos</small></span>
          <span><b>{kNum(s.views)}</b><small>views</small></span>
          <span><b className="g">{fmt(s.gmv)}</b><small>GMV</small></span>
          <span><b className="a">{s.ad > 0 ? fmt(s.ad) : '-'}</b><small>ad spend</small></span>
          <span><b className={s.roas == null ? 'dim' : s.roas >= 2 ? 'great' : s.roas >= 1 ? 'ok' : 'bad'}>
            {s.roas != null ? s.roas.toFixed(2) + '×' : '-'}</b><small>ROAS</small></span>
        </div>
      </div>

      <div className="cx-drawer">
        <div className="cx-drawer-in">
          {s.count === 0 ? (
            <div className="cx-none">No videos in this angle yet.</div>
          ) : (
            <>
              {long && (
                <div className="cx-dtools">
                  <label className="cx-dfind">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
                    </svg>
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a creator in this angle" />
                    {q && (
                      <button type="button" onClick={() => setQ('')} title="Clear">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    )}
                  </label>
                  <button className={'cx-dchip' + (needOnly ? ' on' : '')}
                    disabled={needing === 0 && !needOnly}
                    onClick={() => setNeedOnly(v => !v)}>
                    Needs ad spend · {needing}
                  </button>
                  <span className="cx-dcount">{shown.length} of {all.length}</span>
                </div>
              )}

              <div className={'cx-tbl' + (long ? ' long' : '')}>
                <div className="cx-tr cx-th">
                  <span>Video</span>
                  <span className="n views">Views</span>
                  <span className="n">GMV</span>
                  <span className="n">Ad spend</span>
                  <span />
                </div>
                {shown.length === 0 && (
                  <div className="cx-dnone">Nothing here matches that.</div>
                )}
                {shown.map(({ url, f }) => (
                  <div key={url} className={'cx-tr' + (f.v ? '' : ' gone')}>
                    <a className="cx-who" href={url} target="_blank" rel="noreferrer">
                      {f.v && f.v.thumb ? <img src={f.v.thumb} alt="" loading="lazy" /> : <i>&#9654;</i>}
                      <span>
                        <b>{f.v ? (f.v.creator || 'Unnamed') : 'Not in this month'}</b>
                        <small>
                          {f.v
                            ? String(f.v.date || '').slice(0, 10) + (f.v.product ? ' · ' + f.v.product : '')
                            : url.replace(/^https?:\/\//, '').slice(0, 30)}
                        </small>
                      </span>
                      <u className="cx-go" title="Watch this video">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
                      </u>
                    </a>
                    <Cell kind="views" value={f.viewsManual ? f.views : (f.apiViews || '')}
                      auto={!f.viewsManual && f.apiViews > 0} locked={!canType} unit=""
                      onSave={v => onCell('viewsOverride', url, (String(v) === String(f.apiViews)) ? '' : v)} />
                    <Cell kind="gmv" value={f.manual ? f.gmv : (f.apiGmv || '')} auto={!f.manual && f.apiGmv > 0}
                      locked={!canType}
                      onSave={v => onCell('gmvOverride', url, (String(v) === String(f.apiGmv)) ? '' : v)} />
                    <Cell kind="ad" value={f.ad || ''} locked={!canType} onSave={v => onCell('spend', url, v)} />
                    {canEdit ? (
                      <button className="cx-rm" title="Remove from angle" onClick={() => onDetach(url)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    ) : <span />}
                  </div>
                ))}
              </div>
            </>
          )}

          {canEdit && <button className="cx-addv" onClick={onAdd} disabled={poolLeft === 0}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {poolLeft ? 'Add videos · ' + poolLeft + ' left' : 'Every video is filed'}
          </button>}
        </div>
      </div>
    </article>
  );
}

/* Deleting is the one action here that destroys typed work, so it stops
   and says exactly what is about to go. Everything else saves silently. */
function Confirm({ angle, n, fmt, onCancel, onGo }) {
  useEffect(() => {
    const key = e => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onGo();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onCancel, onGo]);

  const s = angle.stats;
  return (
    <div className="cx-cf-root" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="cx-cf">
        <span className="cx-cf-ic" style={{ background: angle.colour }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /><path d="M10 11v5M14 11v5" />
          </svg>
        </span>
        <b>Delete angle {n}?</b>
        <p>
          <em>{angle.title}</em> goes, and so does everything typed into it.
          {s.count > 0 && (
            <> Its {s.count} video{s.count === 1 ? '' : 's'} go back to the pool
              {s.ad > 0 ? ', and the ' + fmt(s.ad) + ' of ad spend on them is thrown away.' : ', untouched.'}
            </>
          )}
        </p>
        <div className="cx-cf-btns">
          <button className="cx-btn" onClick={onCancel}>Keep it</button>
          <button className="cx-btn danger" onClick={onGo}>Delete angle</button>
        </div>
        <small>You will get five seconds to undo.</small>
      </div>
    </div>
  );
}

/* A money cell · commits on blur or Enter. Emptying it hands the figure
   back to the API where the API has one. */
function Cell({ kind, value, auto, locked, unit, onSave }) {
  const [v, setV] = useState(value === '' || value == null ? '' : String(value));
  useEffect(() => { setV(value === '' || value == null ? '' : String(value)); }, [value]);
  return (
    <label className={'cx-cell ' + kind + (auto ? ' auto' : '') + (locked ? ' locked' : '')}>
      {/* the phone layout hides the column headers, so each cell says
          what it is · CSS shows this only where it is needed */}
      <u className="cx-k">{kind === 'ad' ? 'Ad spend' : kind === 'gmv' ? 'GMV' : 'Views'}</u>
      <i>{unit === undefined ? '$' : unit}</i>
      <input type="number" min="0" step="1" value={v} placeholder="0" readOnly={locked}
        onChange={e => { if (!locked) setV(e.target.value); }}
        onBlur={() => { if (!locked) onSave(v); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </label>
  );
}

/* ── brand chooser · a One UI sheet rather than a system dropdown ── */
/* "There is nothing here" is only half an answer when the work is one month
   away. This says where every existing test is and takes you to it. */
function Elsewhere({ items, onGo, jumpable }) {
  if (!items || !items.length) return null;
  const label = (m) => {
    const [y, mm] = String(m).split('-');
    const d = new Date(Number(y), Number(mm) - 1, 1);
    return isNaN(d) ? m : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };
  return (
    <div className="cx-else">
      <div className="cx-else-h">
        {items.length} test{items.length === 1 ? '' : 's'} already set up{jumpable ? ' — open one' : ''}
      </div>
      <div className="cx-else-list">
        {items.map((e) => (
          <button
            key={e.brand + '::' + e.month}
            type="button"
            className="cx-else-item"
            onClick={() => onGo(e)}
            title={(e.savedBy ? 'Set up by ' + e.savedBy + ' · ' : '') + e.brand + ' · ' + label(e.month)}
          >
            <span className="cx-else-brand">{e.brand}</span>
            <span className="cx-else-month">{label(e.month)}</span>
            <span className="cx-else-count">{e.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BrandMenu({ choices, value, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const cur = choices.find(c => c.brand === value);
  return (
    <div className={'cx-bm' + (open ? ' open' : '')} ref={ref}>
      <button className="cx-bm-b" onClick={() => setOpen(!open)}>
        <b>{value || 'Pick a brand'}</b>
        {cur && <i>{cur.videos}</i>}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="cx-bm-pop">
          {choices.map(c => (
            <button key={c.brand} className={'cx-bm-o' + (c.brand === value ? ' on' : '')}
              onClick={() => { onPick(c.brand); setOpen(false); }}>
              <b>{c.brand}</b>
              <small>{c.videos} video{c.videos === 1 ? '' : 's'}</small>
              {c.brand === value && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Choosing which video belongs to a hook is a judgement you make by
   WATCHING it, so every tile opens the real thing in a new tab before
   anything is filed, and carries the two figures that decide it: how
   far it travelled and what it earned. */
function Picker({ pool, fmt, angles, activeId, onCancel, onAdd }) {
  /* With one angle there is nothing to decide, so the button just adds.
     With more, the choice of WHICH angle is the whole point of the step,
     so it becomes the loudest thing in the footer: one button per angle,
     carrying that angle's own number and colour. */
  const many = angles.length > 1;
  const active = angles.find(a => a.id === activeId) || angles[0] || null;
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('gmv');
  const box = useRef(null);

  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? pool.filter(v => (v.creator || '').toLowerCase().includes(needle) || (v.product || '').toLowerCase().includes(needle))
      : [...pool];
    if (sort === 'views') list.sort((a, b) => b.views - a.views);
    else if (sort === 'new') list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    else list.sort((a, b) => b.gmv - a.gmv);
    return list;
  }, [pool, q, sort]);

  const toggle = (u) => setSel(prev => {
    const n = new Set(prev);
    if (n.has(u)) n.delete(u); else n.add(u);
    return n;
  });
  const allShown = shown.length > 0 && shown.every(v => sel.has(v.url));
  const toggleAll = () => setSel(prev => {
    const n = new Set(prev);
    if (allShown) shown.forEach(v => n.delete(v.url));
    else shown.forEach(v => n.add(v.url));
    return n;
  });

  const SORTS = [['gmv', 'Top GMV'], ['views', 'Most views'], ['new', 'Newest']];

  return (
    <div className="cx-pk-root" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="cx-pk" ref={box}>
        <div className="cx-pk-top">
          <span className="cx-pk-dot" style={{ background: active ? active.colour : '#2C2319' }} />
          <div className="cx-pk-say">
            <b>{many ? 'Pick videos, then choose an angle' : 'Add to ' + (active ? active.title : 'angle')}</b>
            <small>{pool.length} video{pool.length === 1 ? '' : 's'} not in an angle yet · tap the play button to watch one first</small>
          </div>
          <button className="cx-pk-close" onClick={onCancel} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="cx-pk-tools">
          <label className={'cx-pk-find' + (q ? ' filled' : '')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
            </svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search creator or product" />
            {q && (
              <button type="button" onClick={() => setQ('')} title="Clear">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            )}
          </label>
          <div className="cx-pk-sorts">
            {SORTS.map(([k, label]) => (
              <button key={k} className={'cx-pk-sort' + (sort === k ? ' on' : '')} onClick={() => setSort(k)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="cx-pk-bar">
          <span>{shown.length} shown{q ? ' of ' + pool.length : ''}</span>
          <button className="cx-pk-all" onClick={toggleAll} disabled={shown.length === 0}>
            {allShown ? 'Clear selection' : 'Select all ' + shown.length}
          </button>
        </div>

        <div className="cx-pk-grid">
          {shown.length === 0 && (
            <div className="cx-pk-none">
              <b>{q ? 'Nothing matches "' + q + '"' : 'Nothing left to add'}</b>
              <span>{q ? 'Try another creator or product name.' : 'Every video this month is already in an angle.'}</span>
            </div>
          )}
          {shown.map(v => {
            const on = sel.has(v.url);
            return (
              <div key={v.url} className={'cx-pk-v' + (on ? ' on' : '')} onClick={() => toggle(v.url)}>
                <div className="cx-pk-shot">
                  {v.thumb ? <img src={v.thumb} alt="" loading="lazy" /> : <i>▶</i>}
                  <span className="cx-pk-veil" />
                  <a className="cx-pk-play" href={v.url} target="_blank" rel="noreferrer"
                    title="Watch this video" onClick={e => e.stopPropagation()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
                  </a>
                  <span className="cx-pk-tick" aria-hidden>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                </div>
                <div className="cx-pk-meta">
                  <b>{v.creator || 'Unnamed'}</b>
                  <span className="cx-pk-figs">
                    <i>{kNum(v.views)} views</i>
                    <em className={v.gmv > 0 ? '' : 'zero'}>{v.gmv > 0 ? fmt(v.gmv) : 'no GMV'}</em>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {many && (
          <div className={'cx-pk-send' + (sel.size ? ' live' : '')}>
            <span className="cx-pk-send-h">
              {sel.size
                ? 'Add ' + sel.size + ' video' + (sel.size === 1 ? '' : 's') + ' to'
                : 'Choose videos above, then pick the angle'}
            </span>
            <div className="cx-pk-targets">
              {angles.map(a => (
                <button key={a.id} className={'cx-pk-target' + (a.id === activeId ? ' from' : '')}
                  style={{ '--cx': a.colour }} disabled={!sel.size}
                  onClick={() => onAdd([...sel], a.id)}>
                  <i>{a.n}</i>
                  <span>
                    <b>{a.title}</b>
                    <small>{a.count} video{a.count === 1 ? '' : 's'} so far</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cx-pk-foot">
          <span>{sel.size ? sel.size + ' selected' : 'Nothing selected yet'}</span>
          <button className="cx-btn" onClick={onCancel}>Cancel</button>
          {!many && (
            <button className="cx-btn on" disabled={!sel.size} onClick={() => onAdd([...sel], active && active.id)}>
              {sel.size ? 'Add ' + sel.size : 'Add'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
