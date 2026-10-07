import React, { useState, useMemo, useEffect, useRef } from 'react';

/* ════════════════════════════════════════════════════════════════
   SQL Quest · learn SQL by playing
   Replaces the old read-only SQL Playground. Nothing here touches the
   real database: the game runs against a tiny in-memory pet shop, so a
   wrong answer costs nothing and anyone can experiment freely.

   The query is held as a STRUCTURE, not a string · every block you tap
   edits that structure, the SQL text is rendered from it, and the rows
   are computed from it too. That means the sentence on screen and the
   result underneath can never disagree, which is the whole point when
   somebody is learning what each keyword actually does.
   ════════════════════════════════════════════════════════════════ */

const PETS = [
  { id: 1, name: 'Bruno',   kind: 'dog',  emoji: '🐶', age: 5, price: 120, owner_id: 1 },
  { id: 2, name: 'Mittens', kind: 'cat',  emoji: '🐱', age: 2, price: 80,  owner_id: 2 },
  { id: 3, name: 'Chirpy',  kind: 'bird', emoji: '🐦', age: 1, price: 30,  owner_id: 1 },
  { id: 4, name: 'Rocky',   kind: 'dog',  emoji: '🐕', age: 7, price: 150, owner_id: 3 },
  { id: 5, name: 'Bubbles', kind: 'fish', emoji: '🐠', age: 1, price: 15,  owner_id: 2 },
  { id: 6, name: 'Luna',    kind: 'cat',  emoji: '🐈', age: 4, price: 95,  owner_id: 3 },
  { id: 7, name: 'Coco',    kind: 'bird', emoji: '🦜', age: 3, price: 45,  owner_id: 1 },
  { id: 8, name: 'Max',     kind: 'dog',  emoji: '🦮', age: 2, price: 110, owner_id: 2 },
];
const OWNERS = [
  { id: 1, name: 'Ayan', city: 'Lahore' },
  { id: 2, name: 'Sara', city: 'Karachi' },
  { id: 3, name: 'Omar', city: 'Lahore' },
];

const COLS = ['name', 'kind', 'age', 'price'];
const VALUES = {
  kind:  ['dog', 'cat', 'bird', 'fish'],
  age:   [1, 2, 3, 5],
  price: [20, 50, 100, 120],
  name:  ['Bruno', 'Luna', 'Max'],
};

const emptyQuery = () => ({
  cols: [], from: 'pets', where: [], whereJoin: 'AND',
  orderBy: null, limit: null, groupBy: null, join: false,
});

/* ── Run the query · the rules engine ── */
function runQuery(q) {
  let rows = PETS.map(r => ({ ...r }));

  if (q.join) rows = rows.map(r => {
    const o = OWNERS.find(x => x.id === r.owner_id) || {};
    return { ...r, owner: o.name, city: o.city };
  });

  if (q.where.length) {
    const test = (r, w) => {
      const v = r[w.col];
      if (w.op === '=') return String(v) === String(w.val);
      if (w.op === '>') return Number(v) > Number(w.val);
      if (w.op === '<') return Number(v) < Number(w.val);
      return true;
    };
    rows = rows.filter(r => (q.whereJoin === 'OR'
      ? q.where.some(w => test(r, w))
      : q.where.every(w => test(r, w))));
  }

  if (q.groupBy) {
    const g = {};
    rows.forEach(r => { const k = r[q.groupBy]; (g[k] = g[k] || []).push(r); });
    rows = Object.keys(g).sort().map(k => ({
      id: 'g_' + k, emoji: g[k][0].emoji,
      [q.groupBy]: k, 'COUNT(*)': g[k].length,
    }));
  } else if (q.cols.includes('COUNT(*)')) {
    rows = [{ id: 'count', emoji: '🔢', 'COUNT(*)': rows.length }];
  }

  if (q.orderBy) {
    const { col, dir } = q.orderBy;
    rows = [...rows].sort((a, b) => {
      const A = a[col], B = b[col];
      const c = (typeof A === 'number' && typeof B === 'number')
        ? A - B : String(A).localeCompare(String(B));
      return dir === 'DESC' ? -c : c;
    });
  }
  if (q.limit) rows = rows.slice(0, q.limit);
  return rows;
}

