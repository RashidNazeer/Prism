/**
 * THE EUKA ACCOUNTS WE HOLD KEYS FOR, AND WHICH ONE OWNS EACH STORE.
 *
 * Moved out of `euka/index.ts` on 2026-09-15, when a second function
 * (`euka-ads-sync`) needed exactly the same answer. Two copies of "which key
 * owns this store" is how one brand's screen quietly fills with another brand's
 * money, so there is one, here.
 */

/* The export API every older mode uses. */
export const EUKA_V0 = 'https://api.euka.ai/v0';
/*
 * Euka's current API, which its public spec (api.euka.ai/openapi.json) declares
 * as `/api/v1`. The GMV Max ad reports exist ONLY here: under `/v0` every one of
 * them answers "Route not found". Verified 2026-09-15.
 */
export const EUKA_V1 = 'https://api.euka.ai/api/v1';

export type EukaAuth = { Authorization: string };

/*
 * ═══ AS MANY EUKA ACCOUNTS AS WE HOLD KEYS FOR ═══════════════════════
 *
 * One Euka key can cover many brands — ours covers ten — but a brand can also
 * arrive with an account of its own. Nutra did, on 2026-09-09: a separate
 * account whose key returns exactly one store, NUTRAHARMONY STORE, which our
 * existing key cannot see at all.
 *
 * So keys are a LIST, and one rule keeps the data honest:
 *
 *   A STORE IS ONLY EVER ASKED ABOUT WITH THE KEY THAT RETURNED IT.
 *
 * Never a fallback, never "try the other one". Asking account A about a store
 * belonging to account B is how a brand's screen quietly fills with another
 * brand's numbers, and on this product those numbers are somebody's commission.
 *
 * EUKA_API_KEY keeps working exactly as it did and stays first, so a deployment
 * that never sets EUKA_API_KEYS behaves identically. Extra keys go in
 * EUKA_API_KEYS, separated by commas or whitespace, which makes brand number
 * twelve a secret change rather than a code change.
 */
export function eukaKeys(): string[] {
  const primary = Deno.env.get('EUKA_API_KEY') ?? '';
  const extra = Deno.env.get('EUKA_API_KEYS') ?? '';
  const all = [primary, ...extra.split(/[\s,]+/)].map((k) => k.trim()).filter(Boolean);
  return [...new Set(all)];
}

export type StoreIndex = {
  stores: { id: string; name: string }[];
  /* store id → the auth of the account that owns it */
  ownerOf: Map<string, EukaAuth>;
  /* how many keys did not answer, so a short list is never mistaken for a
     complete one */
  unavailable: number;
  total: number;
};

/*
 * Ask every account for its stores, once, and remember who owned what.
 *
 * A KEY THAT FAILS IS COUNTED, NOT SWALLOWED. If one account is down or its key
 * has been revoked, its stores simply vanish from the merged list — and a
 * caller looking for one of them would then be told "no such store", which is a
 * lie about the brand instead of the truth about the account. `unavailable` is
 * what lets the answer say which of the two it was.
 */
export async function indexStores(keys: string[]): Promise<StoreIndex> {
  const results = await Promise.all(keys.map(async (k) => {
    const auth: EukaAuth = { Authorization: `Bearer ${k}` };
    try {
      const r = await fetch(`${EUKA_V0}/stores`, { headers: auth });
      if (!r.ok) return { auth, list: null as any[] | null };
      const j = await r.json();
      /* /v0/stores answers a BARE ARRAY while every other export answers an
         object. Anything else is a failure, never "no stores". */
      return { auth, list: Array.isArray(j) ? j : null };
    } catch {
      return { auth, list: null as any[] | null };
    }
  }));

  const stores: { id: string; name: string }[] = [];
  const ownerOf = new Map<string, EukaAuth>();
  let unavailable = 0;

  for (const res of results) {
    if (!res.list) { unavailable++; continue; }
    for (const raw of res.list) {
      const id = String((raw as any)?.id ?? '').trim();
      if (!id) continue;
      /* Ids are uuids, so two accounts sharing one is not expected. If it ever
         happens the FIRST key wins, rather than the owner changing silently
         between one request and the next. */
      if (ownerOf.has(id)) continue;
      ownerOf.set(id, res.auth);
      stores.push({ id, name: String((raw as any)?.name ?? '') });
    }
  }
  return { stores, ownerOf, unavailable, total: keys.length };
}

/*
 * Euka's data-export requires BOTH store_id and brand_id, though their public
 * spec documents store_id alone. There is no id-to-id link exposed, so the
 * brand is found by matching its name to the store's, normalised. A store with
 * no matching brand yields an empty brandId and the export is attempted without
 * it — which is what theirs does, and is better than refusing outright.
 */
export async function storeBrandPair(auth: EukaAuth, storeId: string, knownName?: string): Promise<string> {
  const [stores, brands] = await Promise.all([
    knownName
      ? Promise.resolve(null)
      : fetch(`${EUKA_V0}/stores`, { headers: auth }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch(`${EUKA_V0}/brands`, { headers: auth }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  /* Both halves must come from the SAME account: a brand id from one account
     against a store id from another is exactly the mismatch this file exists
     to prevent. */
  const store = knownName
    ? { name: knownName }
    : (Array.isArray(stores) ? stores : []).find((s: any) => s.id === storeId);
  if (!store) return '';
  const brand = (Array.isArray(brands) ? brands : []).find((b: any) => norm(b.name) === norm(store.name));
  return brand ? String(brand.id) : '';
}
