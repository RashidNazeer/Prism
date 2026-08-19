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
 * Four actions, and none of them writes a row from here:
 *
 *   contest.enter     apply_for_contest        enter, or ask to
 *   contest.withdraw  withdraw_contest_entry   change your own mind
 *   contest.target    set_contest_entry_target the private number, theirs alone
 *   progress.submit   submit_contest_progress  what they have achieved so far
 *
 * THE SECURITY LINE OF THE PROGRESS FEATURE RUNS THROUGH THIS FILE, so it is
 * stated once here and enforced twice below. A CREATOR MAY WRITE THEIR OWN
 * ACHIEVEMENT AND NOTHING ELSE: not a target, not a reward, not another
 * entrant's figures, and not their own confirmation.
 *
 *   1. `ProgressSubmit` is a STRICT object with no target field and no reward
 *      field, so a request carrying either is refused outright rather than
 *      quietly stripped. There is nothing to forget to validate, because there
 *      is nothing to accept.
 *   2. The call to `submit_contest_progress` is rebuilt key by key below, so
 *      only the seven fields the database reads ever reach it.
 *   3. The database function itself takes no target argument, no reward
 *      argument and no status argument, matches the entry on creator_id as well
 *      as id, and hard codes the claim as `pending`.
 *
 * Nothing here counts as money either. A claim sits at `pending` until a member
 * of staff confirms it through `manage-contest`, because a creator typing their
 * own GMV is a creator typing their own payslip.
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
 * The TikTok item id, read out of the link.
 *
 * That id is the only thing ad money is ever matched on: the report call
 * filters on `item_id` and `tiktok_video_daily` is keyed on it. A contest video
 * without one can never have figures, which is exactly the state every contest
 * video was in until 2026-08-20.
 *
 * The same pattern `videoIdFrom` uses in the browser and the same one the
 * backfill in `20260820140000` uses, so all three agree about what an id is. A
 * link that carries no id returns null, and that video simply reports nothing
 * rather than matching some other video by accident.
 */
function idFromTikTokUrl(url: string): string | null {
  return url.match(/\/video\/(\d{6,32})/)?.[1] ?? null;
}

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

/**
 * ONE NEW VIDEO, filed with a progress update.
 *
 * `strictObject`, so a key nobody asked for is a refusal rather than a silent
 * strip. Every bound is `contest_submissions`' own column check: the link is
 * https and between 12 and 2048 characters, the ad code is between 3 and 120.
 * A door narrower than the column refuses work the database would have taken; a
 * door wider than it hands a creator a constraint violation instead of a
 * sentence.
 *
 * The optional four are what the preview lookup fills in. They are decoration
 * on a card, never a fact about money.
 */
const ProgressVideo = z.strictObject({
  videoUrl: z
    .url({
      protocol: /^https$/,
      error: 'Every new video needs a link that starts with https://',
    })
    .min(12, 'Every new video needs a link that starts with https://')
    .max(2048, 'That link is too long to be a video link'),
  adCode: z
    .string()
    .trim()
    .min(3, 'Every new video needs its ad code')
    .max(120, 'Keep an ad code under 120 characters'),
  adAuthorized: z.boolean().default(false),
  thumbnailUrl: z.string().trim().max(2048).nullish(),
  videoTitle: z.string().trim().max(300).nullish(),
  videoAuthor: z.string().trim().max(160).nullish(),
  embedId: z.string().trim().max(120).nullish(),
});

/**
 * WHAT THEY HAVE ACHIEVED, TYPED BY THEM, AND WAITING FOR STAFF.
 *
 * THE FIGURES ARE CUMULATIVE TOTALS, NOT INCREMENTS. "I am at 640 GMV and 6
 * videos", never "I did 140 more". Every bound below is the sentence
 * `submit_contest_progress` raises for the same case, said here so a creator
 * gets a sentence at the door rather than a numeric overflow or a constraint
 * violation from the column. The database remains the guarantee: it is the only
 * layer that knows what was claimed before, so the two rules that depend on
 * history live there and only there.
 *
 *   - THE VIDEO COUNT MAY NOT GO BACKWARDS, refused by naming both numbers.
 *   - EXACTLY THE NEW VIDEOS ARE ASKED FOR, never the total: 5 to 6 asks for
 *     one link and ad code, not six, and the earlier five are shown rather than
 *     re-entered.
 *
 * NO TARGET FIELD AND NO REWARD FIELD, and `strictObject` means one cannot be
 * smuggled in as an extra key either. Read the header.
 */