/* ── Render the query as SQL · this is what the player is learning ── */
function toSql(q) {
  const parts = [];
  parts.push({ kw: 'SELECT', rest: ' ' + (q.cols.length ? q.cols.join(', ') : '___') });
  parts.push({ kw: 'FROM', rest: ' ' + q.from });
  if (q.join) parts.push({ kw: 'JOIN', rest: ' owners ON pets.owner_id = owners.id' });
  if (q.where.length) {
    const txt = q.where
      .map(w => w.col + ' ' + w.op + ' ' + (typeof w.val === 'number' ? w.val : "'" + w.val + "'"))
      .join(' ' + q.whereJoin + ' ');
    parts.push({ kw: 'WHERE', rest: ' ' + txt });
  }
  if (q.groupBy) parts.push({ kw: 'GROUP BY', rest: ' ' + q.groupBy });
  if (q.orderBy) parts.push({ kw: 'ORDER BY', rest: ' ' + q.orderBy.col + ' ' + q.orderBy.dir });
  if (q.limit) parts.push({ kw: 'LIMIT', rest: ' ' + q.limit });
  return parts;
}

/* ── The curriculum ──
   Every level names the ONE new idea it teaches, so the player always
   knows what changed since the last screen. `check` reads the structured
   query, which lets a level accept any column order while still insisting
   on the keyword it is actually teaching. */
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

const LEVELS = [
  {
    id: 1, badge: '🌱', title: 'Say hello to a table', word: 'SELECT *',
    teach: 'A table is just a neat list. SELECT means "show me". The star * means "everything".',
    goal: 'Show every pet in the shop.',
    show: ['cols'],
    check: q => sameSet(q.cols, ['*']),
  },
  {
    id: 2, badge: '🏷️', title: 'Pick one column', word: 'SELECT name',
    teach: 'Instead of the star, name the column you want. You get that column only.',
    goal: 'Show only the names of the pets.',
    show: ['cols'],
    check: q => sameSet(q.cols, ['name']),
  },
  {
    id: 3, badge: '🎒', title: 'Pick two columns', word: 'SELECT a, b',
    teach: 'Want more than one? Put a comma between them.',
    goal: 'Show each pet’s name and what kind of animal it is.',
    show: ['cols'],
    check: q => sameSet(q.cols, ['name', 'kind']),
  },
  {
    id: 4, badge: '🔍', title: 'Your first filter', word: 'WHERE',
    teach: 'WHERE throws away the rows you do not want. Only rows that pass the rule stay.',
    goal: 'Show every pet that is a dog.',
    show: ['cols', 'where'],
    check: q => sameSet(q.cols, ['*']) && q.where.length === 1
      && q.where[0].col === 'kind' && q.where[0].op === '=' && q.where[0].val === 'dog',
  },
  {
    id: 5, badge: '📏', title: 'Bigger than', word: 'WHERE >',
    teach: 'With numbers you can use > (bigger than) and < (smaller than).',
    goal: 'Show every pet older than 3 years.',
    show: ['cols', 'where'],
    check: q => sameSet(q.cols, ['*']) && q.where.length === 1
      && q.where[0].col === 'age' && q.where[0].op === '>' && Number(q.where[0].val) === 3,
  },
  {
    id: 6, badge: '🪜', title: 'Put them in order', word: 'ORDER BY',
    teach: 'ORDER BY sorts the rows. DESC means biggest first, ASC means smallest first.',
    goal: 'Show every pet with the most expensive at the top.',
    show: ['cols', 'order'],
    check: q => sameSet(q.cols, ['*']) && q.orderBy
      && q.orderBy.col === 'price' && q.orderBy.dir === 'DESC',
  },
  {
    id: 7, badge: '✂️', title: 'Only the first few', word: 'LIMIT',
    teach: 'LIMIT cuts the list short. LIMIT 3 keeps just the first three rows.',
    goal: 'Show the 3 cheapest pets.',
    show: ['cols', 'order', 'limit'],
    check: q => sameSet(q.cols, ['*']) && q.orderBy
      && q.orderBy.col === 'price' && q.orderBy.dir === 'ASC' && q.limit === 3,
  },
  {
    id: 8, badge: '🧮', title: 'Count them up', word: 'COUNT(*)',
    teach: 'COUNT(*) does not list the rows, it tells you HOW MANY there are.',
    goal: 'Count how many cats the shop has.',
    show: ['cols', 'where'],
    check: q => sameSet(q.cols, ['COUNT(*)']) && q.where.length === 1
      && q.where[0].col === 'kind' && q.where[0].val === 'cat',
  },
  {
    id: 9, badge: '🔗', title: 'Two rules at once', word: 'AND',
    teach: 'AND joins two rules together. A row must pass BOTH of them to stay.',
    goal: 'Show dogs that cost less than 120.',
    show: ['cols', 'where'],
    check: q => sameSet(q.cols, ['*']) && q.whereJoin === 'AND' && q.where.length === 2
      && q.where.some(w => w.col === 'kind' && w.val === 'dog')
      && q.where.some(w => w.col === 'price' && w.op === '<' && Number(w.val) === 120),
  },
  {
    id: 10, badge: '📦', title: 'Make groups', word: 'GROUP BY',
    teach: 'GROUP BY puts the same things into one pile, then counts each pile for you.',
    goal: 'Count how many pets there are of each kind.',
    show: ['cols', 'group'],
    check: q => q.groupBy === 'kind' && q.cols.includes('COUNT(*)'),
  },
  {
    id: 11, badge: '🤝', title: 'Join two tables', word: 'JOIN',
    teach: 'Owners live in their own table. JOIN glues the two tables together so you can see both at once.',
    goal: 'Show every pet next to the name of its owner.',
    show: ['cols', 'join'],
    check: q => q.join && q.cols.includes('name') && q.cols.includes('owner'),
  },
];

