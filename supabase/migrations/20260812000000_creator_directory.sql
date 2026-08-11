/*
 * A creator is a thing you can open.
 *
 * There is a screen for applications, brands, offers, requests, videos and
 * activity, and none for a PERSON. Answering "what is going on with this
 * creator" meant searching four screens by hand and holding the answer in your
 * head.
 *
 * This is the identity half: one row per creator, with the handle their
 * application carries, so the list can be searched and paged in the database.
 * Their work, their money and their videos are grouped reads over the people
 * actually on the page, the same shape `useOfferPeople` has always used.
 */

-- ---------------------------------------------------------------------------
-- First, undo a duplicate I added earlier today.
-- ---------------------------------------------------------------------------
/*
 * `applications.tiktok_handle` has had a trigram index since the audit log
 * migration in July (`applications_tiktok_handle_trgm_idx`). The brand rollups
 * migration added a second one on the same column under a different name, which
 * Postgres accepts without a murmur and then maintains on every write to the
 * table forever. Dropping the newer one; the original stays and is what the
 * directory below searches through.
 */
drop index if exists public.applications_handle_trgm_idx;

-- ---------------------------------------------------------------------------
-- The directory
-- ---------------------------------------------------------------------------
/*
 * WHY A VIEW RATHER THAN A JOIN IN THE QUERY.
 *
 * A person's identity is spread across two tables. Their account is
 * `profiles`; their TikTok handle, which is the only name anybody here
 * actually uses, is on `applications`. Searching "handle OR name OR email" in
 * one PostgREST call across an embedded resource is awkward and easy to get
 * subtly wrong, and paging on the result of an embed is worse.
 *
 * `applications.user_id` is NOT NULL UNIQUE, so this join cannot fan out: one
 * row per person, which is what keeps `count: 'exact'` honest. The join is a
 * LEFT one because a creator can exist with no application at all, and a
 * person with no row would otherwise vanish from their own directory.
 *
 * Staff only, in the body, for the same reason as the brand rollups: this is
 * every creator's identity and a creator must get nothing rather than a
 * narrowed something. `is_service_role()` is in the gate because the service
 * key carries no `user_role` claim, so `is_staff()` alone is false for it.
 */
create view public.creator_directory
with (security_invoker = true) as
select
  p.id,
  p.email,
  p.display_name,
  p.role,
  p.tier,
  p.is_active,
  p.created_at,
  a.id            as application_id,
  a.tiktok_handle,
  a.status        as application_status,
  a.niche,
  a.reviewed_at
from public.profiles p
left join public.applications a on a.user_id = p.id
where p.role = 'creator'
  and (select public.is_staff() or public.is_service_role());

comment on view public.creator_directory is
  'One row per approved creator: their account, and the handle from their application. Staff only. Applicants are deliberately absent, they have their own screen in the review queue.';

grant select on public.creator_directory to authenticated;
grant all privileges on table public.creator_directory to service_role;
