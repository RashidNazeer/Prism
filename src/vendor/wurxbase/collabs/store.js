import { collabs, isSupabaseConfigured } from './config';

/* ════════════════════════════════════════════════════════════
   Unified data layer for Paid Collaborations.
   Backend = the NEW Supabase project (if configured) else localStorage.
   All functions are async and return plain rows (snake_case, same
   shape as the DB) so the UI doesn't care which backend is active.
════════════════════════════════════════════════════════════ */

export const storeMode = isSupabaseConfigured ? 'supabase' : 'local';

const LS_KEY = 'pc_data_v1';

/* Resilient write: if a column doesn't exist yet (e.g. paypal/completed_on
   before the user runs the ALTER), strip it and retry instead of failing. */
function strippedPayload(payload, error) {
  const m = (error?.message || '').match(/column\s+"?([\w.]+)"?/i);
  let col = m ? m[1] : null;
  if (col && col.includes('.')) col = col.split('.').pop();
  if (col && col in payload) { const clone = { ...payload }; delete clone[col]; return clone; }
  return null;
}
async function pgWrite(run, payload) {
  let res = await run(payload), guard = 0;
  while (res.error && /does not exist/i.test(res.error.message || '') && guard++ < 5) {
    const next = strippedPayload(payload, res.error);
    if (!next) break;
    payload = next;
    res = await run(payload);
  }
  return res;
}

function uid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2, 10);
}
function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
}
function writeLocal(d) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {}
}
function ensureLocal() {
  let d = readLocal();
  if (!d || !Array.isArray(d.brands)) { d = { brands: [], brandMonths: [], creators: [] }; writeLocal(d); }
  d.brands = d.brands || []; d.brandMonths = d.brandMonths || []; d.creators = d.creators || [];
  return d;
}

/* ── load everything ── */
export async function loadAll() {
  if (isSupabaseConfigured) {
    const [b, bm, c] = await Promise.all([
      collabs.from('pc_brands').select('*'),
      collabs.from('pc_brand_months').select('*'),
      collabs.from('pc_creators').select('*'),
    ]);
    if (b.error) throw b.error;
    if (bm.error) throw bm.error;
    if (c.error) throw c.error;
    return { brands: b.data || [], brandMonths: bm.data || [], creators: c.data || [] };
  }
  const d = ensureLocal();
  return { brands: [...d.brands], brandMonths: [...d.brandMonths], creators: [...d.creators] };
}

/* ── brands ── */
export async function addBrand(name) {
  const clean = (name || '').trim();
  if (!clean) throw new Error('Brand name required');
  if (isSupabaseConfigured) {
    const { data, error } = await collabs.from('pc_brands').insert({ name: clean }).select().single();
    if (error) throw error;
    return data;
  }
  const d = ensureLocal();
  const row = { id: uid(), name: clean, created_at: new Date().toISOString() };
  d.brands.push(row); writeLocal(d);
  return row;
}
export async function deleteBrand(id) {
  if (isSupabaseConfigured) {
    const { error } = await collabs.from('pc_brands').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const d = ensureLocal();
  d.brands = d.brands.filter(b => b.id !== id);
  d.brandMonths = d.brandMonths.filter(m => m.brand_id !== id);
  d.creators = d.creators.filter(c => c.brand_id !== id);
  writeLocal(d);
}

/* ── brand-month (budget + links) ── */
export async function upsertBrandMonth(brandId, month, patch) {
  const fields = {
    budget: patch.budget != null ? Number(patch.budget) || 0 : undefined,
    content_guide_url: patch.content_guide_url,
    focus_product_url: patch.focus_product_url,
    notes: patch.notes,
  };
  Object.keys(fields).forEach(k => fields[k] === undefined && delete fields[k]);
  if (isSupabaseConfigured) {
    const res = await pgWrite(
      p => collabs.from('pc_brand_months').upsert(p, { onConflict: 'brand_id,month' }).select().single(),
      { brand_id: brandId, month, ...fields }
    );
    if (res.error) throw res.error;
    return res.data;
  }
  const d = ensureLocal();
  let row = d.brandMonths.find(m => m.brand_id === brandId && m.month === month);
  if (row) { Object.assign(row, fields); }
  else { row = { id: uid(), brand_id: brandId, month, budget: 0, content_guide_url: '', focus_product_url: '', notes: '', ...fields }; d.brandMonths.push(row); }
  writeLocal(d);
  return row;
}

/* ── creators / deals ── */
export async function addCreator(data) {
  const payload = {
    brand_id: data.brand_id,
    name: (data.name || '').trim(),
    tiktok_handle: data.tiktok_handle || '',
    amount: Number(data.amount) || 0,
    videos_count: parseInt(data.videos_count, 10) || 0,
    zelle: data.zelle || '',
    paypal: data.paypal || '',
    phone: data.phone || '',
    email: data.email || '',
    category: data.category || '',
    payment_status: data.payment_status || 'videos_in_progress',
    onboarded_on: data.onboarded_on || null,
    video_codes: Array.isArray(data.video_codes) ? data.video_codes : [],
    monthly: (data.monthly && typeof data.monthly === 'object') ? data.monthly : {},
    products: Array.isArray(data.products) ? data.products : [],
  };
  if (!payload.name) throw new Error('Name required');
  if (isSupabaseConfigured) {
    const res = await pgWrite(p => collabs.from('pc_creators').insert(p).select().single(), payload);
    if (res.error) throw res.error;
    return res.data;
  }
  const d = ensureLocal();
  const row = { id: uid(), created_at: new Date().toISOString(), ...payload };
  d.creators.push(row); writeLocal(d);
  return row;
}
export async function updateCreator(id, patch) {
  if (isSupabaseConfigured) {
    const res = await pgWrite(p => collabs.from('pc_creators').update(p).eq('id', id), patch);
    if (res.error) throw res.error;
    return;
  }
  const d = ensureLocal();
  const row = d.creators.find(c => c.id === id);
  if (row) Object.assign(row, patch);
  writeLocal(d);
}
export async function deleteCreator(id) {
  if (isSupabaseConfigured) {
    const { error } = await collabs.from('pc_creators').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const d = ensureLocal();
  d.creators = d.creators.filter(c => c.id !== id);
  writeLocal(d);
}
