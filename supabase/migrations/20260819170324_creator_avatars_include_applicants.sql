-- ============================================================================
-- Applicants get a face too.
-- ============================================================================
-- The queue shipped an hour ago as `where p.role = 'creator'`, which quietly
-- excluded the single place a face is worth the most: the applications review
-- screen. That is a stranger, judged off a TikTok handle, by somebody deciding
-- whether to let them in. An approved creator is already known; an applicant is
-- exactly who you cannot picture.
--
-- 'applicant' is its own role, not a creator with a flag, so `role = 'creator'`
-- excluded every one of them and the three application surfaces would have
-- drawn initials for ever while looking finished.
--
-- Nothing else changes: the handle still comes from the application, which is
-- still the only place anybody ever typed it.
-- ============================================================================

-- Dropped rather than replaced: `create or replace view` may only APPEND
-- columns, and `role` belongs beside the profile it describes rather than
-- tacked on the end to satisfy a rule about rewriting.
drop view if exists public.creator_avatar_queue;

create view public.creator_avatar_queue
with (security_invoker = true)
as
  select
    p.id           as profile_id,
    p.role,
    p.display_name,
    a.tiktok_handle,
    ca.path,
    ca.error,
    ca.fetched_at
  from public.profiles p
  join public.applications a on a.user_id = p.id
  left join public.creator_avatars ca on ca.profile_id = p.id
  where p.role in ('applicant', 'creator')
    and p.is_active
    and a.tiktok_handle is not null;

comment on view public.creator_avatar_queue is
  'Applicants and creators, with the handle to fetch a picture by and whatever we already have. Applicants are included on purpose: the review queue is where a face is worth the most.';

grant select on public.creator_avatar_queue to authenticated;
grant select on public.creator_avatar_queue to service_role;
