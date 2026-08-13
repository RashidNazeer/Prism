/**
 * manage-contest
 * ---------------------------------------------------------------------------
 * Every STAFF write in the contest feature. The creator side (entering,
 * withdrawing, setting a private target, filing a video) lands in a later step
 * and gets its own door, because the role check is different and mixing them
 * makes it harder to see which is which.
 *
 * Same shape as `manage-brand`, for the same reasons:
 *
 *   1. Verify the access token with the auth server. Not decode it.
 *   2. Read the caller's role FROM THE PROFILES TABLE. A JWT claim can be an
 *      hour stale, so somebody demoted five minutes ago is still carrying an
 *      admin claim right now. The table is the truth.
 *   3. Validate with Zod, again, even though the browser already did.
 *   4. Hand the work to one security definer function, so the row and its
 *      audit entry commit together or not at all.
 *
 * There is no insert, update or delete policy on ANY of the eleven contest
 * tables, and every database function is granted to `service_role` alone. This
 * function is the only door, and a browser could not do this even if it tried.
 *
 * Two things this function deliberately does NOT expose, and must never grow:
 *
 *   - Nothing that removes a creator from a contest they have joined. That
 *     capability does not exist in the database either, by decision on
 *     2026-08-13. Cancelling the whole contest is the only exit and it affects
 *     everybody.
 *   - Nothing that reads. Every read goes through row level security from the
 *     browser, so a bug here can never widen what somebody can see.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';

const money = z
  .number()
  .finite()
  .nonnegative()
  .max(99_999_999)
  // Stored as numeric(x,2). Round here rather than letting Postgres silently
  // truncate a third decimal place somebody pasted in.
  .transform((n) => Math.round(n * 100) / 100);

const currency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/, 'Currency must be a three letter code')
  .transform((c) => c.toUpperCase());

/**
 * An IANA zone name, never an offset. "Europe/London" survives a clock change
 * and "+01:00" does not, which is the whole reason the column exists. The real
 * check is in `save_contest`, which looks the value up in `pg_timezone_names`,
 * because only the database holds that catalogue.
 */
const timezone = z
  .string()
  .trim()
  .min(1, 'Which timezone does this deadline mean?')
  .max(64)
  .regex(/^[A-Za-z]+\/[A-Za-z_+\-0-9/]+$|^UTC$/, 'That is not a timezone name');

const ContestSave = z.object({
  action: z.literal('contest.save'),
  contestId: z.uuid().nullish(),
  brandId: z.uuid('A contest must belong to a brand'),
  name: z.string().trim().min(1, 'A contest needs a name').max(160),
  description: z.string().trim().max(4000).nullish(),
  // Required by the database whenever the contest carries an active ranked
  // prize, and that is checked there rather than here, because it depends on
  // rows in another table. See rule N7.
  judgingBasis: z.string().trim().max(600).nullish(),
  expiresAt: z.iso.datetime({ offset: true }),
  expiresAtTimezone: timezone,
  opensAt: z.iso.datetime({ offset: true }).nullish(),
  briefUrl: z.url('That brief address is not a URL').max(500).nullish(),
  bannerUrl: z.url('That banner address is not a URL').max(500).nullish(),
  currency: currency.default('USD'),
  status: z.enum(['active', 'inactive']).default('inactive'),
  needsAdminApproval: z.boolean().default(true),
});

/** Staff only, and its own action so the setup form cannot reach it by accident. */
const ContestCommercials = z.object({
  action: z.literal('contest.commercials'),
  contestId: z.uuid(),
  totalBudget: money.nullish(),
  internalNote: z.string().trim().max(2000).nullish(),
});

/**
 * Closing the door, not stopping the work. An inactive contest still lets
 * everybody already in deliver and be paid. Settling and cancelling are
 * different acts with their own functions.
 */
const ContestStatus = z.object({
  action: z.literal('contest.status'),
  contestId: z.uuid(),
  status: z.enum(['active', 'inactive']),
});

const ContestDelete = z.object({
  action: z.literal('contest.delete'),
  contestId: z.uuid(),
});

/** The fire alarm. It affects every entrant, and the screen has to say so. */
const ContestCancel = z.object({
  action: z.literal('contest.cancel'),
  contestId: z.uuid(),
  // MESSAGE, not reason. The entrants read this. See decision D14.
  message: z.string().trim().max(500).nullish(),
});

