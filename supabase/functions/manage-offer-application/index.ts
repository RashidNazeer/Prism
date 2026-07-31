/**
 * manage-offer-application
 * ---------------------------------------------------------------------------
 * A creator asking for an offer, and staff deciding.
 *
 * The first door in this product that BOTH sides use, so the role check is per
 * action rather than one gate at the top:
 *
 *   application.create     an active creator, and only for themselves
 *   application.withdraw   the creator who made it, and only while pending
 *   application.review     active staff
 *
 * The identity behind all three comes from the profiles TABLE, never from the
 * request body and never from a JWT claim. A creator approved five minutes ago
 * is still carrying `applicant` in their token, and somebody demoted five
 * minutes ago is still carrying `admin`.
 *
 * There are no insert, update or delete policies on `offer_applications`. The
 * database functions are granted to `service_role` alone. This is the only way
 * a row gets written.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';

const money = z
  .number()
  .finite()
  .nonnegative()
  .max(99_999_999)
  // Stored as numeric(12,2). Round here rather than letting Postgres silently
  // truncate a third decimal place somebody pasted in.
  .transform((n) => Math.round(n * 100) / 100);

const CreateBody = z.object({
  action: z.literal('application.create'),
  offerId: z.uuid('Which offer?'),
  // Null on both means "as offered". Present on both means they are countering.
  videoCount: z.number().int().min(1, 'At least one video').max(1000).nullish(),
  amount: money.nullish(),
  note: z.string().trim().max(1000).nullish(),
});

const WithdrawBody = z.object({
  action: z.literal('application.withdraw'),
  applicationId: z.uuid(),
});

const ReviewBody = z.object({
  action: z.literal('application.review'),
  applicationId: z.uuid(),
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(1000).nullish(),
});

const Body = z.discriminatedUnion('action', [CreateBody, WithdrawBody, ReviewBody]);

/** SQLSTATE from the database functions to something HTTP shaped. */
const STATUS_FOR_PG: Record<string, number> = {
  '42501': 403, // insufficient privilege
  P0002: 404, // no data found
  '22023': 400, // invalid parameter value
  '23503': 409, // foreign key, something still depends on it
  '23505': 409, // unique violation, a second open request
  '23514': 400, // check constraint violation
  '55006': 409, // object in use: already asked, or already decided
};

function humanise(message: string, code: string | undefined): string {
  if (code === '23505') return 'You have already asked for this one';
  if (code === '23514') return 'One of those values is outside what we allow';
  return message;
}

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return reply({ error: 'Not signed in' }, 401);

  // ---------------------------------------------------------- who is this --
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) return reply({ error: 'Not signed in' }, 401);

  // Service role from here on. Nothing above this line was trusted.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: actor, error: actorErr } = await admin
    .from('profiles')
    .select('id, email, role, is_active')
    .eq('id', userData.user.id)
    .single();

  if (actorErr || !actor) return reply({ error: 'Not allowed' }, 403);
  if (!actor.is_active) return reply({ error: 'Not allowed' }, 403);

  // ------------------------------------------------------------ the input --
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reply({ error: 'Expected a JSON body' }, 400);
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return reply(
      { error: parsed.error.issues[0]?.message ?? 'That request was not valid' },
      400
    );
  }
  const input = parsed.data;

  // ------------------------------------------------------------- the gate --
  const isStaff = actor.role === 'admin' || actor.role === 'ops';
  const isCreator = actor.role === 'creator';
  const needsStaff = input.action === 'application.review';

  if ((needsStaff && !isStaff) || (!needsStaff && !isCreator)) {
    // A real account reaching for something it is not entitled to. Kept.
    await admin.from('audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'offer_application.write_denied',
      subject_type: 'offer_application',
      detail: { reason: needsStaff ? 'not staff' : 'not a creator', attempted: input.action },
    });
    return reply({ error: 'Not allowed' }, 403);
  }

  // Countering means naming BOTH numbers. Half a counter offer is not one, and
  // "5 videos for nothing" is not what anybody meant to send.
  if (input.action === 'application.create') {
    const hasVideos = input.videoCount !== null && input.videoCount !== undefined;
    const hasAmount = input.amount !== null && input.amount !== undefined;
    if (hasVideos !== hasAmount) {
      return reply(
        { error: 'To change the terms, give both the number of videos and your price' },
        400
      );
    }
  }

  // -------------------------------------------------------------- do it ----
  let rpc: { data: unknown; error: { message?: string; code?: string } | null };

  if (input.action === 'application.create') {
    rpc = await admin.rpc('apply_for_offer', {
      p_actor_id: actor.id,
      p_offer_id: input.offerId,
      p_video_count: input.videoCount ?? null,
      p_amount: input.amount ?? null,
      p_note: input.note ?? null,
    });
  } else if (input.action === 'application.withdraw') {
    rpc = await admin.rpc('withdraw_offer_application', {
      p_actor_id: actor.id,
      p_application_id: input.applicationId,
    });
  } else {
    rpc = await admin.rpc('review_offer_application', {
      p_actor_id: actor.id,
      p_application_id: input.applicationId,
      p_decision: input.decision,
      p_note: input.note ?? null,
    });
  }

  if (rpc.error) {
    const status = STATUS_FOR_PG[rpc.error.code ?? ''] ?? 500;
    if (status === 500) {
      console.error('manage-offer-application failed', input.action, rpc.error);
    }
    return reply(
      { error: humanise(rpc.error.message ?? 'Something went wrong', rpc.error.code) },
      status
    );
  }

  return reply({ ok: true, result: rpc.data }, 200);
});
