/**
 * collab-angles
 * ---------------------------------------------------------------------------
 * The Categorise button on Paid Collabs -> Reporting -> Creative angle testing.
 *
 * Umar, 2026-10-06: "whenever I click the categorise/process button for a
 * certain brand its relevant brief and the new videos are sent to this
 * machine". Filing a month of videos into creative angles is done by hand
 * today: somebody watches each one and drops it into an angle. This queues
 * that work; `collab-angles-sync` does it, five videos at a time.
 *
 * TWO ACTIONS, both read-mostly:
 *   angles.start     queue this brand's unfiled videos for this month
 *   angles.progress  how far along, for the ring around the button
 *
 * THE VIDEO LIST IS DERIVED HERE, NOT SENT BY THE BROWSER. The audit machine
 * downloads whatever link it is given, so a list that came from the page would
 * let anyone holding a staff token point it at any URL on the internet. The
 * only input this trusts is a brand and a month.
 *
 * WHO CAN RUN IT: an active `ops`, `admin` or `ads_manager`. The screen also
 * hides the button unless the person has the vendored app's `canEditAngles`,
 * which is the same gate as New angle; this is the half that is enforced.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';
import { tiktokVideoId } from '../_shared/audit-api.ts';

const STAFF = ['ops', 'admin', 'ads_manager'];
const MONTH = /^\d{4}-\d{2}$/;

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('angles.start'),
    brand: z.string().trim().min(1).max(120),
    month: z.string().regex(MONTH, 'month must be YYYY-MM'),
  }),
  z.object({
    action: z.literal('angles.progress'),
    brand: z.string().trim().min(1).max(120),
    month: z.string().regex(MONTH, 'month must be YYYY-MM'),
  }),
]);

/** A brief row, as the queue needs it. */
interface Brief {
  brand: string;
  aliases: string[] | null;
  product: string;
  brief_url: string;
  angles: string[] | null;
  position: number;
}

/** Does this brief belong to this brand, under any of its spellings? */
function briefMatches(b: Brief, brand: string): boolean {
  const want = brand.trim().toLowerCase();
  if ((b.brand ?? '').trim().toLowerCase() === want) return true;
  return (b.aliases ?? []).some((a) => (a ?? '').trim().toLowerCase() === want);
}

export interface QueueVideo {
  video_id: string;
  video_url: string;
  creator: string | null;
  month: string;
}

/**
 * This brand's videos for this month, out of the Paid Collabs creator rows.
 *
 * The month rule is the screen's own (`brandVideos` in angleStore.js): the
 * video's date when it has one, else the creator's hiring month, so a creator
 * signed in July who posts in August is testing an August angle. A video with
 * neither is not on the screen at all and cannot be filed, so it is counted
 * and skipped rather than guessed at.
 */
export function videosForBrand(
  creators: Array<Record<string, unknown>>,
  brand: string,
  month: string,
): { videos: QueueVideo[]; noDate: number } {
  const want = brand.trim();
  const byId = new Map<string, QueueVideo>();
  let noDate = 0;

  for (const c of creators) {
    if (String(c.brand ?? '').trim() !== want) continue;
    const hire = String(c.hiring_date ?? '').slice(0, 7);
    const codes = Array.isArray(c.video_codes) ? c.video_codes : [];
    for (const raw of codes) {
      const v = raw as Record<string, unknown> | null;
      const url = String(v?.video ?? '').trim();
      if (!url) continue;
      const vm = String(v?.date ?? '').slice(0, 7) || hire;
      if (!vm) {
        noDate += 1;
        continue;
      }
      if (vm !== month) continue;
      const id = tiktokVideoId(url);
      if (!id) {
        noDate += 1;
        continue;
      }
      /* The same video sits on two creator rows after a bulk paste. One entry
         wins, and it keeps the link spelling that row holds, because that is
         the string the screen will match when it draws the card. */
      if (!byId.has(id)) {
        byId.set(id, {
          video_id: id,
          video_url: url,
          creator: (String(c.name ?? '').trim() || null),
          month,
        });
      }
    }
  }
  return { videos: [...byId.values()], noDate };
}