/**
 * One reward row. Three shapes live in one table:
 *   fixed     - do this, get paid. Carries a video count.
 *   rank      - finish in this place, get paid. Carries a position.
 *   milestone - reach this number, get paid. Carries a metric and a threshold.
 *
 * The title is typed by the admin on all three, every time. Nothing generates
 * one. Rashid ruled that on 2026-08-13 against the recommendation, so a blank
 * title is refused here, again in the database, and again by the column.
 */
const DeliverableSave = z.object({
  action: z.literal('deliverable.save'),
  deliverableId: z.uuid().nullish(),
  contestId: z.uuid(),
  kind: z.enum(['fixed', 'rank', 'milestone']),
  title: z.string().trim().min(1, 'Give this reward row a short name').max(160),
  detail: z.string().trim().max(600).nullish(),
  videoCount: z.number().int().min(1).max(1000).nullish(),
  rankPosition: z.number().int().min(1).max(1000).nullish(),
  metric: z.string().trim().max(120).nullish(),
  threshold: money.nullish(),
  rewardAmount: money.nullish(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

/**
 * Retire, never delete. Once anybody holds frozen terms against a row, the row
 * is part of a promise and deleting it would leave the promise pointing at
 * nothing. There is no delete function for a deliverable at all.
 */
const DeliverableRetire = z.object({
  action: z.literal('deliverable.retire'),
  deliverableId: z.uuid(),
});

/** The whole set at once, so removing one is the same call as adding one. */
const ProductsSet = z.object({
  action: z.literal('products.set'),
  contestId: z.uuid(),
  productIds: z.array(z.uuid()).max(100),
});

/**
 * Barring somebody. Scoped to ONE contest, never a brand and never an account,
 * by decision D5. It stops new entries only: anybody already in stays in, and
 * nothing here can pull them out.
 */
// NOT refined here. A `.refine()` stops this being a plain object, and
// `discriminatedUnion` needs plain objects, so the "name somebody" rule is
// checked after the union instead. Getting this wrong makes the whole action
// unreachable rather than merely unvalidated, which is worse.
const ExclusionSave = z.object({
  action: z.literal('exclusion.save'),
  contestId: z.uuid(),
  handle: z.string().trim().max(64).nullish(),
  email: z.email('That is not an email address').max(320).nullish(),
  userId: z.uuid().nullish(),
  // Staff only. This one really is a reason: no creator can ever read it.
  reason: z.string().trim().max(500).nullish(),
});

const ExclusionRemove = z.object({
  action: z.literal('exclusion.remove'),
  exclusionId: z.uuid(),
});

const Body = z.discriminatedUnion('action', [
  ContestSave,
  ContestCommercials,
  ContestStatus,
  ContestDelete,
  ContestCancel,
  DeliverableSave,
  DeliverableRetire,
  ProductsSet,
  ExclusionSave,
  ExclusionRemove,
]);

/** SQLSTATE from the database functions to something HTTP shaped. */
const STATUS_FOR_PG: Record<string, number> = {
  '42501': 403, // insufficient privilege
  P0002: 404, // no data found
  '23505': 409, // unique violation
  '23503': 409, // still referenced, for example entrants waiting on a decision
  '55006': 409, // object in use, the double click guard on settle and cancel
  '22023': 400, // invalid parameter value, most of our own refusals
  '23514': 400, // check constraint violation
};

/**
 * Turn a raw Postgres complaint into something a human can act on.
 *
 * Most of our refusals are raised with 22023 and already carry a sentence
 * written for a person, so they pass through untouched. The ones worth
 * translating are the constraint violations, where Postgres names an index.
 */
function humanise(message: string, code: string | undefined): string {
  if (code === '23505') {
    if (message.includes('rank_idx')) {
      return 'Another reward row already pays for that place';
    }
    if (message.includes('exclusion')) return 'That person is already barred from this contest';
    if (message.includes('slug')) return 'A contest with a very similar name already exists';
    return 'That already exists';
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

  const isStaff = actor.role === 'admin' || actor.role === 'ops';
  if (!isStaff || !actor.is_active) {
    // A real account reaching for something it is not entitled to. Kept.
    await admin.from('audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'contest.write_denied',
      subject_type: 'contest',
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

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return reply({ error: parsed.error.issues[0]?.message ?? 'That request was not valid' }, 400);
  }
  const input = parsed.data;

  // Checked after the union rather than inside it: a `.refine()` on a member
  // stops it being a plain object, and `discriminatedUnion` needs plain
  // objects. Each reward kind needs the field that gives it meaning, and a
  // missing one is a question worth asking rather than a constraint violation.
  if (input.action === 'deliverable.save') {
    if (input.kind === 'fixed' && !input.videoCount) {
      return reply({ error: 'How many videos does this row ask for?' }, 400);
    }
    if (input.kind === 'rank' && !input.rankPosition) {
      return reply({ error: 'Which place does this row pay for?' }, 400);
    }
    if (input.kind === 'milestone' && (!input.metric?.trim() || input.threshold == null)) {
      return reply({ error: 'A milestone needs something to count, and a number to reach' }, 400);
    }
  }

  // Barring somebody has to name them somehow. Checked here rather than in the
  // schema for the discriminatedUnion reason above.
  if (input.action === 'exclusion.save' && !input.handle && !input.email && !input.userId) {
    return reply({ error: 'Give a handle or an email address' }, 400);
  }

  // ------------------------------------------------------------- do it ----
  let rpc: { data: unknown; error: { message?: string; code?: string } | null };

  if (input.action === 'contest.save') {
    rpc = await admin.rpc('save_contest', {
      p_actor_id: actor.id,
      p_brand_id: input.brandId,
      p_name: input.name,
      p_expires_at: input.expiresAt,
      p_expires_at_timezone: input.expiresAtTimezone,
      p_contest_id: input.contestId ?? null,
      p_description: input.description ?? null,
      p_judging_basis: input.judgingBasis ?? null,
      p_brief_url: input.briefUrl ?? null,
      p_banner_url: input.bannerUrl ?? null,
      p_opens_at: input.opensAt ?? null,
      p_currency: input.currency,
      p_status: input.status,
      p_needs_admin_approval: input.needsAdminApproval,
    });
  } else if (input.action === 'contest.commercials') {
    rpc = await admin.rpc('save_contest_commercials', {
      p_actor_id: actor.id,
      p_contest_id: input.contestId,
      p_total_budget: input.totalBudget ?? null,
      p_internal_note: input.internalNote ?? null,
    });
  } else if (input.action === 'contest.status') {
    rpc = await admin.rpc('set_contest_status', {
      p_actor_id: actor.id,
      p_contest_id: input.contestId,
      p_status: input.status,
    });
  } else if (input.action === 'contest.delete') {
    rpc = await admin.rpc('delete_contest', {
      p_actor_id: actor.id,
      p_contest_id: input.contestId,
    });
  } else if (input.action === 'contest.cancel') {
    rpc = await admin.rpc('cancel_contest', {
      p_actor_id: actor.id,
      p_contest_id: input.contestId,
      p_message: input.message ?? null,
    });
  } else if (input.action === 'deliverable.save') {
    rpc = await admin.rpc('save_contest_deliverable', {
      p_actor_id: actor.id,
      p_contest_id: input.contestId,
      p_kind: input.kind,
      p_title: input.title,
      p_deliverable_id: input.deliverableId ?? null,
      p_detail: input.detail ?? null,
      p_video_count: input.videoCount ?? null,
      p_rank_position: input.rankPosition ?? null,
      p_metric: input.metric ?? null,
      p_threshold: input.threshold ?? null,
      p_reward_amount: input.rewardAmount ?? null,
      p_sort_order: input.sortOrder,
      p_is_active: input.isActive,
    });
  } else if (input.action === 'deliverable.retire') {
    rpc = await admin.rpc('retire_contest_deliverable', {
      p_actor_id: actor.id,
      p_deliverable_id: input.deliverableId,
    });
  } else if (input.action === 'products.set') {
    rpc = await admin.rpc('set_contest_products', {
      p_actor_id: actor.id,
      p_contest_id: input.contestId,
      p_product_ids: input.productIds,
    });
  } else if (input.action === 'exclusion.remove') {
    rpc = await admin.rpc('remove_contest_exclusion', {
      p_actor_id: actor.id,
      p_exclusion_id: input.exclusionId,
    });
  } else {
    rpc = await admin.rpc('save_contest_exclusion', {
      p_actor_id: actor.id,
      p_contest_id: input.contestId,
      p_handle: input.handle ?? null,
      p_email: input.email ?? null,
      p_user_id: input.userId ?? null,
      p_reason: input.reason ?? null,
    });
  }

  if (rpc.error) {
    const code = rpc.error.code;
    return reply(
      { error: humanise(rpc.error.message ?? 'That did not work', code) },
      STATUS_FOR_PG[code ?? ''] ?? 400
    );
  }

  return reply({ result: rpc.data });
});
