-- ============================================================================
-- Put back `grant usage on schema private to authenticated`, which the previous
-- migration should never have revoked.
--
-- WHAT I DID AND WHY IT WAS WRONG. `20260826000638` revoked that grant while
-- moving the creator TikTok tokens out of `private`. The reasoning was that
-- nothing of MINE needed it any more, so the grant may as well be narrowed. But
-- "nothing of mine needs it" is not the same question as "nothing needs it",
-- and I did not ask the second one before changing a schema three other
-- features live in.
--
-- IT IS LOAD-BEARING. `private.contest_excludes_caller(uuid)` is granted to
-- `authenticated` on purpose (20260813230000, line 1573) and is called from
-- BOTH creator select policies on `public.contests`:
--
--     create policy "contests_select_creator" on public.contests
--       for select to authenticated
--       using ( ... and not private.contest_excludes_caller(id) );
--
-- Calling a function requires USAGE on its schema as well as EXECUTE on the
-- function, so revoking the schema grant is an attempt to break every creator's
-- view of every contest.
--
-- HONESTLY: a live probe on dev after the revoke showed a creator still reading
-- contests without error, so either the revoke did not take effect or policy
-- expressions resolve that call in a way I cannot account for. Both readings
-- are bad news for the revoke. If it did nothing, the comment claiming it
-- tightened something was false, which is exactly the class of mistake that
-- review had just caught me making. If it did something, contests are one
-- unlucky detail away from breaking. Restoring the grant is correct under
-- either, and returns the schema to the state its owners designed.
--
-- THE LESSON, worth more than the line: do not tidy a shared object because a
-- review mentioned it. The finding was that a COMMENT of mine overstated what
-- `revoke ... from public` does. The fix for a wrong comment is a right
-- comment, not a privilege change in somebody else's feature.
-- ============================================================================

grant usage on schema private to authenticated;

comment on schema private is
  'Objects PostgREST must never expose as endpoints. `authenticated` holds USAGE deliberately, because contest select policies call private.contest_excludes_caller() and a function call needs USAGE on its schema as well as EXECUTE. Do not revoke it. What keeps this schema safe is that it is absent from the exposed-schema list, plus per-object grants, not the schema grant.';
