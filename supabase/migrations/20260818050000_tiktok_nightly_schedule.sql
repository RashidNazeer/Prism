-- ============================================================================
-- The nightly pull.
--
-- `pg_cron` wakes up once a night and `pg_net` posts to the `tiktok-sync` edge
-- function. Two details are not decoration:
--
-- 1. `x-region: ap-northeast-1`. The edge runtime places a function in the
--    region nearest whoever invoked it, and the invoker here is our own
--    database. TikTok blocks Indian IPs, so without this header the nightly job
--    would fail every night with a message about credentials.
--
-- 2. The shared secret comes from VAULT and is never written in this file. A
--    migration is committed to git; a secret in one is a secret in the repo
--    forever. `tiktok_set_sync_secret` puts it there, is callable by the
--    service role alone, and is run once from the CLI at deploy time.
--
-- `days: 3` rather than 1, deliberately. A day already pulled is skipped
-- without an API call, so asking for three costs nothing on a normal night and
-- means one failed night heals itself on the next one instead of leaving a
-- permanent hole in somebody's chart.
-- ============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

/**
 * Store the secret the scheduler presents to the sync function.
 *
 * SERVICE ROLE ONLY. It is not granted to `authenticated`, so no signed-in
 * user, admin included, can set or overwrite the credential the nightly job
 * authenticates with.
 */
create or replace function public.tiktok_set_sync_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'the sync secret must be at least 32 characters';
  end if;

  select id into v_id from vault.secrets where name = 'tiktok_sync_secret';

  if v_id is null then
    perform vault.create_secret(
      p_secret,
      'tiktok_sync_secret',
      'Presented by the nightly TikTok sync in x-sync-secret'
    );
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

revoke all on function public.tiktok_set_sync_secret(text) from anon, authenticated, public;
grant execute on function public.tiktok_set_sync_secret(text) to service_role;

/**
 * Fire the sync. Kept as a function rather than inlined into the cron command
 * so the schedule can be read without a lesson in pg_net, and so a manual
 * "run it now" is one call rather than a copied block.
 */
create or replace function public.tiktok_run_nightly_sync(p_days integer default 3)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_request_id bigint;
  v_url text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'tiktok_sync_secret';

  if v_secret is null then
    raise exception 'no tiktok_sync_secret in the vault; run tiktok_set_sync_secret first';
  end if;

  -- Built from the project ref rather than hardcoded, so dev and prod each
  -- call their own function without this file differing between them.
  v_url := 'https://' ||
    current_setting('app.settings.project_ref', true) ||
    '.supabase.co/functions/v1/tiktok-sync';

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-region', 'ap-northeast-1',
      'x-sync-secret', v_secret
    ),
    body := jsonb_build_object('days', p_days),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.tiktok_run_nightly_sync(integer) from anon, authenticated, public;
grant execute on function public.tiktok_run_nightly_sync(integer) to service_role;
