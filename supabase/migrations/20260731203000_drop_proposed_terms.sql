-- ============================================================================
-- Finish removing counter offers: drop the two columns behind them.
-- ============================================================================
-- Creators naming their own price shipped on 2026-07-31 and was withdrawn the
-- same day. The earlier migration stopped anything writing these two columns
-- but kept them, so requests made during that window would still say what was
-- really asked for rather than being quietly restated as the brand's number.
--
-- Rashid confirmed there is no data worth protecting: everything is on dev, and
-- a count found zero requests carrying a creator-set price. So what is left is
-- two columns nothing can write and about fifteen lines of screen code that can
-- never run, on a table that payments will eventually hang off. That is worse
-- than the gap it was insuring against.
--
-- If creators are ever allowed to name a price again, this comes back as two
-- columns, two parameters on `apply_for_offer`, two fields in the dialog and a
-- branch in the queue. It is a small migration in either direction, which is
-- the reason it is safe to remove.
--
-- `currency` STAYS. It records the currency the offer was quoted in at the
-- moment the request was made, which is still written on every row and still
-- matters when an offer is later re-priced.
-- ============================================================================

alter table public.offer_applications
  drop column proposed_video_count,
  drop column proposed_amount;
