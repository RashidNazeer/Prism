/**
 * Filing a video into the creative angle store, from the server.
 *
 * The store is one row per brand and month in `wurxbase.activity_logs`
 * (`action = 'CREATIVE_ANGLE'`, `target = 'Brand::YYYY-MM'`) whose `details`
 * holds the whole array of angles. The screen writes it the same way, by
 * replacing that array wholesale, which is the fact that shapes everything
 * below.
 *
 * THE REVISION CHECK IS NOT OPTIONAL. `src/vendor/wurxbase/angleStore.js`
 * conditions its update on the revision it loaded, so a tab that saves after
 * us gets `AngleConflict`, reloads, and loses nothing. That only holds while
 * every writer bumps `revision`. A server write that forgets to would be
 * silently replaced by the next person who presses a key in an open tab, and
 * their stale copy has none of our filing in it.
 *
 * WE ONLY ADD. No delete, never an empty array, and every existing angle keeps
 * every key it had: `spend`, `gmvOverride`, `viewsOverride`, `adSpent`, and
 * anything a future version of their app puts there. Those are figures a
 * person typed in by hand, and they are the reason this merges rather than
 * writes.
 *
 * A VIDEO SOMEBODY HAS ALREADY FILED IS LEFT WHERE IT IS. Matching is by
 * TikTok video id across every angle of the row, not by string equality: the
 * same video sits in `video_codes` in several spellings, so a string compare
 * would file it twice and the screen would show it under two angles.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9';
import { tiktokVideoId } from './audit-api.ts';

const ACTION = 'CREATIVE_ANGLE';
const WHO = 'Auto-categoriser';
const MAX_TRIES = 5;

/** One angle as the screen stores it. Unknown keys are carried through. */
export interface Angle {
  id: string;
  title: string;
  videos: string[];
  spend?: Record<string, number>;
  gmvOverride?: Record<string, number>;
  viewsOverride?: Record<string, number>;
  auto?: { source: string; name: string };
  [k: string]: unknown;
}

export const angleKey = (brand: string, month: string) =>
  `${(brand ?? '').trim()}::${(month ?? '').slice(0, 7)}`;

/** The id format `newAngleId()` uses, so ours are indistinguishable. */
function newAngleId(): string {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * A title reduced to what identifies it. A person renaming "Playtime" to
 * " playtime " must not get a second category, and a brief's curly quotes
 * must match a title somebody retyped with straight ones.
 */
function sameTitle(a: string, b: string): boolean {
  const norm = (s: string) =>
    (s ?? '')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  return norm(a) === norm(b);
}

/** Find the angle this name belongs to: our own marker first, then the title. */
function findAngle(angles: Angle[], name: string): Angle | undefined {
  return (
    angles.find((a) => a?.auto?.name && sameTitle(String(a.auto.name), name)) ??
    angles.find((a) => sameTitle(String(a?.title ?? ''), name))
  );
}

/** Every TikTok video id already filed anywhere in this row. */
function filedIds(angles: Angle[]): Set<string> {
  const out = new Set<string>();
  for (const a of angles) {
    for (const v of (Array.isArray(a?.videos) ? a.videos : [])) {
      const id = tiktokVideoId(String(v));
      if (id) out.add(id);
    }
  }
  return out;
}

export interface FilePlacement {
  /** The link exactly as it is written in `video_codes`. */
  url: string;
  /** The angle name the backend returned, or "Matched None". */
  angle: string;
}

export interface FileResult {
  filed: string[];
  /** Already in an angle, left alone. */
  alreadyFiled: string[];
  createdAngles: string[];
  revision: number;
}

interface Row {
  id: number;
  details: unknown;
  revision: number | null;
}

async function readRow(db: SupabaseClient, target: string): Promise<Row | null> {
  const { data, error } = await db
    .schema('wurxbase')
    .from('activity_logs')
    .select('id, details, revision')
    .eq('action', ACTION)
    .eq('target', target)
    .maybeSingle();
  if (error) throw new Error(`could not read the angle row: ${error.message}`);
  return (data as Row | null) ?? null;
}

function anglesOf(row: Row | null): Angle[] {
  let d: unknown = row?.details;
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d);
    } catch {
      d = null;
    }
  }
  const list = (d as { angles?: unknown } | null)?.angles;
  return Array.isArray(list) ? list as Angle[] : [];
}

