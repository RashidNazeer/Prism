-- ============================================================================
-- Give the service role access to profiles.
-- ============================================================================
-- Both Supabase projects have "Automatically expose new tables" turned OFF,
-- which is what we want: nothing is reachable until we say so. The side effect
-- is that Supabase's usual default privileges are switched off too, so
-- `service_role` gets nothing either, not just `anon` and `authenticated`.
--
-- Found by scripts/check-rls.mjs, which could not read the table back with the
-- service key to confirm an escalation attempt had really failed. The same wall
-- would have hit every Edge Function in Step 3 and Step 4, since those run as
-- the service role.
--
-- service_role already bypasses row level security. This grants the table
-- privileges it also needs. It is a server-only key and never reaches a browser.
--
-- REMEMBER: every future table needs its own explicit grants. There is no
-- default any more. See CLAUDE.md.
-- ============================================================================

grant all privileges on table public.profiles to service_role;

-- Sequences and functions added later will need the same treatment. Setting the
-- default here means new objects in this schema are covered from now on.
alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;
