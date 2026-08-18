import { createClient } from '@supabase/supabase-js';

/* ════════════════════════════════════════════════════════════
   Paid Collaborations · isolated config for a NEW Supabase project.
   This is SEPARATE from src/supabaseClient.js (the creatorsxbrands app).

   ▶ TO CONNECT (one-time):
     1. Create a NEW Supabase project (supabase.com → New project).
     2. SQL Editor → paste & run  collabs-schema.sql  (in repo root).
     3. Project Settings → API → copy the values into the two
        constants below, then redeploy.

   Until these are filled in, the dashboard runs in LOCAL mode
   (saved in this browser only · not shared with the team).
════════════════════════════════════════════════════════════ */

export const COLLABS_SUPABASE_URL = 'https://pfkpgmpicjcirnogxkac.supabase.co';
export const COLLABS_SUPABASE_ANON_KEY = 'sb_publishable_-1vO04qlMUTeuxagCMFJeA_frnpOEfN';

/* Optional shared passcode gate. Empty string = open (no gate). */
export const COLLABS_PASSCODE = '';

export const isSupabaseConfigured = Boolean(COLLABS_SUPABASE_URL && COLLABS_SUPABASE_ANON_KEY);

export const collabs = isSupabaseConfigured
  ? createClient(COLLABS_SUPABASE_URL, COLLABS_SUPABASE_ANON_KEY)
  : null;
