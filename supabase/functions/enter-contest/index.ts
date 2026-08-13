/**
 * enter-contest
 * ---------------------------------------------------------------------------
 * The creator's own door into the contest feature, and a SEPARATE ONE from
 * `manage-contest`, which is staff only.
 *
 * Two doors rather than one gate with a branch inside it, deliberately. The
 * role check here is narrower than anywhere else in the product: `creator`
 * exactly, and active, because `is_approved_creator()` admits ops and admin so
 * they can BROWSE a contest, while entering one is a thing only a creator does
 * (rule E6). A shared door would have carried that difference as an `if` in the
 * middle of a hundred lines, which is exactly how the wrong branch gets reached.
 *
 * Three actions, and none of them writes a row from here:
 *
 *   contest.enter     apply_for_contest        enter, or ask to
 *   contest.withdraw  withdraw_contest_entry   change your own mind
 *   contest.target    set_contest_entry_target the private number, theirs alone
 *
 * The shape is the one every function in this product uses:
 *
 *   1. Verify the access token with the auth server. Not decode it.
 *   2. Read the caller's role FROM THE PROFILES TABLE. A creator approved five
 *      minutes ago is still carrying `applicant` in their JWT, and somebody
 *      suspended five minutes ago is still carrying `creator`. The table wins.
 *   3. Validate with Zod, again, even though the browser already did.
 *   4. Hand the work to one security definer function, so the row, the entry
 *      event and the audit entry commit together or not at all.
 *
 * There is no insert, update or delete policy on any of the eleven contest
 * tables, and every database function is granted to `service_role` alone, so
 * this is the only way a creator writes anything about a contest at all.
 *
 * WHAT THIS FUNCTION MUST NEVER GROW:
 *
 *   - Anything that reads on somebody's behalf. Every creator read goes through
 *     row level security from the browser, so a bug here can never widen what
 *     anybody can see.
 *   - A friendlier sentence for somebody who is barred. See the block on
 *     `record_contest_exclusion_attempt` below. They are told they are not
 *     eligible and nothing else, ever, by decision on 2026-08-12.
 *   - Anything that acts on another creator's entry. Both entry functions match
 *     on `id AND creator_id` in the database, so an id lifted from somebody
 *     else comes back as "no such entry" rather than as a permission error that
 *     would confirm the row exists.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';

/**
 * Entering, or asking to. Which of the two it is belongs to the contest, never
 * to the request: `apply_for_contest` reads `needs_admin_approval` under a row
 * lock and decides there, so an old browser tab cannot ask to skip the queue.
 */
const Enter = z.object({
  action: z.literal('contest.enter'),
  contestId: z.uuid('Which contest?'),
  // 1000, the length `contest_entries.note` actually allows. A door wider than
  // the column hands the creator a check constraint violation instead of a
  // sentence.
  note: z.string().trim().max(1000, 'Keep that under 1000 characters').nullish(),
});

const Withdraw = z.object({
  action: z.literal('contest.withdraw'),
  entryId: z.uuid(),
});

/**
 * The creator's own private target, and the one write in this feature that
 * leaves no trail anywhere (see section 18 of the functions migration).
 *
 * NULL clears it. There is no separate clear action, because "I am not going
 * for a number any more" is the same act as changing it, and a second action
 * would be a second thing to get wrong.
 *
 * The bounds are `contest_entry_targets.target`'s own, 1 to 1000, which are in
 * turn `contest_deliverables.video_count`'s, so a target can never be a number
 * the contest could not have accepted in the first place.
 */
const Target = z.object({
  action: z.literal('contest.target'),
  entryId: z.uuid(),
  target: z.number().int().min(1, 'A target is at least one video').max(1000).nullable(),
});

const Body = z.discriminatedUnion('action', [Enter, Withdraw, Target]);

/** SQLSTATE from the database functions to something HTTP shaped. */
const STATUS_FOR_PG: Record<string, number> = {
  '42501': 403, // insufficient privilege, and the barred sentence
  '22023': 400, // invalid parameter value, most of our own refusals
  '23514': 400, // check constraint violation
  '23505': 409, // unique violation, a second live entry
  '55006': 409, // object in use: already in, already decided, work already filed
  P0002: 404, // no data found
};

