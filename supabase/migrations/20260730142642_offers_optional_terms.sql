-- ============================================================================
-- An offer does not always have a video count and a reward.
-- ============================================================================
-- The first cut assumed every offer was "N videos for $X". Real ones are not:
-- a boosted commission rate, or an open collaboration, has no fixed deliverable
-- and no fixed fee. Forcing a number into those columns meant inventing one,
-- which is worse than leaving it empty.
--
-- Both columns become nullable. The existing range checks stay and still do
-- their job, because in SQL a check against NULL evaluates to NULL and is
-- treated as satisfied, so "between 1 and 1000" continues to reject 0 and 1001
-- while allowing "not applicable".
--
-- Which offers MUST carry terms is a product rule, not a database truth, so it
-- lives in Zod: enforced in the browser and again in the Edge Function, where
-- it can be changed without a migration. Today that rule is "required when the
-- creator has to apply", because an offer somebody applies for has to say what
-- they are applying for.
-- ============================================================================

alter table public.offers
  alter column video_count drop not null,
  alter column reward_amount drop not null;

comment on column public.offers.video_count is
  'How many videos the creator delivers. Null when the offer has no fixed deliverable, for example a boosted commission rate.';
comment on column public.offers.reward_amount is
  'What the offer pays. Null when there is no fixed fee, for example a commission based offer.';
