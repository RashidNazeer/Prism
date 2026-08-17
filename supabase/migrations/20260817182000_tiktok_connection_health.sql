-- ============================================================================
-- Connection health, without the token.
--
-- `tiktok_connections` has RLS on and no policies, so an admin genuinely cannot
-- read it, which is correct and also inconvenient: the settings screen has to
-- say whether we are connected, when it was last verified, and whether the last
-- attempt failed. All of that is metadata; none of it is the credential.
--
-- So: a view over the safe columns only. It is a SECURITY DEFINER view, which
-- is the deliberate choice here rather than an oversight.
--
--   * `security_invoker` is NOT set, so the view runs as its owner and the base
--     table's deny-all RLS does not apply to it. That is the entire reason it
--     can return anything at all.
--   * Because of that, the WHERE clause IS the access control. It is not a
--     filter for convenience; it is the lock. Never relax it.
--   * `access_token` is not in the select list and must never be added. There
--     is no scenario where a browser needs it: every call that uses the token
--     happens inside an edge function.
-- ============================================================================

create view public.tiktok_connection_health as
  select
    c.id,
    c.connected_at,
    c.last_verified_at,
    c.last_error,
    c.revoked_at,
    coalesce(array_length(c.granted_advertiser_ids, 1), 0) as granted_advertiser_count,
    p.display_name as connected_by_name,
    p.email        as connected_by_email
  from public.tiktok_connections c
  left join public.profiles p on p.id = c.connected_by
  -- THE LOCK. Admins only: reviewing creators does not imply managing the ad
  -- account that reads a client's live spend.
  where public.jwt_role() = 'admin';

comment on view public.tiktok_connection_health is
  'Non-secret status of the TikTok connection. SECURITY DEFINER by design, so its WHERE clause is the access control, not a convenience filter. access_token is absent and must stay absent.';

revoke all on public.tiktok_connection_health from anon;
grant select on public.tiktok_connection_health to authenticated;
grant all privileges on public.tiktok_connection_health to service_role;
