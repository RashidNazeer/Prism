import { supabase, selectAll } from './supabaseClient';

/* ════════════════════════════════════════════════════════════════
   Brand contract · the terms a brand fixes FOR ONE MONTH

   Scoped to a month on purpose. A contract carries period start, period
   end and the payment cycle, so it describes one cycle and nothing else.
   One blob per brand would push September dates onto a creator hired in
   January, which is simply wrong. The key is therefore brand + month,
   and a creator inherits the contract of the month they were hired in.

   Three layers stack, narrowest last:

     defaultContractFields(creator)   what the deal itself implies
        v
     brand contract for that month    set once, applies to that month
        v
     per-creator edits                the existing per-creator override

   Saving from the brand panel is authoritative for the fields it fixes:
   it clears those fields from the personal edits of the creators in that
   month, so one change genuinely reaches all of them. Fields the brand
   does not fix are left exactly as each creator set them.

   Storage note - this belongs in a brand table, but the project has no
   DDL access, so it rides in activity_logs the way the Discovery marks
   already do: one row per brand+month, action BRAND_CONTRACT, target
   "Brand::YYYY-MM". A shared table, so the terms reach the whole team
   rather than one browser.
   ════════════════════════════════════════════════════════════════ */

const ACTION = 'BRAND_CONTRACT';
const MIRROR = 'wurx_brand_contracts_v1';

export const bcKey = (brand, month) =>
  String(brand || '').trim() + '::' + String(month || '').slice(0, 7);

/* localStorage mirror so the first paint is instant - the DB is truth */
export function getBrandContracts() {
  try { return JSON.parse(localStorage.getItem(MIRROR)) || {}; }
  catch (e) { return {}; }
}
function putMirror(map) {
  try { localStorage.setItem(MIRROR, JSON.stringify(map)); } catch (e) {}
}

/* Month first. A row saved before contracts were month-scoped has no
   month in its key - it is still honoured as a brand-wide fallback so
   nobody loses terms they already set, but every new save is scoped. */
export function getBrandContract(brand, month) {
  const all = getBrandContracts();
  const b = String(brand || '').trim();
  if (!b) return null;
  if (month) {
    const hit = all[bcKey(b, month)];
    if (hit) return hit;
  }
  return all[b] || null;
}

export async function fetchBrandContracts() {
  /* `revision` is what every save conditions itself on; a mirror without it
     cannot write, which is deliberate. */
  const { data, error } = await selectAll(() => supabase
    .from('activity_logs')
    .select('id,target,details,user_display,created_at,updated_at,revision')
    .eq('action', ACTION)
    .order('target', { ascending: true }));
  if (error) throw error;
  const map = {};
  (data || []).forEach(row => {
    const key = String(row.target || '').trim();
    if (!key || map[key]) return;          // newest row per key wins
    let d = row.details;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    if (d && typeof d === 'object') {
      map[key] = Object.assign({}, d, {
        savedBy: row.user_display || '',
        /* Rows are edited in place now, so created_at is when the contract was
           first written, not when it was last saved. */
        savedAt: row.updated_at || row.created_at,
        revision: row.revision,
      });
    }
  });
  putMirror(map);
  window.dispatchEvent(new Event('wurx-brand-contracts'));
  return map;
}

export class ContractConflict extends Error {
  constructor(current) {
    super('This contract was changed somewhere else while you had it open.');
    this.name = 'ContractConflict';
    this.conflict = true;
    this.current = current;
  }
}

async function currentContract(key) {
  const { data } = await supabase.from('activity_logs')
    .select('details,user_display,updated_at,created_at,revision')
    .eq('action', ACTION).eq('target', key).maybeSingle();
  if (!data) return null;
  let d = data.details;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  return Object.assign({}, d || {}, {
    savedBy: data.user_display || '',
    savedAt: data.updated_at || data.created_at,
    revision: data.revision,
  });
}