const HINTS = {
  1: 'SELECT * FROM pets;',
  2: 'SELECT name FROM pets;',
  3: 'SELECT name, kind FROM pets;',
  4: "SELECT * FROM pets WHERE kind = 'dog';",
  5: 'SELECT * FROM pets WHERE age > 3;',
  6: 'SELECT * FROM pets ORDER BY price DESC;',
  7: 'SELECT * FROM pets ORDER BY price ASC LIMIT 3;',
  8: "SELECT COUNT(*) FROM pets WHERE kind = 'cat';",
  9: "SELECT * FROM pets WHERE kind = 'dog' AND price < 120;",
  10: 'SELECT kind, COUNT(*) FROM pets GROUP BY kind;',
  11: 'SELECT name, owner FROM pets JOIN owners ...;',
};

const SAVE_KEY = 'wurx_sqlquest_v1';
const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } };
const putSave = (v) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) {} };

export default function SqlQuest({ onClose }) {
  const saved = useRef(loadSave());
  const [done, setDone] = useState(() => saved.current.done || []);
  const [idx, setIdx] = useState(() => {
    const d = saved.current.done || [];
    const next = LEVELS.findIndex(l => !d.includes(l.id));
    return next < 0 ? 0 : next;
  });
  const [q, setQ] = useState(emptyQuery);
  const [ran, setRan] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [tries, setTries] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [party, setParty] = useState(false);

  const level = LEVELS[idx];
  const allDone = done.length >= LEVELS.length;

  useEffect(() => { putSave({ done }); }, [done]);
  /* Fresh board whenever the level changes · a leftover WHERE from the
     previous mission is the fastest way to confuse a beginner. */
  useEffect(() => {
    setQ(emptyQuery()); setRan(null); setVerdict(null); setTries(0); setShowHint(false);
  }, [idx]);

  function run() {
    const rows = runQuery(q);
    setRan(rows);
    if (level.check(q)) {
      setVerdict('win');
      setParty(true);
      setTimeout(() => setParty(false), 1800);
      setDone(d => (d.includes(level.id) ? d : [...d, level.id]));
    } else {
      setVerdict('try');
      setTries(t => t + 1);
    }
  }

  /* ── block helpers ── */
  const toggleCol = (c) => setQ(p => {
    if (c === '*') return { ...p, cols: p.cols.includes('*') ? [] : ['*'] };
    const rest = p.cols.filter(x => x !== '*');
    return { ...p, cols: rest.includes(c) ? rest.filter(x => x !== c) : [...rest, c] };
  });
  const addWhere = () => setQ(p => (p.where.length >= 2 ? p
    : { ...p, where: [...p.where, { col: 'kind', op: '=', val: 'dog' }] }));
  const setWhere = (i, patch) => setQ(p => {
    const w = p.where.map((x, j) => (j === i ? { ...x, ...patch } : x));
    /* switching column swaps in a value that makes sense for it, so the
       rule can never read `age = 'dog'` */
    if (patch.col) {
      w[i] = {
        ...w[i], val: VALUES[patch.col][0],
        op: (patch.col === 'kind' || patch.col === 'name') ? '=' : w[i].op,
      };
    }
    return { ...p, where: w };
  });
  const dropWhere = (i) => setQ(p => ({ ...p, where: p.where.filter((_, j) => j !== i) }));

  const pickCols = level.show.includes('join') ? [...COLS, 'owner', 'city'] : COLS;
  const shown = ran || [];
  const headCols = shown.length
    ? Object.keys(shown[0]).filter(k => !['id', 'owner_id', 'emoji'].includes(k))
    : [];

  return (
    <div className="sq-root" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <div className="sq-box">

        <div className="sq-top">
          <div className="sq-brand">
            <span className="sq-logo">🐧</span>
            <div>
              <div className="sq-title">SQL Quest</div>
              <div className="sq-sub">Learn SQL by playing · nothing here touches the real database</div>
            </div>
          </div>
          <div className="sq-dots">
            {LEVELS.map((l, i) => (
              <button key={l.id} onClick={() => setIdx(i)} title={'Level ' + l.id + ' · ' + l.title}
                className={'sq-dot' + (i === idx ? ' now' : '') + (done.includes(l.id) ? ' won' : '')}>
                {done.includes(l.id) ? '★' : l.id}
              </button>
            ))}
          </div>
          <button className="sq-x" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="sq-body">
          <div className="sq-mission">
            <span className="sq-badge">{level.badge}</span>
            <div className="sq-mtext">
              <div className="sq-mlab">Level {level.id} of {LEVELS.length} · {level.title}</div>
              <div className="sq-goal">{level.goal}</div>
            </div>
            <span className="sq-word">{level.word}</span>
          </div>

          <div className="sq-teach"><b>What it does:</b> {level.teach}</div>

          <div className="sq-build">
            {level.show.includes('cols') && (
              <Row label="SELECT" hint="what to show">
                <Chip on={q.cols.includes('*')} tone="star" onClick={() => toggleCol('*')}>
                  <span className="sq-starmark">*</span> everything
                </Chip>
                {pickCols.map(c => (
                  <Chip key={c} on={q.cols.includes(c)} onClick={() => toggleCol(c)}>{c}</Chip>
                ))}
                {(level.show.includes('group') || level.id === 8) && (
                  <Chip on={q.cols.includes('COUNT(*)')} tone="num" onClick={() => toggleCol('COUNT(*)')}>COUNT(*)</Chip>
                )}
              </Row>
            )}

            <Row label="FROM" hint="which table">
              <Chip on tone="tbl">pets</Chip>
              {level.show.includes('join') && (
                <Chip on={q.join} tone="tbl" onClick={() => setQ(p => ({ ...p, join: !p.join }))}>
                  ＋ JOIN owners
                </Chip>
              )}
            </Row>

            {level.show.includes('where') && (
              <Row label="WHERE" hint="keep only rows that pass">
                {q.where.map((w, i) => (
                  <span key={i} className="sq-rule">
                    <Pick v={w.col} set={v => setWhere(i, { col: v })} opts={COLS} />
                    <Pick v={w.op} set={v => setWhere(i, { op: v })}
                      opts={(w.col === 'kind' || w.col === 'name') ? ['='] : ['=', '>', '<']} />
                    <Pick v={w.val} set={v => setWhere(i, { val: v })} opts={VALUES[w.col]} />
                    <button className="sq-drop" onClick={() => dropWhere(i)} title="Remove this rule">✕</button>
                  </span>
                ))}
                {q.where.length < 2 && <Chip tone="add" onClick={addWhere}>＋ add a rule</Chip>}
                {q.where.length === 2 && (
                  <Chip on tone="join" onClick={() => setQ(p => ({ ...p, whereJoin: p.whereJoin === 'AND' ? 'OR' : 'AND' }))}>
                    {q.whereJoin}
                  </Chip>
                )}
              </Row>
            )}

            {level.show.includes('group') && (
              <Row label="GROUP BY" hint="put the same things in one pile">
                {['kind', 'age'].map(c => (
                  <Chip key={c} on={q.groupBy === c} tone="num"
                    onClick={() => setQ(p => ({ ...p, groupBy: p.groupBy === c ? null : c }))}>{c}</Chip>
                ))}
              </Row>
            )}

            {level.show.includes('order') && (
              <Row label="ORDER BY" hint="sort the rows">
                {['price', 'age', 'name'].map(c => (
                  <Chip key={c} on={q.orderBy && q.orderBy.col === c} tone="sort"
                    onClick={() => setQ(p => ({
                      ...p,
                      orderBy: (p.orderBy && p.orderBy.col === c)
                        ? null : { col: c, dir: (p.orderBy && p.orderBy.dir) || 'ASC' },
                    }))}>{c}</Chip>
                ))}
                {q.orderBy && (
                  <Chip on tone="dir" onClick={() => setQ(p => ({ ...p, orderBy: { ...p.orderBy, dir: p.orderBy.dir === 'ASC' ? 'DESC' : 'ASC' } }))}>
                    {q.orderBy.dir === 'ASC' ? '↑ smallest first' : '↓ biggest first'}
                  </Chip>
                )}
              </Row>
            )}

            {level.show.includes('limit') && (
              <Row label="LIMIT" hint="how many rows to keep">
                {[1, 3, 5].map(n => (
                  <Chip key={n} on={q.limit === n} tone="num"
                    onClick={() => setQ(p => ({ ...p, limit: p.limit === n ? null : n }))}>{n}</Chip>
                ))}
              </Row>
            )}
          </div>

          <div className="sq-code">
            {toSql(q).map((part, i, arr) => (
              <span key={i}>
                <span className="sq-kw">{part.kw}</span>{part.rest}{i < arr.length - 1 ? ' ' : ''}
              </span>
            ))}
            <span className="sq-semi">;</span>
          </div>

          <div className="sq-actions">
            <button className="sq-run" onClick={run} disabled={!q.cols.length}>
              ▶ Run it{!q.cols.length && <em> · pick a column first</em>}
            </button>
            {tries >= 2 && !showHint && verdict !== 'win' && (
              <button className="sq-hintbtn" onClick={() => setShowHint(true)}>Show me a hint</button>
            )}
            {verdict === 'win' && idx < LEVELS.length - 1 && (
              <button className="sq-next" onClick={() => setIdx(i => i + 1)}>Next level →</button>
            )}
          </div>

          {showHint && verdict !== 'win' && (
            <div className="sq-hint">💡 Try this: <code>{HINTS[level.id]}</code></div>
          )}

          {verdict && (
            <div className={'sq-verdict ' + verdict}>
              {verdict === 'win'
                ? <><b>Yes! That is exactly it.</b> {shown.length} row{shown.length === 1 ? '' : 's'} came back.</>
                : <><b>Not quite.</b> The query ran fine, it just does not answer the mission yet. Read the goal again and change one block.</>}
            </div>
          )}

          <div className="sq-resultwrap">
            <div className="sq-rlabel">
              {ran ? 'Result · ' + shown.length + ' row' + (shown.length === 1 ? '' : 's')
                   : 'Press Run to see what your query brings back'}
            </div>
            {ran && (
              <div className="sq-table">
                <div className="sq-trow sq-thead" style={{ gridTemplateColumns: '44px repeat(' + headCols.length + ', minmax(0,1fr))' }}>
                  <div />
                  {headCols.map(c => <div key={c}>{c}</div>)}
                </div>
                {shown.length === 0 && <div className="sq-empty">No rows matched. That is a real answer too.</div>}
                {shown.map((r, i) => (
                  <div key={r.id != null ? r.id : i} className="sq-trow sq-tbody"
                    style={{ gridTemplateColumns: '44px repeat(' + headCols.length + ', minmax(0,1fr))', animationDelay: (i * 55) + 'ms' }}>
                    <div className="sq-emoji">{r.emoji || '📊'}</div>
                    {headCols.map(c => <div key={c}>{String(r[c])}</div>)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {allDone && (
            <div className="sq-finish">
              🏆 <b>All {LEVELS.length} levels cleared.</b> You can now read and write real SQL: SELECT, WHERE, ORDER BY, LIMIT, COUNT, GROUP BY and JOIN.
              <button className="sq-reset" onClick={() => { setDone([]); setIdx(0); }}>Play again</button>
            </div>
          )}
        </div>

        {party && <Confetti />}
      </div>
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="sq-row">
      <div className="sq-rowlab"><span>{label}</span><em>{hint}</em></div>
      <div className="sq-chips">{children}</div>
    </div>
  );
}
function Chip({ on, tone, onClick, children }) {
  return (
    <button
      className={'sq-chip' + (on ? ' on' : '') + (tone ? ' t-' + tone : '')}
      onClick={onClick} disabled={!onClick}>{children}</button>
  );
}
/* A tap-to-cycle picker · a dropdown is a worse fit here because the point
   is that changing the rule costs exactly one tap. */
function Pick({ v, set, opts }) {
  const i = opts.findIndex(o => String(o) === String(v));
  return (
    <button className="sq-pick" title="Tap to change"
      onClick={() => set(opts[(i + 1) % opts.length])}>{String(v)}</button>
  );
}
function Confetti() {
  const bits = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    i,
    left: Math.random() * 100,
    delay: Math.random() * 400,
    dur: 1100 + Math.random() * 700,
    rot: Math.random() * 360,
    c: ['#F59E0B', '#EC4899', '#22C55E', '#3B82F6', '#A855F7', '#EF4444'][i % 6],
  })), []);
  return (
    <div className="sq-confetti" aria-hidden>
      {bits.map(b => (
        <span key={b.i} style={{
          left: b.left + '%', background: b.c,
          animationDelay: b.delay + 'ms', animationDuration: b.dur + 'ms',
          transform: 'rotate(' + b.rot + 'deg)',
        }} />
      ))}
    </div>
  );
}

const CSS = `
.sq-root{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(24,18,38,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  animation:sq-fade .22s ease;font-family:inherit;}
@keyframes sq-fade{from{opacity:0}to{opacity:1}}
@keyframes sq-pop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
.sq-box{position:relative;width:100%;max-width:860px;max-height:94vh;display:flex;flex-direction:column;overflow:hidden;
  border-radius:26px;background:#FBF9FF;box-shadow:0 40px 90px rgba(30,20,60,.35);
  animation:sq-pop .34s cubic-bezier(.33,1,.68,1);}

.sq-top{display:flex;align-items:center;gap:14px;padding:14px 18px;
  background:linear-gradient(120deg,#4C1D95 0%,#6D28D9 45%,#7C3AED 100%);color:#fff;}
.sq-brand{display:flex;align-items:center;gap:11px;min-width:0;}
@keyframes sq-bob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-5px) rotate(4deg)}}
.sq-logo{font-size:30px;line-height:1;animation:sq-bob 2.6s ease-in-out infinite;}
.sq-title{font-size:19px;font-weight:900;letter-spacing:-.5px;}
.sq-sub{font-size:10.5px;font-weight:600;opacity:.72;margin-top:1px;}
.sq-dots{display:flex;gap:5px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end;}
.sq-dot{width:25px;height:25px;border-radius:999px;border:0;cursor:pointer;font-family:inherit;
  font-size:10.5px;font-weight:800;background:rgba(255,255,255,.16);color:#EDE9FE;
  transition:transform .15s,background .15s;}
.sq-dot:hover{transform:translateY(-2px);background:rgba(255,255,255,.28);}
.sq-dot.won{background:#FBBF24;color:#4C1D95;}
.sq-dot.now{outline:2.5px solid #fff;outline-offset:2px;}
.sq-x{width:32px;height:32px;border-radius:999px;border:0;cursor:pointer;background:rgba(255,255,255,.16);
  color:#fff;font-size:13px;font-weight:800;font-family:inherit;}
.sq-x:hover{background:rgba(255,255,255,.3);}

.sq-body{flex:1;overflow-y:auto;padding:16px 18px 20px;}

.sq-mission{display:flex;align-items:center;gap:12px;padding:13px 15px;border-radius:18px;
  background:linear-gradient(120deg,#FFF7ED,#FEF3C7);border:1px solid #FDE68A;}
@keyframes sq-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.09)}}
.sq-badge{font-size:27px;line-height:1;animation:sq-pulse 2.2s ease-in-out infinite;}
.sq-mtext{flex:1;min-width:0;}
.sq-mlab{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.7px;color:#B45309;}
.sq-goal{font-size:15.5px;font-weight:800;color:#1F1235;letter-spacing:-.3px;margin-top:2px;}
.sq-word{flex-shrink:0;padding:5px 11px;border-radius:999px;background:#4C1D95;color:#EDE9FE;
  font-size:11px;font-weight:900;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}

.sq-teach{margin-top:10px;padding:10px 13px;border-radius:14px;background:#EEF2FF;border:1px solid #C7D2FE;
  font-size:12.5px;font-weight:600;color:#3730A3;line-height:1.5;}
.sq-teach b{color:#1E1B4B;}

.sq-build{margin-top:12px;display:flex;flex-direction:column;gap:8px;}
.sq-row{display:flex;align-items:flex-start;gap:11px;padding:9px 12px;border-radius:15px;
  background:#fff;border:1px solid #E9E3F7;}
.sq-rowlab{flex-shrink:0;width:92px;padding-top:3px;}
.sq-rowlab span{display:block;font-size:11.5px;font-weight:900;color:#6D28D9;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.sq-rowlab em{display:block;font-style:normal;font-size:9.5px;font-weight:600;color:#9C93B4;margin-top:1px;line-height:1.25;}
.sq-chips{flex:1;display:flex;flex-wrap:wrap;gap:6px;align-items:center;}

.sq-chip{height:31px;padding:0 12px;border-radius:999px;border:1.5px solid #E4DDF5;background:#FAF8FF;color:#5B5470;
  font-size:12px;font-weight:800;font-family:inherit;cursor:pointer;
  transition:transform .12s,background .15s,color .15s,border-color .15s;}
.sq-chip:hover:not(:disabled){transform:translateY(-2px);border-color:#C4B5FD;}
.sq-chip:active:not(:disabled){transform:translateY(0) scale(.96);}
.sq-chip:disabled{cursor:default;}
.sq-chip.on{background:#7C3AED;border-color:#7C3AED;color:#fff;box-shadow:0 4px 12px rgba(124,58,237,.3);}
.sq-chip.on.t-star{background:#F59E0B;border-color:#F59E0B;box-shadow:0 4px 12px rgba(245,158,11,.32);}
.sq-chip.on.t-tbl{background:#0EA5E9;border-color:#0EA5E9;box-shadow:0 4px 12px rgba(14,165,233,.3);}
.sq-chip.on.t-num{background:#10B981;border-color:#10B981;box-shadow:0 4px 12px rgba(16,185,129,.3);}
.sq-chip.on.t-sort{background:#EC4899;border-color:#EC4899;box-shadow:0 4px 12px rgba(236,72,153,.3);}
.sq-chip.on.t-dir,.sq-chip.on.t-join{background:#1F1235;border-color:#1F1235;}
.sq-chip.t-add{border-style:dashed;color:#7C3AED;}
/* a bare asterisk sits high and tiny · nudge it onto the text baseline
   so the chip reads as "* everything" rather than a stray dot */
.sq-starmark{display:inline-block;font-size:16px;line-height:0;vertical-align:-2px;font-weight:900;}

.sq-rule{display:inline-flex;align-items:center;gap:4px;padding:4px 5px 4px 6px;border-radius:12px;
  background:#F3EEFF;border:1px solid #DDD2F7;}
.sq-pick{height:25px;padding:0 9px;border-radius:8px;border:0;cursor:pointer;background:#fff;color:#4C1D95;
  font-size:11.5px;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  box-shadow:0 1px 2px rgba(76,29,149,.14);}
.sq-pick:hover{background:#EDE9FE;}
.sq-drop{width:20px;height:20px;border-radius:999px;border:0;cursor:pointer;background:transparent;
  color:#A79BC4;font-size:10px;font-weight:800;}
.sq-drop:hover{background:#FEE2E2;color:#B4362F;}

.sq-code{margin-top:12px;padding:13px 15px;border-radius:15px;background:#1F1235;color:#E9E2FF;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.75;word-break:break-word;}
.sq-kw{color:#FBBF24;font-weight:800;}
.sq-semi{color:#8B7FB0;}

.sq-actions{margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.sq-run{height:42px;padding:0 24px;border-radius:999px;border:0;cursor:pointer;font-family:inherit;
  font-size:14.5px;font-weight:900;color:#fff;background:linear-gradient(120deg,#7C3AED,#A855F7);
  box-shadow:0 8px 20px rgba(124,58,237,.36);transition:transform .14s,box-shadow .14s;}
.sq-run em{font-style:normal;font-size:11px;font-weight:700;opacity:.8;}
.sq-run:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 26px rgba(124,58,237,.44);}
.sq-run:active:not(:disabled){transform:translateY(0) scale(.97);}
.sq-run:disabled{background:#CFC6E4;box-shadow:none;cursor:not-allowed;color:#7B7194;}
.sq-next{height:42px;padding:0 20px;border-radius:999px;border:0;cursor:pointer;font-family:inherit;
  font-size:13.5px;font-weight:900;color:#fff;background:#10B981;
  box-shadow:0 8px 20px rgba(16,185,129,.34);animation:sq-pulse 1.5s ease-in-out infinite;}
.sq-hintbtn{height:38px;padding:0 15px;border-radius:999px;border:1.5px dashed #C4B5FD;background:#fff;
  color:#7C3AED;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;}
.sq-hint{margin-top:9px;padding:10px 13px;border-radius:13px;background:#FFFBEB;border:1px solid #FDE68A;
  font-size:12.5px;font-weight:600;color:#92400E;}
.sq-hint code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:800;color:#78350F;}

.sq-verdict{margin-top:10px;padding:11px 14px;border-radius:14px;font-size:13px;font-weight:600;
  line-height:1.5;animation:sq-pop .3s ease;}
.sq-verdict.win{background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;}
.sq-verdict.try{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;}

.sq-resultwrap{margin-top:14px;}
.sq-rlabel{font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.7px;color:#9C93B4;margin-bottom:7px;}
.sq-table{border-radius:15px;overflow:hidden;border:1px solid #E9E3F7;background:#fff;}
.sq-trow{display:grid;align-items:center;gap:8px;padding:9px 13px;font-size:12.5px;}
.sq-thead{background:#F3EEFF;font-weight:900;color:#6D28D9;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;}
@keyframes sq-in{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}
.sq-tbody{border-top:1px solid #F2EDFB;font-weight:700;color:#2B2140;opacity:0;
  animation:sq-in .34s cubic-bezier(.2,.8,.3,1) forwards;}
.sq-emoji{font-size:19px;line-height:1;}
.sq-empty{padding:22px;text-align:center;font-size:12.5px;font-weight:600;color:#9C93B4;}

.sq-finish{margin-top:14px;padding:15px;border-radius:16px;background:linear-gradient(120deg,#FEF3C7,#FDE68A);
  border:1px solid #FCD34D;font-size:13.5px;font-weight:700;color:#78350F;line-height:1.55;}
.sq-reset{margin-left:8px;height:30px;padding:0 14px;border-radius:999px;border:0;cursor:pointer;
  background:#78350F;color:#FEF3C7;font-size:12px;font-weight:800;font-family:inherit;}

.sq-confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
@keyframes sq-fall{to{transform:translateY(115vh) rotate(760deg);opacity:0}}
.sq-confetti span{position:absolute;top:-16px;width:9px;height:15px;border-radius:2px;
  animation-name:sq-fall;animation-timing-function:cubic-bezier(.3,.6,.5,1);animation-fill-mode:forwards;}

@media (max-width:640px){
  .sq-row{flex-direction:column;gap:6px;}
  .sq-rowlab{width:auto;padding-top:0;}
  .sq-mission{flex-wrap:wrap;}
  .sq-dots{order:3;width:100%;justify-content:flex-start;margin-left:0;}
}
`;
