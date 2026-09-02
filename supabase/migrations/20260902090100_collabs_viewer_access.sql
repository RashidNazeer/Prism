-- ============================================================================
-- What the three new roles may do: READ Paid Collabs, and nothing else.
--
-- THE SHAPE OF THIS, and why it is not "add them to is_staff()".
-- `public.is_staff()` guards SEVENTY policies across the public schema —
-- creators, applications, offers, contests, brands, payouts, tiktok money.
-- Widening it to admit an Ads Manager would hand them the entire product in
-- one line. It is not touched here and must not be.
--
-- Instead there is a second, narrower predicate used by exactly one schema.
-- Read is widened; INSERT, UPDATE and DELETE stay on is_staff(), so these
-- roles cannot write in Paid Collabs even if a screen offered them a button.
-- The database is the boundary, not the UI.
--
-- `::text` on the comparison is deliberate. jwt_role() returns app_role, and
-- comparing against literals of a freshly added label is exactly the thing
-- Postgres parses eagerly; text keeps this file re-runnable on a database
-- where the labels arrived a moment ago.
-- ============================================================================

create or replace function public.is_collabs_viewer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_staff()
      or public.jwt_role()::text in (
           'affiliate_team_lead', 'operations_lead', 'ads_manager'
         );
$$;

comment on function public.is_collabs_viewer() is
  'True for ops/admin, plus the three read-only Paid Collabs roles. Used ONLY '
  'by wurxbase SELECT policies. Never widen is_staff() to include these roles: '
  'that function guards the whole public schema.';

-- ---------------------------------------------------------------- policies --
-- Swap the SELECT policy on every Paid Collabs table. The other three verbs
-- are left exactly as they were.
do $$
declare t text;
begin
  foreach t in array array[
    'creators', 'activity_logs', 'app_users', 'app_settings',
    'join_requests', 'brand_monthly_budgets', 'revoked_sessions', 'audit_logs'
  ]
  loop
    execute format('drop policy if exists %I on wurxbase.%I', t || '_select_staff', t);
    execute format(
      'create policy %I on wurxbase.%I for select to authenticated using (public.is_collabs_viewer())',
      t || '_select_staff', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ grants --
-- The grants already name `authenticated`, which these roles are, so nothing
-- changes there. Recorded so the next person does not go looking.
