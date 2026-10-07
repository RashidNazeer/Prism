import React, { useState, useMemo } from 'react';
import { supabase, selectAll } from './supabaseClient';
import {
  GOD_DEFAULTS, godGet, godSet, godReset, godMoney, godDate,
  CREATOR_COLS, KEY,
} from './godSettings';

export { applyGod, godGet as loadGod } from './godSettings';

/* ════════════════════════════════════════════════════════════════
   GOD MODE · superadmin control centre

   Two kinds of switch live here and they are kept visibly apart:

   · Everything in Appearance, Format, Navigation, Columns and Rules is
     LOCAL to this browser and reversible. Each one drives a real CSS
     variable or a real value the app reads at render time, so it works
     the instant it is set. Nothing in these panes can damage data.

   · Brands is REAL. Rename, merge and delete rewrite the creators table,
     so each states how many rows it will touch and the destructive path
     demands the brand name typed out. A brand is only text on a creator
     row, which is exactly why "Bios Time" and "Biostime" could drift
     apart, and why rename and merge belong here as proper tools.
   ════════════════════════════════════════════════════════════════ */

const SWATCHES = [
  ['#1259C3', 'Signal blue'], ['#0E7A3A', 'Forest'], ['#6D28D9', 'Violet'],
  ['#C2410C', 'Ember'], ['#0B8793', 'Teal'], ['#B7791F', 'Amber'],
  ['#A6236B', 'Magenta'], ['#2C2319', 'Coffee'],
];
const ALL_TABS = [
  { id: 'brands', label: 'Brands' }, { id: 'creators', label: 'Creators' },
  { id: 'performance', label: 'Performance' }, { id: 'reporting', label: 'Reporting' },
  { id: 'leaderboard', label: 'Leaderboard' }, { id: 'discovery', label: 'Discovery' },
];
const ICON = {
  look: 'M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H13a1 1 0 0 1 0-2h3a5 5 0 0 0 5-5c0-3.9-4-6-9-6z',
  format: 'M4 7V4h16v3M9 20h6M12 4v16',
  nav: 'M3 6h18M3 12h18M3 18h18',
  cols: 'M4 4h4v16H4zM10 4h4v16h-4zM16 4h4v16h-4z',
  rules: 'M4 6h16M4 12h10M4 18h7M18 15l2 2 3-3',
  brands: 'M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10',
  backup: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
};
const PANES = [
  ['look', 'Appearance', 'Colour, shape, density'],
  ['format', 'Format', 'Money and dates'],
  ['nav', 'Navigation', 'Tabs and order'],
  ['cols', 'Columns', 'The creators table'],
  ['rules', 'Rules', 'Thresholds the app reads'],
  ['brands', 'Brands', 'Rename, merge, delete'],
  ['backup', 'Backup', 'Carry or reset'],
];

