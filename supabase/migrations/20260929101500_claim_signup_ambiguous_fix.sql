-- ============================================================================
-- `claim_tiktok_signup` could never bind anything: "column reference open_id is
-- ambiguous".
--
-- The function was declared `returns table (open_id text, handle text, ...)`,
-- and in PL/pgSQL those output columns are ordinary identifiers in scope for
-- the whole body. So every bare `open_id` and `handle` inside it — in the
-- `exists` guard and in the updates — matched both the OUT column and the
-- table's own column, and Postgres refused rather than guessing.
--
-- It failed at the one moment it mattered and nowhere else: the guards all
-- returned their refusals correctly, because they return BEFORE the first
-- ambiguous reference. Only the success path reached it. A check that had
-- exercised nothing but refusals would have been entirely green.
--
-- The outputs are renamed with an `out_` prefix so they cannot collide, and
-- every reference inside is qualified.
-- ============================================================================
drop function if exists public.claim_tiktok_signup(text, text, uuid);

create or replace function public.claim_tiktok_signup(
  p_ticket_hash         text,
  p_browser_secret_hash text,
  p_profile             uuid
)
returns table (out_open_id text, out_handle text, out_already boolean)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row     public.tiktok_signup_pending;
  v_profile public.profiles;
begin
  if not public.is_service_role() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.tiktok_signup_pending
   where ticket_hash = p_ticket_hash for update;
  if not found then
    raise exception 'That link has expired. Start again from the sign-up page.'
      using errcode = 'no_data_found';
  end if;

  if v_row.browser_secret_hash is distinct from p_browser_secret_hash then
    raise exception 'That link has expired. Start again from the sign-up page.'
      using errcode = 'no_data_found';
  end if;

  if v_row.expires_at < now() then
    raise exception 'That link has expired. Start again from the sign-up page.'
      using errcode = 'no_data_found';
  end if;

  if v_row.claimed_at is not null then
    if v_row.claimed_by = p_profile then
      return query select v_row.open_id, v_row.handle, true;
      return;
    end if;
    raise exception 'That link has already been used.' using errcode = 'no_data_found';
  end if;

  select * into v_profile from public.profiles where id = p_profile;
  if not found then
    raise exception 'No such account.' using errcode = 'no_data_found';
  end if;
  if v_profile.created_at < v_row.created_at then
    raise exception 'That link cannot be used with this account.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.started_by is not null and v_row.started_by is distinct from p_profile then
    raise exception 'That link belongs to a different sign-up.'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.tiktok_identities i
     where i.open_id = v_row.open_id
       and i.released_at is null
       and i.profile_id is distinct from p_profile
  ) then
    raise exception 'That TikTok account has already been used on another Wurx account.'
      using errcode = 'unique_violation';
  end if;

  insert into public.creator_tiktok_connections as c
    (creator_id, open_id, union_id, display_name, avatar_url, scope,
     connected_at, revoked_at, app_generation)
  values
    (p_profile, v_row.open_id, v_row.union_id, v_row.display_name, v_row.avatar_url,
     v_row.scope, now(), null, 'sandbox-2026')
  on conflict (creator_id) do update
    set open_id = excluded.open_id, union_id = excluded.union_id,
        display_name = excluded.display_name, avatar_url = excluded.avatar_url,
        scope = excluded.scope, connected_at = excluded.connected_at,
        revoked_at = null;

  insert into public.creator_tiktok_tokens as t
    (creator_id, access_token, refresh_token, access_expires_at, refresh_expires_at, updated_at)
  values
    (p_profile, v_row.access_token, v_row.refresh_token,
     v_row.access_expires_at, v_row.refresh_expires_at, now())
  on conflict (creator_id) do update
    set access_token = excluded.access_token, refresh_token = excluded.refresh_token,
        access_expires_at = excluded.access_expires_at,
        refresh_expires_at = excluded.refresh_expires_at, updated_at = now();

  update public.tiktok_identities i
     set handle = coalesce(v_row.handle, i.handle), source = 'signup'
   where i.open_id = v_row.open_id and i.released_at is null;

  if v_row.handle is not null then
    update public.applications a
       set tiktok_handle = v_row.handle, tiktok_handle_verified = true
     where a.user_id = p_profile;
  end if;

  update public.tiktok_signup_pending p
     set claimed_at = now(), claimed_by = p_profile,
         access_token = null, refresh_token = null   -- moved, not copied
   where p.id = v_row.id;

  insert into public.audit_log
    (actor_id, actor_email, actor_role, action, subject_type, subject_id,
     target_user_id, detail)
  values
    (p_profile, v_profile.email, v_profile.role,
     'tiktok_signup.claimed', 'creator_tiktok_connection', p_profile, p_profile,
     jsonb_build_object('open_id', v_row.open_id, 'handle', v_row.handle,
                        'started_signed_in', v_row.started_by is not null));

  return query select v_row.open_id, v_row.handle, false;
end;
$fn$;

revoke all on function public.claim_tiktok_signup(text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_tiktok_signup(text, text, uuid) to service_role;
