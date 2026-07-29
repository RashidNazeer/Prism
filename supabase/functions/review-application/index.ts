/**
 * review-application
 * ---------------------------------------------------------------------------
 * Approve or reject a creator application.
 *
 * This is the only route to a decision. Row level security already stops an
 * applicant editing their own status, and the database function is granted to
 * `service_role` alone, so nothing reachable from a browser can approve anyone.
 * This function is the piece that decides WHO is allowed to ask.
 *
 * The order matters:
 *
 *   1. Verify the access token with the auth server. Not decode it. A JWT is
 *      signed, but this code never gets to be the thing that trusts a
 *      signature it did not check.
 *   2. Read the caller's role FROM THE PROFILES TABLE, not from the token's
 *      claims. Claims can be up to an hour stale, so an admin who was
 *      suspended five minutes ago is still carrying an admin claim right now.
 *      The table is the truth.
 *   3. Validate the body with Zod, again, even though the browser already did.
 *   4. Hand the whole decision to one Postgres function so status, role, tier
 *      and the audit row commit together or not at all.
 *
 * A signed-in user who is not staff and tries anyway gets a 403 and a row in
 * audit_log with their name on it.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';

const TIERS = ['creator', 'rising', 'pro', 'elite'] as const;

const ReviewBody = z
  .object({
    applicationId: z.uuid('applicationId must be a UUID'),
    decision: z.enum(['approved', 'rejected']),
    tier: z.enum(TIERS).nullish(),
    note: z.string().trim().max(1000, 'Keep the note under 1000 characters').nullish(),
  })
  .refine((v) => v.decision !== 'approved' || Boolean(v.tier), {
    message: 'A tier is required when approving',
    path: ['tier'],
  })
  .refine((v) => v.decision !== 'rejected' || !v.tier, {
    message: 'A tier cannot be set when rejecting',
    path: ['tier'],
  });

/** SQLSTATE from the database function to something HTTP-shaped. */
const STATUS_FOR_PG: Record<string, number> = {
  '42501': 403, // insufficient privilege
  P0002: 404, // no data found
  '55006': 409, // object in use, our "already reviewed"
  '22023': 400, // invalid parameter value
};

Deno.serve(async (req) => {
  // Every response below carries the CORS headers. Miss one and the browser
  // discards the body, leaving a reviewer staring at a button that "does
  // nothing" while the server thinks it answered fine.
  const reply = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return reply({ error: 'Not signed in' }, 401);
  }

  // ---------------------------------------------------------- who is this --
  // Anon key plus the caller's token. getUser() asks the auth server, so an
  // expired, revoked or hand-crafted token fails here.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) {
    return reply({ error: 'Not signed in' }, 401);
  }
  const caller = userData.user;

  // Service role from here on. Nothing above this line was trusted.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: actor, error: actorErr } = await admin
    .from('profiles')
    .select('id, email, role, is_active')
    .eq('id', caller.id)
    .single();

  if (actorErr || !actor) {
    return reply({ error: 'Not allowed' }, 403);
  }

  const isStaff = actor.role === 'admin' || actor.role === 'ops';

  if (!isStaff || !actor.is_active) {
    // A real account asking for something it is not entitled to. Worth keeping.
    await admin.from('audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'application.review_denied',
      subject_type: 'application',
      detail: { reason: actor.is_active ? 'not staff' : 'account inactive' },
    });
    return reply({ error: 'Not allowed' }, 403);
  }

  // ------------------------------------------------------------ the input --
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reply({ error: 'Expected a JSON body' }, 400);
  }

  const parsed = ReviewBody.safeParse(raw);
  if (!parsed.success) {
    return reply(
      { error: parsed.error.issues[0]?.message ?? 'That request was not valid' },
      400
    );
  }
  const { applicationId, decision, tier, note } = parsed.data;

  // ------------------------------------------------------------ do it -----
  const { data, error } = await admin.rpc('review_application', {
    p_application_id: applicationId,
    p_decision: decision,
    p_actor_id: actor.id,
    p_tier: decision === 'approved' ? tier : null,
    p_note: note ?? null,
  });

  if (error) {
    const status = STATUS_FOR_PG[error.code ?? ''] ?? 500;
    // The database messages are prefixed and safe to show a staff member; they
    // describe the state of the application, never anything secret.
    const message = (error.message ?? 'Something went wrong').replace(
      /^review_application:\s*/,
      ''
    );
    if (status === 500) console.error('review_application failed', error);
    return reply({ error: message }, status);
  }

  return reply({ ok: true, result: data }, 200);
});