export default function GodMode({ creators, allBrands, currentUser, onClose, onRefresh }) {
  const [pane, setPane] = useState('look');
  const [g, setGState] = useState(godGet);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);

  /* one write path · saves, applies the CSS variables and tells the rest
     of the app, so no control can update in isolation */
  const set = (patch) => setGState(godSet({ ...g, ...patch }));
  const say = (msg, tone) => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3200); };

  const tabOrder = useMemo(() => {
    const ids = g.tabs && g.tabs.length ? g.tabs : ALL_TABS.map(t => t.id);
    const known = ids.filter(id => ALL_TABS.some(t => t.id === id));
    return [...known, ...ALL_TABS.map(t => t.id).filter(id => !known.includes(id))];
  }, [g.tabs]);

  const colOrder = useMemo(() => {
    const ids = g.cols && g.cols.length ? g.cols : CREATOR_COLS.map(c => c.id);
    const known = ids.filter(id => CREATOR_COLS.some(c => c.id === id));
    return [...known, ...CREATOR_COLS.map(c => c.id).filter(id => !known.includes(id))];
  }, [g.cols]);

  const brandRows = useMemo(() => {
    const m = {};
    creators.forEach(c => {
      const b = (c.brand || '').trim();
      if (!b) return;
      if (!m[b]) m[b] = { brand: b, deals: 0, people: new Set() };
      m[b].deals += 1;
      const k = (c.name || '').trim().toLowerCase();
      if (k) m[b].people.add(k);
    });
    (allBrands || []).forEach(b => { if (b && !m[b]) m[b] = { brand: b, deals: 0, people: new Set() }; });
    return Object.values(m).map(x => ({ ...x, creators: x.people.size }))
      .sort((a, b) => b.deals - a.deals || a.brand.localeCompare(b.brand));
  }, [creators, allBrands]);

  return (
    <div className="gm-root" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gm-box">
        {/* A rail rather than a row of tabs: seven destinations do not fit
            comfortably across the top, and a vertical list gives each one
            room for the line of context that says what it governs. */}
        <aside className="gm-rail">
          <div className="gm-brandmark">
            <span className="gm-mark">GOD</span>
            <div>
              <b>God Mode</b>
              <small>{currentUser?.display || 'superadmin'}</small>
            </div>
          </div>
          <nav className="gm-nav">
            {PANES.map(([id, label, hint]) => (
              <button key={id} className={'gm-navb' + (pane === id ? ' on' : '')} onClick={() => setPane(id)}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[id]} /></svg>
                <span><b>{label}</b><small>{hint}</small></span>
              </button>
            ))}
          </nav>
          <div className="gm-railfoot">Changes save as you make them</div>
        </aside>

        <div className="gm-main">
          <div className="gm-head">
            <div>
              <h2>{(PANES.find(x => x[0] === pane) || [])[1]}</h2>
              <p>{(PANES.find(x => x[0] === pane) || [])[2]}</p>
            </div>
            <button className="gm-x" onClick={onClose} title="Close">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <div className="gm-body">
          {pane === 'look' && <Look g={g} set={set} />}
          {pane === 'format' && <Format g={g} set={set} />}
          {pane === 'nav' && <Nav g={g} set={set} order={tabOrder} />}
          {pane === 'cols' && <Cols g={g} set={set} order={colOrder} />}
          {pane === 'rules' && <Rules g={g} set={set} />}
          {pane === 'brands' && <Brands rows={brandRows} allBrands={allBrands} busy={busy} setBusy={setBusy} say={say} onRefresh={onRefresh} />}
          {pane === 'backup' && <Backup g={g} setGState={setGState} say={say} />}
          </div>
        </div>

        {toast && <div className={'gm-toast ' + (toast.tone || '')}>{toast.msg}</div>}
      </div>
    </div>
  );
}

