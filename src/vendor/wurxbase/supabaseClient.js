import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnevtdezskftlrjjgbsg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h7DMRqJ19S3cWaEoUR9e8Q_b5FEAEyu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
   as duplicated or missing records rather than as an error. */
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
