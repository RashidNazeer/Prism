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
  const { data, error } = await selectAll(() => supabase
    .from('activity_logs')
    .select('id,target,details,user_display,created_at')
    .eq('action', ACTION)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }));
  if (error) throw error;
  const map = {};
  (data || []).forEach(row => {
    const key = String(row.target || '').trim();
    if (!key || map[key]) return;          // newest row per key wins
    let d = row.details;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    if (d && typeof d === 'object') {
      map[key] = Object.assign({}, d, { savedBy: row.user_display || '', savedAt: row.created_at });
    }
  });
  putMirror(map);
  window.dispatchEvent(new Event('wurx-brand-contracts'));
  return map;
}

export async function saveBrandContract(brand, month, payload, user) {
  const b = String(brand || '').trim();
  const m = String(month || '').slice(0, 7);
  if (!b || !m) return null;
  const key = bcKey(b, m);

  /* one row per brand+month - replace rather than accumulate */
  await supabase.from('activity_logs').delete().eq('action', ACTION).eq('target', key);

  const clean = {
    fields: (payload && payload.fields) || {},
    custom: (payload && payload.custom) || {},
  };
  const empty = !Object.keys(clean.fields).length && !Object.keys(clean.custom).length;

  if (!empty) {
    const { error } = await supabase.from('activity_logs').insert({
      action: ACTION,
      target: key,
      details: clean,
      user_id: (user && user.id) || null,
      user_display: (user && user.display) || 'system',
    });
    if (error) throw error;
  }

  const map = getBrandContracts();
  if (empty) delete map[key];
  else map[key] = Object.assign({}, clean, { savedBy: (user && user.display) || '', savedAt: new Date().toISOString() });
  putMirror(map);
  window.dispatchEvent(new Event('wurx-brand-contracts'));
  return map[key] || null;
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