/* ── Appearance ─────────────────────────────────────────────── */
function Look({ g, set }) {
  return (
    <>
      <Sec t="Accent colour" n="Every control, link and selected state across the app">
        <div className="gm-swatches">
          {SWATCHES.map(([hex, name]) => (
            <button key={hex} title={name} style={{ background: hex, color: hex }}
              className={'gm-sw' + (g.accent.toLowerCase() === hex.toLowerCase() ? ' on' : '')}
              onClick={() => set({ accent: hex })}>
              {g.accent.toLowerCase() === hex.toLowerCase() && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              )}
            </button>
          ))}
          <label className="gm-sw custom" title="Any colour you like">
            <input type="color" value={g.accent} onChange={e => set({ accent: e.target.value })} />
            <span>+</span>
          </label>
        </div>
        <div className="gm-hex">{g.accent.toUpperCase()}</div>
      </Sec>

      <Sec t="Surface" n="The paper the whole app is printed on">
        <Seg v={g.surface} on={v => set({ surface: v })}
          o={[['neutral', 'Neutral'], ['warm', 'Warm'], ['cool', 'Cool'], ['paper', 'Paper']]} />
      </Sec>

      <Sec t="Card style" n="How cards separate from the background">
        <Seg v={g.cardStyle} on={v => set({ cardStyle: v })}
          o={[['elevated', 'Elevated'], ['flat', 'Flat'], ['outlined', 'Outlined']]} />
      </Sec>

      <Sec t="Table lines" n="Gridlines can help or crowd, depending on the table">
        <Seg v={g.tableLines} on={v => set({ tableLines: v })}
          o={[['grid', 'Full grid'], ['rows', 'Rows only'], ['clean', 'Clean']]} />
      </Sec>

      <Sec t="Density" n="Air between rows and inside cards">
        <Seg v={g.density} on={v => set({ density: v })}
          o={[['comfy', 'Comfortable'], ['cozy', 'Cozy'], ['compact', 'Compact']]} />
      </Sec>

      <Sec t="Corner style" n="Cards, inputs and menus">
        <Seg v={g.radius} on={v => set({ radius: v })}
          o={[['sharp', 'Sharp'], ['soft', 'Soft'], ['round', 'Round'], ['pill', 'Pill']]} />
        <div className="gm-shapes">
          {[['sharp', '8px'], ['soft', '12px'], ['round', '16px'], ['pill', '22px']].map(([k, r]) => (
            <i key={k} className={'gm-shape' + (g.radius === k ? ' on' : '')}
              style={{ borderRadius: r }} onClick={() => set({ radius: k })} />
          ))}
        </div>
      </Sec>

      <Sec t="Avatar shape" n="Creator and brand pictures">
        <Seg v={g.avatar} on={v => set({ avatar: v })}
          o={[['circle', 'Circle'], ['squircle', 'Squircle'], ['square', 'Square']]} />
      </Sec>

      <Sec t="Text size" n={g.fontScale + '% of normal'}>
        <div className="gm-slider">
          <span>A</span>
          <input type="range" min="90" max="115" step="5" value={g.fontScale}
            onChange={e => set({ fontScale: Number(e.target.value) })} />
          <span className="big">A</span>
        </div>
      </Sec>

      <Sec t="Motion" n="Turn animation down if it gets in the way">
        <Seg v={g.motion} on={v => set({ motion: v })} o={[['full', 'Full'], ['reduced', 'Reduced']]} />
      </Sec>
    </>
  );
}

/* ── Format ─────────────────────────────────────────────────── */
function Format({ g, set }) {
  const sample = 201482.5;
  return (
    <>
      <Sec t="Money" n="Applies to every figure in every tab, chart and export">
        <Seg v={g.numbers} on={v => set({ numbers: v })}
          o={[['full', 'Full'], ['compact', 'Compact']]} />
        <div className="gm-row2">
          <label className="gm-check">
            <input type="checkbox" checked={!!g.cents} onChange={e => set({ cents: e.target.checked })} />
            <span>Show cents</span>
          </label>
          <div className="gm-cur">
            <small>Symbol</small>
            <div className="gm-chips">
              {['$', '£', '€', '₨', '₹'].map(c => (
                <button key={c} className={'gm-chip' + (g.currency === c ? ' on' : '')} onClick={() => set({ currency: c })}>{c}</button>
              ))}
            </div>
          </div>
        </div>
        <Preview label="Looks like">{godMoney(sample)}</Preview>
      </Sec>

      <Sec t="Dates" n="Onboarded columns and every date shown in a row">
        <Seg v={g.dateStyle} on={v => set({ dateStyle: v })}
          o={[['short', "Aug 20 ’26"], ['long', '20 Aug 2026'], ['iso', '2026-08-20']]} />
        <Preview label="Looks like">{godDate('2026-08-20')}</Preview>
      </Sec>
    </>
  );
}

