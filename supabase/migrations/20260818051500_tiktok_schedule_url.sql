-- ============================================================================
-- Where the nightly job posts, kept out of this file.
--
-- The first version built the URL from `app.settings.project_ref`, which is not
-- a setting Supabase sets. Rather than hardcode a project ref into a migration
-- that both dev and prod run, the URL lives beside the secret in the vault and
-- is set once at deploy time. So this file is identical on both projects and
-- neither one can accidentally pull the other's data.
-- ============================================================================

create or replace function public.tiktok_set_sync_url(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/tiktok-sync$' then
    raise exception 'that does not look like a tiktok-sync function URL';
  end if;

  select id into v_id from vault.secrets where name = 'tiktok_sync_url';

  if v_id is null then
    perform vault.create_secret(p_url, 'tiktok_sync_url', 'Where the nightly TikTok sync posts');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
end;
$$;

revoke all on function public.tiktok_set_sync_url(text) from anon, authenticated, public;
grant execute on function public.tiktok_set_sync_url(text) to service_role;

create or replace function public.tiktok_run_nightly_sync(p_days integer default 3)
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
  from vault.decrypted_secrets where name = 'tiktok_sync_secret';
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'tiktok_sync_url';

  if v_secret is null or v_url is null then
    raise exception 'the vault is missing tiktok_sync_secret or tiktok_sync_url';
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Without this the call leaves from the database's own region, and if
      -- that is Mumbai TikTok refuses it as a banned country every night.
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

/*
 * 03:20 UTC, which is 22:20 in the ad account's own timezone (Etc/GMT+5). That
 * is comfortably after its midnight has passed for the day being pulled, so
 * "yesterday" is genuinely complete rather than still being written.
 */
select cron.unschedule('tiktok-nightly')
where exists (select 1 from cron.job where jobname = 'tiktok-nightly');

select cron.schedule(
  'tiktok-nightly',
  '20 3 * * *',
  $$ select public.tiktok_run_nightly_sync(3); $$
);