export async function saveBrandContract(brand, month, payload, user) {
  const b = String(brand || '').trim();
  const m = String(month || '').slice(0, 7);
  if (!b || !m) return null;
  const key = bcKey(b, m);

  /*
   * ═══ THE DELETE USED TO RUN FIRST, AND UNCONDITIONALLY ═══
   *
   * `delete` then `insert`, in that order, with nothing between them but a
   * network. A save that failed at the second step destroyed the contract and
   * then threw, so the modal said "Could not save" over a row that was already
   * gone — and the mirror kept rendering the old terms, so nobody investigated
   * while it was still recoverable.
   *
   * And an empty payload deleted without inserting at all, which is what an
   * unloaded modal sends: open the Contract panel on a browser whose boot
   * fetch failed, click save, and the brand's terms are gone.
   *
   * Now: one row per brand+month enforced by a partial unique index, and a save
   * is an UPDATE conditioned on the revision this screen loaded. No delete in
   * the ordinary path at all.
   */
  const clean = {
    fields: (payload && payload.fields) || {},
    custom: (payload && payload.custom) || {},
  };
  const empty = !Object.keys(clean.fields).length && !Object.keys(clean.custom).length;

  const known = getBrandContracts()[key];
  const expected = known && Number.isFinite(known.revision) ? known.revision : null;
  const stamp = new Date().toISOString();
  const who = {
    user_id: (user && user.id) || null,
    user_display: (user && user.display) || 'system',
  };

  if (expected == null) {
    if (empty) {
      /* Nothing loaded and nothing to write. If the server holds terms, this
         screen is not entitled to clear them. */
      const { data: exists } = await supabase.from('activity_logs')
        .select('id').eq('action', ACTION).eq('target', key).maybeSingle();
      if (exists) throw new ContractConflict(await currentContract(key));
      return null;
    }
    const { data, error } = await supabase.from('activity_logs').insert({
      action: ACTION, target: key, details: clean, updated_at: stamp, revision: 1, ...who,
    }).select('revision,updated_at').single();
    if (error) {
      if (error.code === '23505') throw new ContractConflict(await currentContract(key));
      throw error;
    }
    return writeMirror(key, clean, user, data.updated_at || stamp, data.revision);
  }

  if (empty) {
    const { data, error } = await supabase.from('activity_logs')
      .delete().eq('action', ACTION).eq('target', key).eq('revision', expected).select('id');
    if (error) throw error;
    if (!data || !data.length) throw new ContractConflict(await currentContract(key));
    const map = getBrandContracts();
    delete map[key];
    putMirror(map);
    window.dispatchEvent(new Event('wurx-brand-contracts'));
    return null;
  }

  const { data, error } = await supabase.from('activity_logs')
    .update({ details: clean, updated_at: stamp, revision: expected + 1, ...who })
    .eq('action', ACTION).eq('target', key).eq('revision', expected)
    .select('revision,updated_at');
  if (error) throw error;
  if (!data || !data.length) throw new ContractConflict(await currentContract(key));

  return writeMirror(key, clean, user, data[0].updated_at || stamp, data[0].revision);
}

function writeMirror(key, clean, user, savedAt, revision) {
  const map = getBrandContracts();
  map[key] = Object.assign({}, clean, {
    savedBy: (user && user.display) || '',
    savedAt,
    revision,
  });
  putMirror(map);
  window.dispatchEvent(new Event('wurx-brand-contracts'));
  return map[key];
}

/* Effective date used to be offered at brand level and no longer is: it
   is the day a particular creator agreement starts, so one shared value
   is wrong for everyone but the first signing. A value saved before that
   decision is dropped rather than applying invisibly from a control that
   has been taken away. */
const NOT_BRAND_LEVEL = ['effectiveDate'];

/* The one place the three layers are combined - everything that renders
   or downloads a contract goes through this, so the layering can never
   drift between call sites. `month` is the creator own hire month. */
export function mergeContract(base, brand, month, creatorEdits) {
  const bc = getBrandContract(brand, month) || {};
  const brandFields = Object.assign({}, bc.fields || {});
  NOT_BRAND_LEVEL.forEach(function (k) { delete brandFields[k]; });
  return {
    fields: Object.assign({}, base, brandFields, (creatorEdits && creatorEdits.fields) || {}),
    custom: Object.assign({}, bc.custom || {}, (creatorEdits && creatorEdits.custom) || {}),
    fromBrand: brandFields,
    brandCustom: bc.custom || {},
  };
}