async function progressOf(db: SupabaseClient, brand: string, month: string) {
  const { data, error } = await db
    .from('collab_angle_videos')
    .select('status')
    .eq('brand', brand)
    .eq('month', month);
  if (error) throw new Error(error.message);

  const counts = { queued: 0, sent: 0, filed: 0, skipped: 0, failed: 0, needs_review: 0 };
  for (const r of (data ?? []) as Array<{ status: string }>) {
    if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
  }
  const total = (data ?? []).length;
  const left = counts.queued + counts.sent;

  const { data: batch } = await db
    .from('collab_angle_batches')
    .select('state, last_phase, n_videos, provider_job, error')
    .eq('brand', brand)
    .eq('month', month)
    .in('state', ['submitting', 'running', 'filing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  /* A rough number, and the UI says so. Five and a half minutes a video is
     what a first run measured; a video the machine has seen before is far
     quicker, so this over-estimates rather than under-promises. */
  const eta = left > 0 ? Math.round(left * 5.5 * 60) : 0;

  return {
    total,
    ...counts,
    running_batch: batch
      ? {
        state: (batch as { state: string }).state,
        last_phase: (batch as { last_phase: string | null }).last_phase,
        n_videos: (batch as { n_videos: number }).n_videos,
      }
      : null,
    eta_seconds: eta,
  };
}

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => json(body, status, req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return reply({ error: 'Not signed in' }, 401);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* Verified against the auth server, never decoded from the token. */
  const { data: userData, error: userErr } = await admin.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ''),
  );
  if (userErr || !userData?.user) return reply({ error: 'Not signed in' }, 401);

  const { data: actor } = await admin
    .from('profiles')
    .select('id, email, role, is_active')
    .eq('id', userData.user.id)
    .single();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reply({ error: 'Send a JSON body' }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return reply({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, 400);
  }
  const body = parsed.data;

  if (!actor?.is_active || !STAFF.includes(String(actor?.role))) {
    await admin.from('audit_log').insert({
      actor_id: actor?.id ?? null,
      actor_email: actor?.email ?? null,
      actor_role: actor?.role ?? null,
      action: 'collab_angles.write_denied',
      subject_type: 'brand',
      detail: { brand: body.brand, month: body.month, wanted: body.action },
    });
    return reply({ error: 'Not allowed' }, 403);
  }

  const brand = body.brand.trim();

  try {
    if (body.action === 'angles.progress') {
      return reply({ ok: true, ...(await progressOf(admin, brand, body.month)) });
    }

    /* ── angles.start ──────────────────────────────────────────────────── */
    const { data: briefRows, error: briefErr } = await admin
      .from('collab_brand_briefs')
      .select('brand, aliases, product, brief_url, angles, position')
      .eq('is_active', true);
    if (briefErr) throw new Error(briefErr.message);

    const briefs = ((briefRows ?? []) as Brief[]).filter((b) => briefMatches(b, brand));
    if (!briefs.length) {
      return reply({
        error: `${brand} has no content brief on file, so its videos cannot be ` +
          `categorised. Add one to collab_brand_briefs first.`,
      }, 422);
    }

    const { data: creators, error: crErr } = await admin
      .schema('wurxbase')
      .from('creators')
      .select('name, brand, hiring_date, video_codes');
    if (crErr) throw new Error(crErr.message);

    const { videos, noDate } = videosForBrand(
      (creators ?? []) as Array<Record<string, unknown>>,
      brand,
      body.month,
    );

    if (!videos.length) {
      return reply({
        ok: true,
        queued: 0,
        already: 0,
        skipped_no_date: noDate,
        brand,
        month: body.month,
        note: `No videos posted for ${brand} in ${body.month}.`,
      });
    }

    /* Rows already in the queue for this brand and month, whatever their
       status: a video that failed or was skipped is not queued again by a
       second press of the button, it is left as it is. */
    const { data: existing, error: exErr } = await admin
      .from('collab_angle_videos')
      .select('video_id')
      .eq('brand', brand)
      .eq('month', body.month);
    if (exErr) throw new Error(exErr.message);
    const known = new Set((existing ?? []).map((r) => String((r as { video_id: string }).video_id)));

    const fresh = videos.filter((v) => !known.has(v.video_id));
    if (fresh.length) {
      const { error: insErr } = await admin.from('collab_angle_videos').insert(
        fresh.map((v) => ({
          brand,
          month: body.month,
          video_id: v.video_id,
          video_url: v.video_url,
          creator: v.creator,
          status: 'queued',
        })),
      );
      if (insErr) throw new Error(insErr.message);
    }

    await admin.from('audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'collab_angles.start',
      subject_type: 'brand',
      detail: {
        brand,
        month: body.month,
        queued: fresh.length,
        already: videos.length - fresh.length,
        briefs: briefs.length,
      },
    });

    return reply({
      ok: true,
      queued: fresh.length,
      already: videos.length - fresh.length,
      skipped_no_date: noDate,
      brand,
      month: body.month,
      briefs: briefs.length,
    });
  } catch (err) {
    console.error('collab-angles failed', body.action, err);
    return reply({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
