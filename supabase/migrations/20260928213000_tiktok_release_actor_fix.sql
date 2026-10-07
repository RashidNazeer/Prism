-- ============================================================================
-- TWO FAULTS IN release_tiktok_identity, both found by its own check.
--
-- 1. IT REFUSED service_role. `is_staff()` resolves the caller from `auth.uid()`,
--    which is null for the service key — so every server-side or scripted
--    release was answered "Not allowed". The staff path worked; nothing else
--    did, including the verification suite, which is how this surfaced.
--
-- 2. THE AUDIT ROW COULD SILENTLY NOT EXIST. The insert was written as
--    `insert ... select ... from profiles where id = v_actor`. When the actor
--    has no profiles row — service_role, or a deleted account — that select
--    returns no rows, so the insert writes NOTHING and the release still
--    succeeds. A privileged action that quietly leaves no trace is worse than
--    one that fails: you would never know to look.
--
--    It is now an unconditional `values (...)` with scalar sub-selects, so the
--    row is always written and the actor's name is simply null when there isn't
--    one. An audit log that is missing exactly the rows nobody was watching is
--    the one failure mode it cannot have.
-- ============================================================================
create or replace function public.release_tiktok_identity(
  p_identity_id uuid,
  p_reason      text
)
returns public.tiktok_identities
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row   public.tiktok_identities;
begin
  -- service_role is the Edge Functions and the verification suite. It has no
  -- auth.uid(), so it can never satisfy is_staff(); it is named explicitly.
  if not (public.is_staff() or public.is_service_role()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to release a TikTok account.'
      using errcode = 'check_violation';
  end if;

  -- Locked, so two staff releasing at once cannot both believe they did it.
  select * into v_row from public.tiktok_identities
    where id = p_identity_id for update;
  if not found then
    raise exception 'No such TikTok identity.' using errcode = 'no_data_found';
  end if;
  if v_row.released_at is not null then
    return v_row;                       -- already released; idempotent
  end if;

  update public.tiktok_identities
     set released_at = now(), released_by = v_actor, release_reason = trim(p_reason)
   where id = p_identity_id
  returning * into v_row;

  -- ALWAYS WRITES. Scalar sub-selects, not a join, so a missing profile makes
  -- the actor columns null rather than making the whole row disappear.
  insert into public.audit_log
    (actor_id, actor_email, actor_role, action, subject_type, subject_id,
     target_user_id, detail)
  values (
    v_actor,
    (select p.email from public.profiles p where p.id = v_actor),
    (select p.role  from public.profiles p where p.id = v_actor),
    'tiktok.identity_released', 'tiktok_identity', v_row.id,
    v_row.profile_id,
    jsonb_build_object('open_id', v_row.open_id, 'handle', v_row.handle,
                       'app_generation', v_row.app_generation,
                       'reason', trim(p_reason),
                       'by', case when v_actor is null then 'service_role' else 'staff' end)
  );

  return v_row;
end;
$fn$;

revoke all on function public.release_tiktok_identity(uuid, text) from public, anon;
grant execute on function public.release_tiktok_identity(uuid, text) to authenticated, service_role;
