-- ============================================================================
-- A FOLLOWER LOOKUP THAT FAILS IS RECORDED, SO IT CANNOT BLOCK THE QUEUE.
--
-- Found the same afternoon the lookups went in: one handle makes Euka's
-- market-intelligence search answer 503 every time. Failures were not recorded
-- (a failed request is not an answer about a person), so that handle stayed
-- "never looked up", sorted first in every run, failed, and stopped the batch —
-- and nobody behind it was ever looked up. Known-good handles probed at the
-- same moment all answered 200, so it was never Euka being overloaded.
--
-- Now a failure is written down with its reason and a timestamp that puts it
-- back in line after about a day. `found` stays false, and `last_error` is what
-- tells a failure apart from a clean miss.
-- ============================================================================

alter table public.euka_creator_followers
  add column if not exists last_error text;

comment on column public.euka_creator_followers.last_error is
  'Why the last lookup failed, when it did. Null for a clean hit or a clean miss.';