/**
 * The sentence `apply_for_contest` raises for somebody who is barred, matched
 * exactly, and it is the only thing that identifies that case.
 *
 * 42501 also arrives from `assert_active_creator`, so the code alone would
 * label a suspended account as a blocked attempt, put a
 * `contest_entry.excluded_attempt` row in the log about somebody who is not
 * barred, and send a staff member hunting for an exclusion that does not exist.
 */
const BARRED = 'you are not eligible for this contest';

/**
 * Turn a raw Postgres complaint into something a person can act on.
 *
 * Nearly every refusal in this feature is raised with 22023 and already carries
 * a sentence written for a creator, so it goes back untouched: "that contest
 * closed on 31 Aug 2026 23:59 UTC" is worth ten of "That did not work". Only
 * the constraint violations need translating, because Postgres names an index.
 */
function humanise(message: string, code: string | undefined): string {
  if (code === '23505') {
    if (!message.includes('duplicate key')) return message;
    return 'You are already in this one';
  }
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

  /*
   * `creator` EXACTLY, and active. Staff reaching this door are refused like
   * anybody else: `assert_active_creator` would refuse them a layer deeper
   * anyway, and a door that agrees with the database it calls is a door nobody
   * has to reason about twice.
   */
  const isCreator = actor.role === 'creator';
  if (!isCreator || !actor.is_active) {
    // A real account reaching for something it is not entitled to. Kept.
    await admin.from('audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'contest_entry.write_denied',
      subject_type: 'contest_entry',
      detail: { reason: actor.is_active ? 'not a creator' : 'account inactive' },
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

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return reply(
      { error: parsed.error.issues[0]?.message ?? 'That request was not valid' },
      400
    );
  }
  const input = parsed.data;

  // -------------------------------------------------------------- do it ----
  let rpc: { data: unknown; error: { message?: string; code?: string } | null };

  if (input.action === 'contest.enter') {
    rpc = await admin.rpc('apply_for_contest', {
      p_actor_id: actor.id,
      p_contest_id: input.contestId,
      p_note: input.note ?? null,
    });
  } else if (input.action === 'contest.withdraw') {
    rpc = await admin.rpc('withdraw_contest_entry', {
      p_actor_id: actor.id,
      p_entry_id: input.entryId,
    });
  } else {
    rpc = await admin.rpc('set_contest_entry_target', {
      p_actor_id: actor.id,
      p_entry_id: input.entryId,
      p_target: input.target,
    });
  }

  if (rpc.error) {
    const message = rpc.error.message ?? 'That did not work';

    /*
     * THE BLOCKED ATTEMPT, recorded here rather than in `apply_for_contest`.
     *
     * A `raise` aborts the transaction and would take any audit row written
     * inside it with it, so the record of somebody barred trying anyway has to
     * be written by a second call, after the first one has failed (rule X4).
     * `record_contest_exclusion_attempt` bumps the exclusion's counter and
     * writes `contest_entry.excluded_attempt` on the contest.
     *
     * NOTHING ABOUT THE REPLY CHANGES BECAUSE OF THIS. The creator gets the
     * database's own flat sentence, the same one, at the same speed, whether or
     * not a row was bumped. There was no Enter button on their screen in the
     * first place, since row security hides the contest entirely, so anything
     * that reaches this line arrived at the API by hand.
     *
     * Failures here are swallowed on purpose: a creator's refusal must not turn
     * into a 500 because our own bookkeeping call had a bad minute.
     */
    if (
      input.action === 'contest.enter' &&
      rpc.error.code === '42501' &&
      message.includes(BARRED)
    ) {
      const recorded = await admin.rpc('record_contest_exclusion_attempt', {
        p_contest_id: input.contestId,
        p_user_id: actor.id,
      });
      if (recorded.error)
        console.error('enter-contest could not record an attempt', recorded.error);
    }

    /*
     * An unrecognised SQLSTATE is OUR fault, not the creator's, so it is a 500
     * and it is logged. The case this is written for is an argument list
     * drifting: PGRST202 arrives as "Could not find the function
     * public.apply_for_contest(...) in the schema cache", which used to reach
     * the screen as a 400, as though the person had typed something wrong.
     */
    const status = STATUS_FOR_PG[rpc.error.code ?? ''] ?? 500;
    if (status === 500) console.error('enter-contest failed', input.action, rpc.error);

    return reply(
      {
        error:
          status === 500
            ? 'Something went wrong at our end. It has been logged.'
            : humanise(message, rpc.error.code),
      },
      status
    );
  }

  return reply({ result: rpc.data }, 200);
});
