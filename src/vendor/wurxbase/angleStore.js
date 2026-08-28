import { supabase, selectAll } from './supabaseClient';

/* ════════════════════════════════════════════════════════════════
   Creative angle testing · storage

   An angle is a hook you are testing. Videos are grouped under it, and
   the point is to compare angles against each other, so everything is
   scoped to ONE brand in ONE month: comparing a September hook against
   a January one measures the season, not the hook.

   Views and GMV are not stored here where EUKA reports them:
   both already live on each video in creators.video_codes, and copying
   them would guarantee they go stale. What is ours to keep is only what
   no API can tell us - which videos belong to which angle, the ad spend
   behind each video, and a typed GMV for the brands EUKA does not cover.

   Storage note - this belongs in its own table, but the project has no
   DDL access, so it rides in activity_logs the way the brand contracts
   and Discovery marks already do: one row per brand+month, action
   CREATIVE_ANGLE, target "Brand::YYYY-MM". A shared table, so the whole
   team sees the same test.
   ════════════════════════════════════════════════════════════════ */

const ACTION = 'CREATIVE_ANGLE';
const MIRROR = 'wurx_creative_angles_v1';

export const caKey = (brand, month) =>
  String(brand || '').trim() + '::' + String(month || '').slice(0, 7);

export function getAllAngles() {
  try { return JSON.parse(localStorage.getItem(MIRROR)) || {}; }
  catch (e) { return {}; }
}
function putMirror(map) {
  try { localStorage.setItem(MIRROR, JSON.stringify(map)); } catch (e) {}
}

export function getAngles(brand, month) {
  const row = getAllAngles()[caKey(brand, month)];
  return (row && Array.isArray(row.angles)) ? row.angles : [];
}

export async function fetchAngles() {
  /* `revision` comes back with every row and is carried into the mirror,
     because it is what `saveAngles` conditions its write on. A mirror without
     it cannot save at all, which is deliberate: better a refusal than a
     blind overwrite. */
  const { data, error } = await selectAll(() => supabase
    .from('activity_logs')
    .select('id,target,details,user_display,created_at,updated_at,revision')
    .eq('action', ACTION)
    .order('target', { ascending: true }));
  if (error) throw error;
  const map = {};
  (data || []).forEach(row => {
    const key = String(row.target || '').trim();
    if (!key || map[key]) return;
    let d = row.details;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    if (d && Array.isArray(d.angles)) {
      map[key] = {
        angles: d.angles,
        savedBy: row.user_display || '',
        /* The row is edited in place now, so `created_at` is when the test was
           STARTED. What the screen means by "saved" is the last write. */
        savedAt: row.updated_at || row.created_at,
        revision: row.revision,
      };
    }
  });
  putMirror(map);
  window.dispatchEvent(new Event('wurx-angles'));
  return map;
}

/*
 * Thrown when the row moved under us. Carries the server's copy so the caller
 * can show what is actually stored rather than just refusing.
 */
export class AngleConflict extends Error {
  constructor(current) {
    super('This test was changed somewhere else while you had it open.');
    this.name = 'AngleConflict';
    this.conflict = true;
    this.current = current;
  }
}

