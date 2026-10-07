/**
 * PRODUCT PICTURES, LOOKED UP BY ID AND REMEMBERED.
 * ---------------------------------------------------------------------------
 * Rashid, 2026-09-24: "also check if images can be fetcheable for cruva and
 * euka so we can show images of product in dropdown".
 *
 * The onboarding picker drew a letter tile for nearly every product, and the
 * reason written into `collab-products` was accurate as far as it went: EUKA's
 * `dashboard/products-performance` carries no image field, and the *list*
 * endpoint that does (`social-intelligence/products`) is market-wide — asked
 * for our own brand id it answered with another company's products.
 *
 * What that reasoning missed is that EUKA has two lookups keyed on ONE EXACT
 * TIKTOK PRODUCT ID, which is a thing we already hold for every product on
 * every platform. An id is not a guess:
 *
 *   GET  /social-intelligence/products/{id}?brandId=…   → imageUrl
 *        our own shop's record of our own product
 *   POST /market-intelligence/tiktok/product/detail     → master_image_url
 *        TikTok market data, product id only, no brand id anywhere —
 *        which is how a REACHER (or later CRUVA) brand gets pictures at all
 *
 * ── THE ONE-KEY-PER-STORE RULE DOES NOT APPLY TO THE MARKET LOOKUP ─────────
 * `euka-accounts.ts` is emphatic that a store is only ever asked about with the
 * key that returned it, because asking account A about account B's store fills
 * a brand's screen with another brand's numbers. That rule is about STORE data.
 * `market-intelligence/tiktok/product/detail` is not store data: it takes a
 * public TikTok product id and returns what TikTok shows the world about it.
 * Any key may ask, and the answer does not depend on which one did.
 *
 * The store-scoped lookup below is the opposite, and it keeps the rule: it is
 * only ever called with the auth that owns the brand id being passed.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.9';
import { type EukaAuth, EUKA_V1 } from './euka-accounts.ts';

export type ImageSource = 'euka-social' | 'euka-market' | 'reacher' | 'cruva' | 'none';

/** A product as the pickers use it. Only `id` and `image` matter here. */
type WithImage = { id: string; name: string; image?: string | null };

/**
 * How long a MISS is believed. A hit is kept forever — a product photograph
 * changes about never — but "no picture" is often just "not indexed yet" for a
 * listing that went up this week, so it is asked again after a fortnight.
 */
const MISS_TTL_DAYS = 14;

/**
 * HOW LONG THE DRAWER IS ALLOWED TO WAIT. Whatever is cached comes back
 * instantly; this is the budget for looking up what is not. It is deliberately
 * short — a picker that takes fifteen seconds to open is worse than one with
 * letter tiles — and because every answer is written to the cache, the second
 * open of the same brand is complete even when the first was not.
 */
const BUDGET_MS = 9_000;
const CONCURRENCY = 8;

const clean = (u: unknown): string | null => {
  const s = String(u ?? '').trim();
  if (!s || !/^https?:\/\//i.test(s)) return null;
  return s.length <= 2000 ? s : null;
};

/** Our own shop's record of our own product. Needs the owning account's auth. */
async function fromSocial(auth: EukaAuth, brandId: string, id: string, signal: AbortSignal) {
  const q = new URLSearchParams({ brandId, region: 'US' });
  const r = await fetch(`${EUKA_V1}/social-intelligence/products/${encodeURIComponent(id)}?${q}`, {
    headers: auth,
    signal,
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null) as Record<string, unknown> | null;
  const url = clean(j?.imageUrl);
  return url ? { url, title: String(j?.title ?? '') || null, source: 'euka-social' as const } : null;
}

/** TikTok market data, by product id alone. Works for any platform's product. */
async function fromMarket(auth: EukaAuth, id: string, signal: AbortSignal) {
  const r = await fetch(`${EUKA_V1}/market-intelligence/tiktok/product/detail`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: id,
      region: 'US',
      language: 'en-US',
      currency: 'USD',
      date_range: 'last30Day',
      /* 1 is the official URL; 2 is their own re-host. The official one is what
         TikTok itself serves on the listing, so it is the one that keeps
         working. */
      need_image: 1,
    }),
    signal,
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null) as Record<string, any> | null;
  const body = (j?.data ?? j) as Record<string, unknown> | null;
  const url = clean(body?.master_image_url);
  return url ? { url, title: String(body?.product_name ?? '') || null, source: 'euka-market' as const } : null;
}

