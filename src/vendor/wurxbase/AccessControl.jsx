import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { CAP_GROUPS, ALL_CAPS, ROLE_LIST, defaultFor, can } from './access';

/* ════════════════════════════════════════════════════════════════
   Access control

   Read as three steps, in order: choose a person, turn on what they
   should be able to do, save. Every switch says Allowed or Blocked in
   words next to it, because a bare switch asks you to remember which
   side means yes.

   Areas are drawers so the page is never a wall of thirty-three rows.
   A drawer's own switch turns its whole area on or off at once.

   Saved to app_users.custom_perms in Supabase, and only the keys that
   differ from the role are stored, so redefining a role later still
   moves everyone who was left on defaults.
   ════════════════════════════════════════════════════════════════ */

const ROLE_TINT = {
  superadmin: '#4F46E5', ipc: '#0E7A3A', admin: '#B4483C',
  apc: '#B7791F', viewer: '#0369A1', client: '#7C3AED',
};
const ROLE_SAY = {
  superadmin: 'Everything, including access control',
  ipc: 'Runs creators and reporting, no admin tools',
  admin: 'Manages the workspace, cannot delete',
  apc: 'Reads their own brands only',
  viewer: 'Reads, changes nothing',
  client: 'Sees their own brand and its report',
};
const initial = (u) => ((u.display || u.username || '?')[0] || '?').toUpperCase();

