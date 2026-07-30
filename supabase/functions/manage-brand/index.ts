/**
 * manage-brand
 * ---------------------------------------------------------------------------
 * Create and edit brands, and the offers inside their Brand Hub.
 *
 * CLAUDE.md names brand edits as a privileged action, so this follows the same
 * shape as `review-application`:
 *
 *   1. Verify the access token with the auth server. Not decode it.
 *   2. Read the caller's role FROM THE PROFILES TABLE. A JWT claim can be an
 *      hour stale, so someone demoted five minutes ago is still carrying an
 *      admin claim right now. The table is the truth.
 *   3. Validate with Zod, again, even though the browser already did.
 *   4. Hand the work to one security definer function, so the row and its
 *      audit entry commit together or not at all.
 *
 * There are no insert, update or delete policies on `brands` or `offers`, and
 * the database functions are granted to `service_role` alone. This function is
 * the only door.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { z } from 'npm:zod@4.4.3';
import { corsHeaders, json } from '../_shared/cors.ts';

const money = z
  .number()
  .finite()
  .nonnegative()
  .max(99_999_999)
  // Money is stored as numeric(x,2). Round here rather than letting Postgres
  // silently truncate a third decimal place somebody pasted in.
  .transform((n) => Math.round(n * 100) / 100);

const currency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/, 'Currency must be a three letter code')
  .transform((c) => c.toUpperCase());

const BrandBody = z.object({
  action: z.literal('brand.save'),
  brandId: z.uuid().nullish(),
  name: z.string().trim().min(1, 'A brand needs a name').max(120),
  storeId: z.string().trim().min(1, 'A brand needs a store id').max(64),
  clientName: z.string().trim().max(120).nullish(),
  budget: money.nullish(),
  currency: currency.default('USD'),
  isActive: z.boolean().default(true),
});

const OfferBody = z.object({
  action: z.literal('offer.save'),
  offerId: z.uuid().nullish(),
  brandId: z.uuid('An offer must belong to a brand'),
  badgeTitle: z.string().trim().max(32).nullish(),
  title: z.string().trim().min(1, 'An offer needs a title').max(120),
  description: z.string().trim().max(2000).nullish(),
  videoCount: z.number().int().min(1, 'At least one video').max(1000),
  rewardAmount: money,
  currency: currency.default('USD'),
  status: z.enum(['active', 'inactive']).default('active'),
  needsApplication: z.boolean().default(true),
});

const DeleteOfferBody = z.object({
  action: z.literal('offer.delete'),
  offerId: z.uuid(),
});

const Body = z.discriminatedUnion('action', [BrandBody, OfferBody, DeleteOfferBody]);

/** SQLSTATE from the database functions to something HTTP shaped. */
const STATUS_FOR_PG: Record<string, number> = {
  '42501': 403, // insufficient privilege
  P0002: 404, // no data found
  '23505': 409, // unique violation, a duplicate store id or slug
  '22023': 400, // invalid parameter value
  '23514': 400, // check constraint violation
};

/** Turn a raw Postgres complaint into something a human can act on. */
function humanise(message: string, code: string | undefined): string {
  if (code === '23505') {
    if (message.includes('store_id')) return 'Another brand already uses that store id';
    if (message.includes('slug')) return 'A brand with a very similar name already exists';
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
      action: 'brand.write_denied',
      subject_type: 'brand',
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
    return reply(
      { error: parsed.error.issues[0]?.message ?? 'That request was not valid' },
      400
    );
  }
  const input = parsed.data;

  // Checked after the union rather than inside it: a `.refine()` on a member
  // stops it being a plain object, and `discriminatedUnion` needs plain
  // objects. A description is optional on an open offer and required on one a
  // creator has to apply for, because nobody can make a case for being given
  // something that never says what it involves.
  if (
    input.action === 'offer.save' &&
    input.needsApplication &&
    !input.description?.trim()
  ) {
    return reply(
      { error: 'An offer creators apply for needs a description of what to deliver' },
      400
    );
  }

  // ------------------------------------------------------------- do it ----
  let rpc: { data: unknown; error: { message?: string; code?: string } | null };

  if (input.action === 'brand.save') {
    rpc = await admin.rpc('save_brand', {
      p_actor_id: actor.id,
      p_name: input.name,
      p_store_id: input.storeId,
      p_brand_id: input.brandId ?? null,
      p_client_name: input.clientName ?? null,
      p_budget: input.budget ?? null,
      p_currency: input.currency,
      p_is_active: input.isActive,
    });
  } else if (input.action === 'offer.save') {
    rpc = await admin.rpc('save_offer', {
      p_actor_id: actor.id,
      p_brand_id: input.brandId,
      p_title: input.title,
      p_video_count: input.videoCount,
      p_reward_amount: input.rewardAmount,
      p_offer_id: input.offerId ?? null,
      p_badge_title: input.badgeTitle ?? null,
      p_description: input.description ?? null,
      p_currency: input.currency,
      p_status: input.status,
      p_needs_application: input.needsApplication,
    });
  } else {
    rpc = await admin.rpc('delete_offer', {
      p_actor_id: actor.id,
      p_offer_id: input.offerId,
    });
  }

  if (rpc.error) {
    const status = STATUS_FOR_PG[rpc.error.code ?? ''] ?? 500;
    if (status === 500) console.error('manage-brand failed', input.action, rpc.error);
    return reply(
      { error: humanise(rpc.error.message ?? 'Something went wrong', rpc.error.code) },
      status
    );
  }

  return reply({ ok: true, result: rpc.data }, 200);
});
