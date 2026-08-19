-- ============================================================================
-- The leaderboard functions, granted to service_role as well, 2026-08-20
--
-- `revoke all ... from public` in the migration before this one did more than
-- it looked like it did. `service_role` had no grant of its own on either
-- function: it was relying on the implicit PUBLIC one, which that line removed.
-- So the functions worked perfectly for a signed-in creator, which is who they
-- are for, and returned `permission denied` to every script and suite that
-- tried to check them with the service key.
--
-- This is the same shape as the trap `docs/OPERATIONS.md` already records about
-- new tables: "Automatically expose new tables is OFF, which also switches off
-- the default grants to service_role". Same lesson, different object.
-- ============================================================================

grant execute on function public.creator_leaderboard(date, date, integer, integer, text)
  to service_role;
grant execute on function public.my_leaderboard_standing(date, date)
  to service_role;
