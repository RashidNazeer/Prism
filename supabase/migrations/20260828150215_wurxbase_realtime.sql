-- ===========================================================================
-- Realtime for the WurxBase tables.
--
-- Their app subscribes to eight `postgres_changes` feeds — new activity rows,
-- new creators, new join requests, the shared settings row, and the brand
-- budgets. Those filters have been repointed from `public` to `wurxbase`, but a
-- filter is only half of it: a table that is not in the `supabase_realtime`
-- publication produces no events at all, and the subscription sits there
-- looking healthy and delivering nothing. That is the same class of silence
-- this whole migration is trying to get rid of, so it is asserted here rather
-- than discovered later.
--
-- ONLY THE FIVE THEY ACTUALLY SUBSCRIBE TO. `app_users`, `audit_logs` and
-- `revoked_sessions` are not published, because nothing listens to them and a
-- publication is a broadcast — `app_users` in particular still carries a
-- plaintext password column and has no business being streamed anywhere.
--
-- RLS still decides who receives an event. Realtime evaluates the subscriber's
-- policies, so a non-staff session gets nothing even while the table publishes.
-- ===========================================================================

do $$
declare
  t text;
  already boolean;
begin
  foreach t in array array[
    'activity_logs', 'creators', 'join_requests', 'app_settings', 'brand_monthly_budgets'
  ]
  loop
    select exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'wurxbase' and tablename = t
    ) into already;

    if not already then
      execute format('alter publication supabase_realtime add table wurxbase.%I', t);
    end if;
  end loop;
end $$;

-- Their handlers read the row that changed, and for an UPDATE the default
-- payload carries only the primary key as the "old" record. `app_settings` is
-- one shared row whose updates their code diffs, so it needs the full old row.
alter table wurxbase.app_settings replica identity full;