export async function saveAngles(brand, month, angles, user) {
  const key = caKey(brand, month);
  if (!String(brand || '').trim() || !String(month || '').trim()) return null;

  const list = Array.isArray(angles) ? angles : [];

  /*
   * ═══ A CONDITIONAL UPDATE, NOT A WRITE-THEN-SWEEP ═══
   *
   * This used to insert a new row and then DELETE every older row with the
   * same target. Three ways that lost real work, all of them silent:
   *
   *   - an empty list wrote nothing and deleted everything, so a screen whose
   *     load had failed wiped the team's test on the next click;
   *   - a stale tab swept a colleague's newer row and left its own;
   *   - nothing distinguished "nobody has saved a test" from "I could not
   *     read it", because `fetchAngles` swallows its error upstream.
   *
   * Now there is exactly one row per brand+month — enforced by a partial
   * unique index, not by a convention — and a save is an UPDATE conditioned
   * on the revision this screen loaded. Postgres decides, atomically: either
   * this writer had the current row and it moves to the next revision, or zero
   * rows match and we refuse. No DELETE anywhere in the path, so a failed
   * write can no longer destroy what was there.
   *
   * DELETING THE LAST ANGLE STILL DELETES. That is a real user action, and it
   * is the ONE place a delete belongs — but it is now also conditioned on the
   * revision, so it cannot be performed by a screen that never loaded.
   */
  const mirror = getAllAngles();
  const known = mirror[key];
  const expected = known && Number.isFinite(known.revision) ? known.revision : null;

  const stamp = new Date().toISOString();
  const who = {
    user_id: (user && user.id) || null,
    user_display: (user && user.display) || 'system',
  };

  /* Nothing stored for this subject yet, as far as this screen knows. */
  if (expected == null) {
    if (!list.length) {
      /* An empty save with no loaded revision is the exact shape of the bug:
         a screen that never loaded, asking to delete a test it cannot see.
         There is nothing legitimate to do, so do nothing. */
      const { data: exists } = await supabase.from('activity_logs')
        .select('id').eq('action', ACTION).eq('target', key).maybeSingle();
      if (exists) throw new AngleConflict(null);
      return { angles: [], savedAt: stamp };
    }
    const { data, error } = await supabase.from('activity_logs').insert({
      action: ACTION, target: key, details: { angles: list },
      updated_at: stamp, revision: 1, ...who,
    }).select('revision,updated_at').single();
    /* 23505 is the unique index: somebody created this subject between our
       read and our write. Not an error to show as one — reload and retry. */
    if (error) {
      if (error.code === '23505') throw new AngleConflict(await currentRow(key));
      throw error;
    }
    return commitMirror(key, list, user, data.updated_at || stamp, data.revision);
  }

  /* Deleting the last angle: a real action, still conditioned. */
  if (!list.length) {
    const { data, error } = await supabase.from('activity_logs')
      .delete().eq('action', ACTION).eq('target', key).eq('revision', expected)
      .select('id');
    if (error) throw error;
    if (!data || !data.length) throw new AngleConflict(await currentRow(key));
    const map = getAllAngles();
    delete map[key];
    putMirror(map);
    window.dispatchEvent(new Event('wurx-angles'));
    return { angles: [], savedAt: stamp };
  }

  const { data, error } = await supabase.from('activity_logs')
    .update({ details: { angles: list }, updated_at: stamp, revision: expected + 1, ...who })
    .eq('action', ACTION).eq('target', key).eq('revision', expected)
    .select('revision,updated_at');
  if (error) throw error;
  if (!data || !data.length) throw new AngleConflict(await currentRow(key));

  return commitMirror(key, list, user, data[0].updated_at || stamp, data[0].revision);
}

/* What the server actually holds for this subject, for a conflict message. */
async function currentRow(key) {
  const { data } = await supabase.from('activity_logs')
    .select('details,user_display,updated_at,created_at,revision')
    .eq('action', ACTION).eq('target', key).maybeSingle();
  if (!data) return null;
  let d = data.details;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  return {
    angles: (d && Array.isArray(d.angles)) ? d.angles : [],
    savedBy: data.user_display || '',
    savedAt: data.updated_at || data.created_at,
    revision: data.revision,
  };
}

function commitMirror(key, list, user, savedAt, revision) {
  const map = getAllAngles();
  map[key] = { angles: list, savedBy: (user && user.display) || '', savedAt, revision };
  putMirror(map);
  window.dispatchEvent(new Event('wurx-angles'));
  return { angles: list, savedAt, revision };
}

/* who last wrote this brand+month, and when · the section shows it so the
   figures are visibly in the shared table, not just on this screen */
export function getAngleMeta(brand, month) {
  const row = getAllAngles()[caKey(brand, month)];
  return row ? { savedBy: row.savedBy || '', savedAt: row.savedAt || '' } : null;
}

export const newAngleId = () =>
  'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* Every video this brand posted in this month, flattened out of the
   creator rows with the creator's name carried along.

   Grouped on the video's OWN post date rather than the creator's hire
   month: a creator signed in July who posts in August is testing an
   August angle, and filing that video under July would distort both
   months. Videos with no date fall back to the creator's month so
   nothing silently disappears. */