/**
 * Every TikTok video id already sitting in an angle for this brand and month.
 *
 * WHY THE QUEUE FUNCTION ASKS THIS AT ALL. The queue table only knows about
 * videos this machine has been given. Most months are partly or wholly filed by
 * hand before anybody presses Categorise (Biostime already had 59 videos in 3
 * angles for August 2026), and sending those to the audit machine costs about
 * five minutes each only to have `filePlacements` discard them as duplicates at
 * the very end. Asking the store first means we never send them.
 *
 * Read only. An absent row is a month nobody has started, so: an empty set.
 * The brand is used verbatim, exactly as `angleKey` does for writing, which is
 * case sensitive here even though the brief lookup is not. Ids come from
 * `tiktokVideoId`, never from the link text, because one video is stored in
 * several spellings.
 */
export async function filedVideoIds(
  db: SupabaseClient,
  brand: string,
  month: string,
): Promise<Set<string>> {
  const row = await readRow(db, angleKey(brand, month));
  return filedIds(anglesOf(row));
}

/**
 * Add these videos to their angles, under one brand and month.
 *
 * Retries the whole read-merge-write when somebody saved underneath us, which
 * is the normal case rather than an error: the person on the screen and this
 * worker are both writing the same row.
 */
export async function filePlacements(
  db: SupabaseClient,
  args: { brand: string; month: string; placements: FilePlacement[] },
): Promise<FileResult> {
  const target = angleKey(args.brand, args.month);
  let lastConflict = '';

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const row = await readRow(db, target);
    const angles: Angle[] = anglesOf(row).map((a) => ({ ...a }));
    const already = filedIds(angles);

    const filed: string[] = [];
    const alreadyFiled: string[] = [];
    const created: string[] = [];

    for (const p of args.placements) {
      const id = tiktokVideoId(p.url);
      if (id && already.has(id)) {
        alreadyFiled.push(p.url);
        continue;
      }
      let angle = findAngle(angles, p.angle);
      if (!angle) {
        angle = {
          id: newAngleId(),
          title: p.angle,
          videos: [],
          spend: {},
          gmvOverride: {},
          viewsOverride: {},
          auto: { source: 'brief', name: p.angle },
        };
        angles.push(angle);
        created.push(p.angle);
      }
      const videos = Array.isArray(angle.videos) ? angle.videos : [];
      /* The screen keys its rows on the URL, and a repeated key is a React
         console error, which the browser suite treats as a failure. */
      if (!videos.some((v) => v === p.url)) videos.push(p.url);
      angle.videos = videos;
      if (id) already.add(id);
      filed.push(p.url);
    }

    if (!filed.length && !created.length) {
      return { filed, alreadyFiled, createdAngles: created, revision: row?.revision ?? 0 };
    }

    const stamp = new Date().toISOString();

    if (!row) {
      const { data, error } = await db
        .schema('wurxbase')
        .from('activity_logs')
        .insert({
          action: ACTION,
          target,
          details: { angles },
          updated_at: stamp,
          revision: 1,
          user_id: null,
          user_display: WHO,
        })
        .select('revision')
        .single();
      if (!error) {
        return { filed, alreadyFiled, createdAngles: created, revision: data?.revision ?? 1 };
      }
      /* 23505: somebody created the row between our read and our write. */
      if (error.code !== '23505') {
        throw new Error(`could not create the angle row: ${error.message}`);
      }
      lastConflict = 'the row was created by somebody else';
      continue;
    }

    const expected = row.revision;
    if (expected === null || expected === undefined) {
      /* A row written before the revision column existed cannot be written
         safely: there is nothing to condition on. Refuse rather than clobber. */
      throw new Error(
        'this brand and month has an angle row with no revision, which cannot be ' +
          'written safely. Open the screen and save it once, then run again.',
      );
    }

    const { data, error } = await db
      .schema('wurxbase')
      .from('activity_logs')
      .update({
        details: { angles },
        updated_at: stamp,
        revision: expected + 1,
        user_display: WHO,
      })
      .eq('action', ACTION)
      .eq('target', target)
      .eq('revision', expected)
      .select('revision');
    if (error) throw new Error(`could not write the angle row: ${error.message}`);
    if (data && data.length) {
      return {
        filed,
        alreadyFiled,
        createdAngles: created,
        revision: data[0]?.revision ?? expected + 1,
      };
    }
    lastConflict = 'somebody saved this test while we were writing it';
  }

  throw new Error(
    `gave up after ${MAX_TRIES} attempts: ${lastConflict}. Nothing was changed.`,
  );
}