/* ── Navigation ─────────────────────────────────────────────── */
function Nav({ g, set, order }) {
  const move = (id, d) => {
    const i = order.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order]; next[i] = next[j]; next[j] = id;
    set({ tabs: next });
  };
  const toggle = (id) => {
    const off = (g.hidden || []).includes(id);
    const hidden = off ? g.hidden.filter(x => x !== id) : [...(g.hidden || []), id];
    /* never let the last tab go, and never strand the opening tab */
    if (hidden.length >= order.length) return;
    const patch = { hidden };
    if (!off && g.home === id) patch.home = order.find(t => !hidden.includes(t));
    set(patch);
  };
  const label = (id) => (g.labels || {})[id] || ALL_TABS.find(t => t.id === id).label;
  const visible = order.filter(id => !(g.hidden || []).includes(id));

  return (
    <>
      <Sec t="Tabs" n="Switch off what you do not use, reorder with the arrows, rename any of them">
        <div className="gm-list">
          {order.map((id, i) => {
            const off = (g.hidden || []).includes(id);
            return (
              <div key={id} className={'gm-item' + (off ? ' off' : '')}>
                <span className="gm-ord">{i + 1}</span>
                <input className="gm-rename" value={label(id)}
                  onChange={e => set({ labels: { ...(g.labels || {}), [id]: e.target.value } })}
                  placeholder={ALL_TABS.find(t => t.id === id).label} />
                <button className="gm-arrow" disabled={i === 0} onClick={() => move(id, -1)} title="Move up">↑</button>
                <button className="gm-arrow" disabled={i === order.length - 1} onClick={() => move(id, 1)} title="Move down">↓</button>
                <button className={'gm-switch' + (off ? '' : ' on')} onClick={() => toggle(id)}
                  title={off ? 'Show this tab' : 'Hide this tab'}><i /></button>
              </div>
            );
          })}
        </div>
        {Object.keys(g.labels || {}).length > 0 && (
          <button className="gm-link" onClick={() => set({ labels: {} })}>Reset all names</button>
        )}
      </Sec>

      <Sec t="Opening tab" n="Where the app lands when you sign in">
        <div className="gm-chips">
          {visible.map(id => (
            <button key={id} className={'gm-chip' + (g.home === id ? ' on' : '')} onClick={() => set({ home: id })}>{label(id)}</button>
          ))}
        </div>
      </Sec>
    </>
  );
}

/* ── Columns ────────────────────────────────────────────────── */
function Cols({ g, set, order }) {
  const move = (id, d) => {
    const i = order.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order]; next[i] = next[j]; next[j] = id;
    set({ cols: next });
  };
  const toggle = (id) => {
    const off = (g.colsOff || []).includes(id);
    const colsOff = off ? g.colsOff.filter(x => x !== id) : [...(g.colsOff || []), id];
    if (colsOff.length >= order.length) return;
    set({ colsOff });
  };
  const shown = order.length - (g.colsOff || []).length;

  return (
    <Sec t="Creators table" n={`${shown} of ${order.length} columns showing · the table rebuilds itself around whatever you leave on`}>
      <div className="gm-list">
        {order.map((id, i) => {
          const c = CREATOR_COLS.find(x => x.id === id);
          const off = (g.colsOff || []).includes(id);
          return (
            <div key={id} className={'gm-item' + (off ? ' off' : '')}>
              <span className="gm-ord">{i + 1}</span>
              <span className="gm-item-l">{c.label}</span>
              <button className="gm-arrow" disabled={i === 0} onClick={() => move(id, -1)} title="Move left">↑</button>
              <button className="gm-arrow" disabled={i === order.length - 1} onClick={() => move(id, 1)} title="Move right">↓</button>
              <button className={'gm-switch' + (off ? '' : ' on')} onClick={() => toggle(id)}><i /></button>
            </div>
          );
        })}
      </div>
      <button className="gm-link" onClick={() => set({ cols: null, colsOff: [] })}>Back to the default columns</button>
    </Sec>
  );
}

/* ── Rules ──────────────────────────────────────────────────── */
function Rules({ g, set }) {
  return (
    <>
      <Sec t="Brand goes inactive after" n="How many quiet months before Performance parks a brand under Inactive. A manual drag still wins.">
        <Stepper v={g.staleMonths} min={1} max={12} suffix={g.staleMonths === 1 ? 'month' : 'months'}
          on={v => set({ staleMonths: v })} />
      </Sec>
      <Sec t="Discovery page size" n="Rows loaded per page in the sourcing pool">
        <Seg v={String(g.discoverySize)} on={v => set({ discoverySize: Number(v) })}
          o={[['20', '20'], ['40', '40'], ['60', '60'], ['100', '100']]} />
      </Sec>
      <Sec t="Leaderboard opens on" n="The Top N the Leaderboard tab starts with">
        <Seg v={String(g.leaderTop)} on={v => set({ leaderTop: Number(v) })}
          o={[['3', 'Top 3'], ['5', 'Top 5'], ['10', 'Top 10'], ['20', 'Top 20'], ['50', 'Top 50'], ['0', 'Everyone']]} />
      </Sec>
    </>
  );
}

