-- ============================================================================
-- THE REACHER SYNC ON A SCHEDULE, for Irwin Naturals.
--
-- Same shape as `euka_ads_run_cycle`, and deliberately so: the secret and the
-- URL live in the vault, set once at deploy time and never in this file, and
-- pg_cron posts to the Edge Function through pg_net, which carries no JWT —
-- which is why `reacher-sync` verifies `x-sync-secret` itself.
--
-- EVERY FIFTEEN MINUTES, not five. The Euka job works a queue of campaign
-- months and needs the frequency; this one reads about 200 videos for a single
-- shop and finishes in eight seconds. Fifteen minutes is fresh enough for a
-- brand whose videos arrive a handful a day, and it is a third of the calls
-- against an API whose rate limit is 60 a minute.
-- ============================================================================

create or replace function public.reacher_set_sync_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_secret is null or length(p_secret) < 24 then
    raise exception 'reacher_set_sync_secret: the secret must be at least 24 characters';
  end if;
  select id into v_id from vault.secrets where name = 'reacher_sync_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'reacher_sync_secret',
      'Shared with the reacher-sync Edge Function, which compares it in constant time');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

create or replace function public.reacher_set_sync_url(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url is null or p_url !~ '^https://' then
    raise exception 'reacher_set_sync_url: expected an https URL';
  end if;
  select id into v_id from vault.secrets where name = 'reacher_sync_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'reacher_sync_url', 'Where the Reacher sync posts');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
end;
$$;

revoke all on function public.reacher_set_sync_secret(text) from anon, authenticated, public;
revoke all on function public.reacher_set_sync_url(text) from anon, authenticated, public;
grant execute on function public.reacher_set_sync_secret(text) to service_role;
grant execute on function public.reacher_set_sync_url(text) to service_role;

create or replace function public.reacher_run_cycle()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_url text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'reacher_sync_secret';
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'reacher_sync_url';

  /*
   * SILENT WHEN THE VAULT IS EMPTY, not an exception. Production has no Paid
   * Collabs, no Irwin Naturals and no vault entries for this, and a raise there
   * would write an error into cron's history every fifteen minutes about a
   * feature that does not exist on that project. `pnpm verify:reacher` asserts
   * the vault IS set on dev, where it matters.
   */
  if v_secret is null or v_url is null then
    return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.reacher_run_cycle() from anon, authenticated, public;
grant execute on function public.reacher_run_cycle() to service_role;

select cron.unschedule('reacher-cycle')
where exists (select 1 from cron.job where jobname = 'reacher-cycle');

select cron.schedule(
  'reacher-cycle',
  '*/15 * * * *',
  $$ select public.reacher_run_cycle(); $$
);
