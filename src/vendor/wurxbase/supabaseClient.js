import { getSupabase } from '@/lib/supabase';

/* ════════════════════════════════════════════════════════════════════════
   WurxBase talks to OUR database now.

   It used to hold its own project URL and a publishable key as string
   literals, and reach a second Supabase project directly from the browser
   with no authentication at all — that key was the entire permission model,
   and `app_users.password` sat in plaintext behind it. On 2026-08-28 Rashid
   consolidated: one app, one database, managed from one side. Their eight
   tables now live in the `wurxbase` SCHEMA of our own project, governed by
   RLS like everything else we own.

   THERE IS EXACTLY ONE SUPABASE CLIENT IN THIS APPLICATION and it is not
   created here. `src/lib/supabase.ts` owns it, and CLAUDE.md calls that
   non-negotiable for a concrete reason: two clients race to refresh the same
   token, one loses, the token is revoked, and people get logged out at
   random. That is the exact bug this product is engineered against. So this
   file borrows the app's client rather than making another.

   WHY A SCHEMA RATHER THAN RENAMED TABLES. Their code says `.from('creators')`
   in forty-two places and `.from('app_users')` in twenty-four. Scoping the
   client to `wurxbase` means every one of those keeps working untouched, and
   their `creators` can never be confused with ours — theirs is a paid-deal
   tracker, ours is a person with a login. Same word, different grain.

   WHAT IS EXPOSED, and why it is a hand-written object rather than the client
   itself: `client.schema()` returns a PostgREST client scoped to the schema,
   which carries `from` and `rpc` but NOT `channel`. Their code uses exactly
   three members, so all three are given deliberately. Anything else they
   reach for should fail loudly here rather than silently escape the fence and
   query `public`.
   ════════════════════════════════════════════════════════════════════════ */

export const WURXBASE_SCHEMA = 'wurxbase';

/* Resolved lazily. `getSupabase()` reads validated env, and this module is
   imported by the lazy Paid Collabs chunk, so there is no import-time work. */
const db = () => getSupabase().schema(WURXBASE_SCHEMA);

export const supabase = {
  from: (table) => db().from(table),
  rpc: (fn, args, opts) => db().rpc(fn, args, opts),
  /* Realtime lives on the root client, not on the schema-scoped one. Their
     `postgres_changes` filters name the schema themselves and have all been
     pointed at `wurxbase`; a filter still saying `public` would subscribe to
     one of OUR tables and quietly deliver nothing. */
  channel: (...args) => getSupabase().channel(...args),
  removeChannel: (...args) => getSupabase().removeChannel(...args),
};

/* ── Reading a table that is bigger than 1000 rows ──────────────────
   PostgREST on this project enforces a HARD ceiling of 1000 rows per
   response (db-max-rows). It is not a client default and it cannot be
   raised from here: `.limit(5000)` still comes back with 1000 rows, and
   nothing in the response says the rest exist. A plain
   `select('*')` therefore looks like it worked while silently hiding
   every row past the first thousand.

   Anything that has to see the WHOLE table must walk it with .range().

   Pass a FACTORY, not a query: a supabase-js builder can only be awaited
   once, so each page needs a fresh one.

     const { data, error } = await selectAll(() =>
       supabase.from('creators').select('*').order('id'));

   Order matters. Paging is only stable when the sort is unique overall,
   so always end the ordering on a unique column (id). Sorting on a
   non-unique column alone lets rows shift between pages, which shows up
   as duplicated or missing records rather than as an error.

   Still true after the move: our project caps at 1000 as well. */
export const PAGE_SIZE = 1000;

export async function selectAll(build, pageSize = PAGE_SIZE) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    out.push(...page);
    if (page.length < pageSize) break;
    /* Runaway guard · a mis-built factory that ignores .range() would
       otherwise loop forever handing back the same full page. */
    if (out.length > 200000) break;
  }
  return { data: out, error: null };
}

/* ── The screens that call REST by hand ─────────────────────────────────
   Their database-health dot, the diagnostics panel and SQL Quest do not use
   the client at all: they built URLs against a hardcoded project and sent a
   hardcoded key. Both of those are now wrong, and wrong in the quietest
   possible way — they would have gone on querying the OLD project and
   reporting healthy numbers about a database nobody uses any more.

   Two extra things these need that the client handles invisibly:

     Accept-Profile / Content-Profile   tell PostgREST which schema to use.
                                        Without them a raw request lands in
                                        `public`, where none of these tables
                                        exist, and 404s.
     the session token                  RLS is on now. anon has no grants at
                                        all, so a request carrying only the
                                        publishable key gets nothing back.
   ───────────────────────────────────────────────────────────────────────── */

export const WURXBASE_ORIGIN = import.meta.env.VITE_SUPABASE_URL;

/* Shown in their diagnostics panel where the old project host used to be. */
export const WURXBASE_ENDPOINT_LABEL = `${String(WURXBASE_ORIGIN || '').replace(/^https?:\/\//, '')}/${WURXBASE_SCHEMA}`;

export async function wurxbaseHeaders(extra = {}) {
  const client = getSupabase();
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  return {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    /* Fall back to the publishable key so a signed-out call fails as a clean
       401 rather than as a malformed request nobody can read. */
    Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    'Accept-Profile': WURXBASE_SCHEMA,
    'Content-Profile': WURXBASE_SCHEMA,
    ...extra,
  };
}

export async function wurxbaseRest(path, init = {}) {
  const headers = await wurxbaseHeaders(init.headers || {});
  return fetch(`${WURXBASE_ORIGIN}/rest/v1/${String(path).replace(/^\/+/, '')}`, { ...init, headers });
}