/* ── Brands · the one pane that writes to the database ──────── */
function Brands({ rows, allBrands, busy, setBusy, say, onRefresh }) {
  const [open, setOpen] = useState(null);
  const [mode, setMode] = useState(null);
  const [val, setVal] = useState('');
  const [confirm, setConfirm] = useState('');
  const [q, setQ] = useState('');

  const start = (b, m) => { setOpen(b); setMode(m); setVal(''); setConfirm(''); };
  const close = () => { setOpen(null); setMode(null); setVal(''); setConfirm(''); };

  /* every write goes through one path so paging, chunking, the error
     branch and the refresh behave identically for all three actions */
  async function writeBrand(from, to) {
    const { data, error } = await selectAll(() => supabase
      .from('creators').select('id').eq('brand', from).order('id'));
    if (error) throw error;
    const ids = (data || []).map(r => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error: e2 } = to === null
        ? await supabase.from('creators').delete().in('id', chunk)
        : await supabase.from('creators').update({ brand: to }).in('id', chunk);
      if (e2) throw e2;
    }
    return ids.length;
  }

  async function run() {
    const row = rows.find(r => r.brand === open);
    if (!row) return;
    try {
      setBusy(open);
      if (mode === 'rename' || mode === 'merge') {
        const to = val.trim();
        if (!to) { say('Give the brand a name first', 'bad'); setBusy(''); return; }
        if (to === open) { say('That is already the name', 'bad'); setBusy(''); return; }
        const k = await writeBrand(open, to);
        say(`${mode === 'merge' ? 'Merged' : 'Renamed'} ${open} into ${to}, ${k} record${k === 1 ? '' : 's'} updated`, 'good');
      } else {
        if (confirm.trim() !== open) { say('Type the brand name exactly to confirm', 'bad'); setBusy(''); return; }
        const k = await writeBrand(open, null);
        try {
          const cb = JSON.parse(localStorage.getItem('customBrands') || '[]');
          localStorage.setItem('customBrands', JSON.stringify(cb.filter(x => x !== open)));
        } catch (e) {}
        say(`Deleted ${open} and ${k} record${k === 1 ? '' : 's'}`, 'good');
      }
      close();
      onRefresh && onRefresh();
    } catch (e) { say('Failed: ' + (e.message || 'unknown error'), 'bad'); }
    setBusy('');
  }

  const list = q.trim() ? rows.filter(r => r.brand.toLowerCase().includes(q.trim().toLowerCase())) : rows;

  return (
    <Sec t="Brands" n="A brand is text on a creator row, so renaming one rewrites every record carrying it">
      <input className="gm-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search brands..." />
      <div className="gm-list">
        {list.map(r => (
          <div key={r.brand} className="gm-brand">
            <div className="gm-brand-head">
              <span className="gm-b-name">{r.brand}</span>
              <span className="gm-b-count">{r.deals} deal{r.deals === 1 ? '' : 's'} · {r.creators} creator{r.creators === 1 ? '' : 's'}</span>
              <span className="gm-b-acts">
                <button onClick={() => start(r.brand, 'rename')}>Rename</button>
                <button onClick={() => start(r.brand, 'merge')}>Merge</button>
                <button className="bad" onClick={() => start(r.brand, 'delete')}>Delete</button>
              </span>
            </div>
            {open === r.brand && (
              <div className="gm-drawer">
                {mode === 'rename' && (<>
                  <p>Rename <b>{r.brand}</b>. All <b>{r.deals}</b> of its records are updated, nothing is deleted.</p>
                  <input className="gm-input" value={val} onChange={e => setVal(e.target.value)} placeholder="New brand name" autoFocus />
                </>)}
                {mode === 'merge' && (<>
                  <p>Move all <b>{r.deals}</b> records onto another brand. <b>{r.brand}</b> then disappears on its own, because no record carries it any more.</p>
                  <select className="gm-input" value={val} onChange={e => setVal(e.target.value)}>
                    <option value="">Choose the brand to merge into...</option>
                    {(allBrands || []).filter(b => b !== r.brand).map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </>)}
                {mode === 'delete' && (<>
                  <p className="warn">
                    This deletes <b>{r.brand}</b> and permanently removes its <b>{r.deals}</b> creator record{r.deals === 1 ? '' : 's'}.
                    {r.deals > 0 && ' If you only want the brand gone, use Merge instead so the work is kept.'}
                  </p>
                  <input className="gm-input" value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder={'Type ' + r.brand + ' to confirm'} autoFocus />
                </>)}
                <div className="gm-drawer-btns">
                  <button className="gm-btn" onClick={close}>Cancel</button>
                  <button className={'gm-btn ' + (mode === 'delete' ? 'danger' : 'primary')}
                    disabled={busy === r.brand} onClick={run}>
                    {busy === r.brand ? 'Working...' : mode === 'rename' ? 'Rename brand' : mode === 'merge' ? 'Merge brand' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="gm-empty">No brand matches that search</div>}
      </div>
    </Sec>
  );
}

/* ── Backup ─────────────────────────────────────────────────── */
function Backup({ g, setGState, say }) {
  const exportIt = () => {
    const blob = new Blob([JSON.stringify(g, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wurx-godmode-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    say('Settings downloaded', 'good');
  };
  const importIt = (file) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const parsed = JSON.parse(fr.result);
        /* only keys we know · a stray file cannot inject anything */
        const clean = {};
        Object.keys(GOD_DEFAULTS).forEach(k => { if (k in parsed) clean[k] = parsed[k]; });
        setGState(godSet({ ...GOD_DEFAULTS, ...clean }));
        say('Settings restored', 'good');
      } catch (e) { say('That file is not a settings backup', 'bad'); }
    };
    fr.readAsText(file);
  };

  return (
    <>
      <Sec t="Carry your setup" n="Everything on these panes travels as one small file, so a new browser or a second machine starts where you left off">
        <div className="gm-drawer-btns" style={{ justifyContent: 'flex-start' }}>
          <button className="gm-btn primary" onClick={exportIt}>Download settings</button>
          <label className="gm-btn" style={{ cursor: 'pointer' }}>
            Restore from file
            <input type="file" accept="application/json" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) importIt(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      </Sec>

      <Sec t="Reset" n="Only touches how this browser looks and behaves, never the database">
        <div className="gm-danger">
          <div>
            <b>Back to defaults</b>
            <small>Accent, surface, density, corners, text, columns, tab order and rules all reset.</small>
          </div>
          <button className="gm-btn danger" onClick={() => { setGState(godReset()); say('Everything back to defaults', 'good'); }}>Reset</button>
        </div>
        <div className="gm-note">
          Brand renames, merges and deletions are not undone by this. Those rewrite the
          creators table and can only be reversed by renaming back or re-entering records.
          <br />Stored under <code>{KEY}</code> in this browser.
        </div>
      </Sec>
    </>
  );
}

/* ── shared pieces ──────────────────────────────────────────── */
function Sec({ t, n, children }) {
  return (
    <section className="gm-sec">
      <div className="gm-sec-h"><b>{t}</b>{n && <small>{n}</small>}</div>
      {children}
    </section>
  );
}
function Seg({ v, on, o }) {
  return (
    <div className="gm-seg">
      {o.map(([val, label]) => (
        <button key={val} className={'gm-seg-b' + (v === val ? ' on' : '')} onClick={() => on(val)}>{label}</button>
      ))}
    </div>
  );
}
function Stepper({ v, min, max, suffix, on }) {
  return (
    <div className="gm-step">
      <button onClick={() => on(Math.max(min, v - 1))} disabled={v <= min}>−</button>
      <span><b>{v}</b>{suffix}</span>
      <button onClick={() => on(Math.min(max, v + 1))} disabled={v >= max}>+</button>
    </div>
  );
}
function Preview({ label, children }) {
  return <div className="gm-prev"><small>{label}</small><b>{children}</b></div>;
}