export function brandVideos(creators, brand, month) {
  const b = String(brand || '').trim();
  const m = String(month || '').slice(0, 7);
  const out = [];
  const seen = new Set();
  (creators || []).forEach(c => {
    if (b && (c.brand || '').trim() !== b) return;
    const hireMonth = String(c.hiring_date || '').slice(0, 7);
    (Array.isArray(c.video_codes) ? c.video_codes : []).forEach(v => {
      const url = String((v && v.video) || '').trim();
      if (!url) return;
      const vm = String((v && v.date) || '').slice(0, 7) || hireMonth;
      if (m && vm !== m) return;
      if (seen.has(url)) return;               // the same link can sit on two rows
      seen.add(url);
      out.push({
        url,
        thumb: v.thumb || '',
        views: Number(v.views) || 0,
        gmv: Number(v.revenue) || 0,
        items: Number(v.items) || 0,
        date: v.date || c.hiring_date || '',
        creator: c.name || '',
        product: v.product || '',
      });
    });
  });
  return out.sort((a, b2) => b2.gmv - a.gmv || b2.views - a.views);
}

/* What one video contributes to its angle.

   Views and GMV come off the video itself (EUKA). Two brands are not on
   EUKA at all, so a typed GMV overrides the fetched one and the row says
   which it is. Ad spend has no API anywhere, so it is always typed, per
   video, and the angle total is simply the sum. */
const typedVal = (map, url) => {
  const x = (map || {})[url];
  return (x === undefined || x === null || x === '') ? null : Number(x) || 0;
};

export function videoFig(angle, url, index) {
  const v = index[url] || null;
  const apiGmv = v ? v.gmv : 0;
  const apiViews = v ? v.views : 0;
  const gmvT = typedVal(angle.gmvOverride, url);
  const viewsT = typedVal(angle.viewsOverride, url);
  return {
    v,
    apiViews,
    views: viewsT === null ? apiViews : viewsT,
    viewsManual: viewsT !== null,
    apiGmv,
    gmv: gmvT === null ? apiGmv : gmvT,
    manual: gmvT !== null,
    ad: Number((angle.spend || {})[url]) || 0,
  };
}

/* Money and views typed against a video that is no longer in the angle
   are dead weight: they cannot be seen, cannot be edited, and would come
   back to life if the same video were ever re-added. Strip them whenever
   the angle is written. */
export function pruneAngle(angle) {
  const keep = new Set(Array.isArray(angle.videos) ? angle.videos : []);
  const trim = (m) => {
    const out = {};
    Object.keys(m || {}).forEach(k => { if (keep.has(k)) out[k] = m[k]; });
    return out;
  };
  const next = {
    ...angle,
    spend: trim(angle.spend),
    gmvOverride: trim(angle.gmvOverride),
    viewsOverride: trim(angle.viewsOverride),
  };
  /* the pre-per-video field · once a video carries its own spend, or once
     the angle is empty, the angle-level figure has nothing to describe */
  if (Object.keys(next.spend).length > 0 || keep.size === 0) delete next.adSpent;
  return next;
}

/* One angle's totals · every figure is summed from its videos, nothing
   is stored twice. */
export function angleStats(angle, videoIndex) {
  const ids = Array.isArray(angle.videos) ? angle.videos : [];
  let views = 0, gmv = 0, ad = 0, found = 0;
  ids.forEach(function (u) {
    const f = videoFig(angle, u, videoIndex);
    if (f.v) found += 1;
    views += f.views; gmv += f.gmv; ad += f.ad;
  });
  /* Angles saved before ad spend moved per-video kept one figure on the
     angle. Honour it only while the angle still HAS videos: an empty
     angle that still reported spend was the bug where every figure fell
     to zero except the money. */
  if (ids.length > 0 && ad === 0 && Number(angle.adSpent) > 0) ad = Number(angle.adSpent);
  return {
    count: ids.length, found, views, gmv, ad,
    roas: ad > 0 ? gmv / ad : null,
  };
}