/**
 * Fill in `image` on every product that has not got one, using the cache first
 * and the two id lookups for the rest. MUTATES AND RETURNS the same array.
 *
 * `store` is the store-scoped route and is optional: pass it only for a brand
 * whose EUKA brand id you hold, and only with that brand's own auth.
 */
export async function attachProductImages(
  admin: SupabaseClient,
  products: WithImage[],
  opts: {
    /** Any account's auth, for the market lookup. Without it nothing is fetched. */
    market?: EukaAuth | null;
    /** The owning account's auth plus its brand id, for the store-scoped lookup. */
    store?: { auth: EukaAuth; brandId: string } | null;
    /** Where a picture already on the product came from, for the cache row. */
    nativeSource?: ImageSource;
  },
): Promise<{ filled: number; asked: number; cached: number }> {
  const ids = [...new Set(products.map((p) => String(p.id || '').trim()).filter(Boolean))];
  if (!ids.length) return { filled: 0, asked: 0, cached: 0 };

  /* ── 1. what do we already know ──────────────────────────────────────── */
  const known = new Map<string, { url: string | null; checked: number }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from('collab_product_images')
      .select('product_id, image_url, checked_at')
      .in('product_id', ids.slice(i, i + 200));
    for (const row of data ?? []) {
      known.set(String(row.product_id), {
        url: row.image_url ?? null,
        checked: Date.parse(row.checked_at ?? '') || 0,
      });
    }
  }

  const byId = new Map<string, WithImage[]>();
  for (const p of products) {
    const id = String(p.id || '').trim();
    if (!id) continue;
    byId.set(id, [...(byId.get(id) ?? []), p]);
  }

  let cached = 0;
  const rows: Record<string, unknown>[] = [];

  /* A product that ARRIVED with its own picture — Reacher's catalogue carries
     `primary_image_url` — is recorded rather than looked up. Their answer about
     their own shop beats a market lookup. */
  for (const [id, list] of byId) {
    const native = list.find((p) => clean(p.image))?.image;
    if (native) {
      rows.push({
        product_id: id,
        image_url: clean(native),
        source: opts.nativeSource ?? 'reacher',
        title: list[0]?.name ?? null,
        checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      continue;
    }
    const hit = known.get(id);
    if (hit?.url) {
      for (const p of list) p.image = hit.url;
      cached++;
    }
  }

  /* ── 2. who still needs asking ───────────────────────────────────────── */
  const staleBefore = Date.now() - MISS_TTL_DAYS * 86_400_000;
  const todo = [...byId.keys()].filter((id) => {
    if (byId.get(id)?.some((p) => clean(p.image))) return false;
    const hit = known.get(id);
    if (!hit) return true;
    /* A recorded miss is left alone until its fortnight is up. */
    return hit.url === null && hit.checked < staleBefore;
  });

  let asked = 0, filled = cached;
  if (todo.length && (opts.market || opts.store)) {
    const deadline = Date.now() + BUDGET_MS;
    const queue = todo.slice();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BUDGET_MS);

    const worker = async () => {
      while (queue.length && Date.now() < deadline) {
        const id = queue.shift()!;
        asked++;
        let got: { url: string; title: string | null; source: ImageSource } | null = null;
        try {
          if (opts.store) got = await fromSocial(opts.store.auth, opts.store.brandId, id, controller.signal);
          if (!got && opts.market) got = await fromMarket(opts.market, id, controller.signal);
        } catch {
          /* A timeout or a refusal is not a miss: leave it unrecorded so the
             next open asks again rather than believing a fortnight of nothing.
             THIS IS THE WHOLE REASON the catch does not write a row. */
          continue;
        }
        const now = new Date().toISOString();
        rows.push({
          product_id: id,
          image_url: got?.url ?? null,
          source: got?.source ?? 'none',
          title: got?.title ?? byId.get(id)?.[0]?.name ?? null,
          checked_at: now,
          updated_at: now,
        });
        if (got) {
          for (const p of byId.get(id) ?? []) p.image = got.url;
          filled++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    clearTimeout(timer);
  }

  /* ── 3. remember, in one write ───────────────────────────────────────── */
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 200) {
      await admin.from('collab_product_images')
        .upsert(rows.slice(i, i + 200), { onConflict: 'product_id' });
    }
  }

  return { filled, asked, cached };
}