const ProgressSubmit = z.strictObject({
  action: z.literal('progress.submit'),
  entryId: z.uuid(),
  gmv: z
    .number()
    .finite()
    .min(0, 'A GMV figure cannot be less than zero')
    .max(100_000_000, 'That GMV figure looks like a typo')
    // Stored as numeric(14, 2). Rounded here rather than letting Postgres
    // truncate a third decimal place somebody pasted in.
    .transform((n) => Math.round(n * 100) / 100),
  videoCount: z
    .number()
    .int('A video count is a whole number of videos')
    .min(0, 'A video count cannot be less than zero')
    .max(1000, 'That video count looks like a typo'),
  /*
   * The ceiling is the video count's own, because an update can add at most as
   * many videos as the count allows in total. The duplicate check is the same
   * comparison the database makes, `lower(trim(...))`, so the two cannot
   * disagree about what counts as the same link.
   */
  videos: z
    .array(ProgressVideo)
    .max(1000, 'That is more videos than one update can carry')
    .refine(
      (list) =>
        new Set(list.map((v) => v.videoUrl.trim().toLowerCase())).size === list.length,
      'The same link is in that list twice'
    ),
});

const Body = z.discriminatedUnion('action', [Enter, Withdraw, Target, ProgressSubmit]);

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
    /*
     * Three different rows can collide now, so the fallback alone would tell
     * somebody filing a video that they are already in a contest they have been
     * in for a fortnight. `submit_contest_progress` raises its own sentences for
     * both of these before the index is reached; these needles are for the race
     * where two taps arrive at once and the index answers first.
     */
    if (message.includes('one_pending_idx')) {
      return 'Your last update is still with the team, so wait for them to confirm it before sending another';
    }
    if (message.includes('video_url')) {
      return 'You have already posted that link on this contest';
    }
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
    const issue = parsed.error.issues[0];
    /*
     * A field nobody asked for gets its own sentence, because the only requests
     * that carry one are hand written: the browser sends what these schemas
     * describe. `progress.submit` is strict precisely so a target or a reward
     * arriving in the body is a refusal rather than a key quietly dropped, and
     * a refusal that says so is what makes that testable.
     */
    const message =
      issue?.code === 'unrecognized_keys'
        ? 'That request carried a field it is not allowed to send'
        : (issue?.message ?? 'That request was not valid');
    return reply({ error: message }, 400);
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
  } else if (input.action === 'progress.submit') {
    /*
     * REBUILT KEY BY KEY, and that is the second half of the guarantee in the
     * header rather than a formatting habit. Only these seven fields per video,
     * and only these three figures, can reach the database, whatever else was
     * in the body. `p_actor_id` comes from the verified token and never from
     * the request, so the entry is matched on somebody the auth server named.
     *
     * The keys are snake_case because the function reads them straight out of
     * jsonb by name. A camelCase key here would arrive as a null link and be
     * refused as a missing one, which is a confusing way to find a typo.
     */
    rpc = await admin.rpc('submit_contest_progress', {
      p_actor_id: actor.id,
      p_entry_id: input.entryId,
      p_gmv: input.gmv,
      p_video_count: input.videoCount,
      p_videos: input.videos.map((v) => ({
        video_url: v.videoUrl,
        ad_code: v.adCode,
        ad_authorized: v.adAuthorized,
        thumbnail_url: v.thumbnailUrl ?? null,
        video_title: v.videoTitle ?? null,
        video_author: v.videoAuthor ?? null,
        /*
         * THE ID IS DERIVED HERE, SERVER SIDE, and only falls back to what the
         * browser sent. Until 2026-08-20 this was `v.embedId ?? null` and the
         * creator's dialog sent no id at all, so every contest video ever filed
         * carried a null one — and an id is the ONLY thing ad money is matched
         * on, so a contest video could never have any.
         *
         * Read out of the link rather than fetched: a TikTok URL carries the id
         * in its path, which is exact, free, and still works for a post that
         * has since been deleted. oEmbed is none of those things and is used
         * elsewhere only because the thumbnail and title are wanted too.
         *
         * Never trusted from the client first. A creator who could name the id
         * separately from the link could point their row at somebody else's
         * video while the link on screen still looked like their own.
         */
        embed_id: idFromTikTokUrl(v.videoUrl) ?? v.embedId ?? null,
      })),
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