export default function AccessControl({ currentUser, onClose }) {
  const [users, setUsers] = useState([]);
  const [pickedId, setPickedId] = useState(null);
  const [draft, setDraft] = useState({});
  const [role, setRole] = useState('viewer');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => ({ Reporting: true }));
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);

  const say = (text, bad) => { setNote({ text, bad }); setTimeout(() => setNote(null), 3200); };

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.from('app_users').select('*').order('username');
    if (error) { say('Could not read the team', true); setBusy(false); return; }
    const list = data || [];
    setUsers(list);
    setPickedId(p => (p && list.some(u => u.id === p)) ? p : (list[0] ? list[0].id : null));
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const picked = useMemo(() => users.find(u => u.id === pickedId) || null, [users, pickedId]);

  useEffect(() => {
    if (!picked) return;
    setDraft({ ...(picked.custom_perms || {}) });
    setRole(picked.role || 'viewer');
  }, [picked]);

  const isSelf = picked && currentUser && String(picked.id) === String(currentUser.id);

  const value = (key) => (
    Object.prototype.hasOwnProperty.call(draft, key) ? !!draft[key] : defaultFor(role, key)
  );
  const changed = (key) => Object.prototype.hasOwnProperty.call(draft, key);

  const set = (key, on) => setDraft(d => {
    const next = { ...d };
    if (on === defaultFor(role, key)) delete next[key];
    else next[key] = on;
    return next;
  });
  const setMany = (caps, on) => setDraft(d => {
    const next = { ...d };
    caps.forEach(c => {
      if (on === defaultFor(role, c.key)) delete next[c.key];
      else next[c.key] = on;
    });
    return next;
  });

  const dirty = useMemo(() => {
    if (!picked) return false;
    const was = picked.custom_perms || {};
    const a = Object.keys(was).sort().map(k => k + ':' + !!was[k]).join('|');
    const b = Object.keys(draft).sort().map(k => k + ':' + !!draft[k]).join('|');
    return a !== b || (picked.role || 'viewer') !== role;
  }, [picked, draft, role]);

  const allowed = ALL_CAPS.filter(k => value(k)).length;
  const byHand = Object.keys(draft).length;

  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!needle) return CAP_GROUPS;
    return CAP_GROUPS
      .map(g => ({ ...g, caps: g.caps.filter(c =>
        c.label.toLowerCase().includes(needle) ||
        (c.help || '').toLowerCase().includes(needle) ||
        g.group.toLowerCase().includes(needle)) }))
      .filter(g => g.caps.length > 0);
  }, [needle]);

  async function save() {
    if (!picked) return;
    setSaving(true);
    const patch = { custom_perms: draft, role };
    const { error } = await supabase.from('app_users').update(patch).eq('id', picked.id);
    setSaving(false);
    if (error) { say('Could not save', true); return; }
    setUsers(us => us.map(u => (u.id === picked.id ? { ...u, ...patch } : u)));
    say(isSelf
      ? 'Saved · your own changes apply at your next sign-in'
      : (picked.display || picked.username) + ' will have this the next time they sign in');
  }

  const body = (
    <div className="ac-root" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ac">
        <header className="ac-top">
          <span className="ac-top-ic" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.4" />
            </svg>
          </span>
          <div className="ac-top-say">
            <b>Access control</b>
            <small>Choose a person, turn on what they are allowed to do, then save.</small>
          </div>
          <button className="ac-x" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="ac-body">
          <aside className="ac-side">
            <span className="ac-step"><i>1</i>Choose a person</span>
            {busy && <div className="ac-side-none">Loading the team</div>}
            {!busy && users.length === 0 && <div className="ac-side-none">No accounts yet</div>}
            {users.map(u => {
              const n = ALL_CAPS.filter(k => can({ role: u.role, custom_perms: u.custom_perms }, k)).length;
              return (
                <button key={u.id} className={'ac-u' + (u.id === pickedId ? ' on' : '')}
                  onClick={() => setPickedId(u.id)}>
                  <span className="ac-u-face" style={{ background: ROLE_TINT[u.role] || '#57534E' }}>{initial(u)}</span>
                  <span className="ac-u-say">
                    <b>{u.display || u.username}</b>
                    <small>{n} of {ALL_CAPS.length} allowed</small>
                  </span>
                  <span className="ac-u-go" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="ac-main">
            {!picked ? (
              <div className="ac-blank">Pick someone on the left to begin.</div>
            ) : (
              <>
                <div className="ac-who">
                  <span className="ac-who-face" style={{ background: ROLE_TINT[role] || '#57534E' }}>{initial(picked)}</span>
                  <div className="ac-who-say">
                    <b>{picked.display || picked.username}{isSelf && <em>this is you</em>}</b>
                    <span className="ac-tally">
                      <i className="ok">{allowed} allowed</i>
                      <i className="no">{ALL_CAPS.length - allowed} blocked</i>
                      {byHand > 0 && <i className="hand">{byHand} set by you</i>}
                    </span>
                  </div>
                </div>

                <div className="ac-roleband">
                  <div className="ac-roleband-say">
                    <b>Start from a role</b>
                    <small>{ROLE_SAY[role]}</small>
                  </div>
                  <div className="ac-roles">
                    {ROLE_LIST.map(r => (
                      <button key={r} className={'ac-role' + (role === r ? ' on' : '')}
                        style={role === r ? { background: ROLE_TINT[r], borderColor: ROLE_TINT[r] } : undefined}
                        onClick={() => setRole(r)}>{r}</button>
                    ))}
                  </div>
                </div>

                <div className="ac-step2">
                  <span className="ac-step"><i>2</i>Turn on what {picked.display || picked.username} is allowed to do</span>
                  <div className="ac-quicks">
                    <button className="ac-quick" onClick={() => setDraft(
                      ALL_CAPS.reduce((m, k) => { if (!defaultFor(role, k)) m[k] = true; return m; }, {})
                    )}>Allow all</button>
                    <button className="ac-quick" onClick={() => setDraft(
                      ALL_CAPS.reduce((m, k) => { if (defaultFor(role, k)) m[k] = false; return m; }, {})
                    )}>Block all</button>
                    <button className="ac-quick warn" onClick={() => setDraft({})} disabled={byHand === 0}>
                      Undo my changes
                    </button>
                  </div>
                </div>

                <label className="ac-find">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
                  </svg>
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search, for example: angle, delete, GMV" />
                  {q && (
                    <button type="button" onClick={() => setQ('')} title="Clear">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </label>

                <div className="ac-groups">
                  {groups.length === 0 && <div className="ac-blank">Nothing matches that.</div>}
                  {groups.map(g => {
                    const on = g.caps.filter(c => value(c.key)).length;
                    const all = on === g.caps.length;
                    const isOpen = !!needle || !!open[g.group];
                    return (
                      <div className={'ac-g' + (isOpen ? ' open' : '')} key={g.group}>
                        <div className="ac-g-top" onClick={() => !needle && setOpen(o => ({ ...o, [g.group]: !o[g.group] }))}>
                          <span className="ac-g-chev" aria-hidden>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                          </span>
                          <div className="ac-g-say">
                            <b>{g.group}</b>
                            <small>{g.note}</small>
                          </div>
                          <span className={'ac-g-cnt' + (on === 0 ? ' none' : all ? ' all' : '')}>
                            {on} of {g.caps.length}
                          </span>
                          <button type="button" className={'ac-sw sm' + (all ? ' on' : '')}
                            role="switch" aria-checked={all} title={all ? 'Block this whole area' : 'Allow this whole area'}
                            onClick={e => { e.stopPropagation(); setMany(g.caps, !all); }}>
                            <i />
                          </button>
                        </div>

                        <div className="ac-drawer">
                          <div className="ac-rows">
                            {g.caps.map(c => {
                              const on2 = value(c.key);
                              return (
                                <div key={c.key} className={'ac-row' + (on2 ? ' on' : '') + (changed(c.key) ? ' edited' : '')}
                                  onClick={() => set(c.key, !on2)}>
                                  <span className="ac-row-say">
                                    <b>{c.label}{changed(c.key) && <i title="You set this, it did not come from the role">changed by you</i>}</b>
                                    {c.help && <small>{c.help}</small>}
                                  </span>
                                  <span className={'ac-state' + (on2 ? ' ok' : '')}>{on2 ? 'Allowed' : 'Blocked'}</span>
                                  <button type="button" className={'ac-sw' + (on2 ? ' on' : '')}
                                    role="switch" aria-checked={on2} aria-label={c.label}
                                    onClick={e => { e.stopPropagation(); set(c.key, !on2); }}>
                                    <i />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>

        <footer className="ac-foot">
          <span className="ac-step foot"><i>3</i>Save</span>
          {note && <span className={'ac-note' + (note.bad ? ' bad' : '')}>{note.text}</span>}
          <span className="ac-foot-sp" />
          {picked && dirty && <span className="ac-dirty">{byHand || 'role'} unsaved</span>}
          <button className="ac-btn" onClick={onClose}>Close</button>
          <button className="ac-btn on" onClick={save} disabled={!picked || !dirty || saving}>
            {saving ? 'Saving' : 'Save changes'}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
