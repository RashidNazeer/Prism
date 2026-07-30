-- ============================================================================
-- Creator onboarding moments.
-- ============================================================================
-- Two things must happen exactly once in a creator's life, and never again:
--
--   1. The welcome, the first time they land in the hub after applying.
--   2. The congratulations, the first time they are approved.
--
-- These live in the DATABASE, not in localStorage. A creator applies on their
-- phone and signs in on a laptop the next day; browser storage would replay the
-- welcome as if they were new, and would replay the approval celebration every
-- time they cleared their cache. Recording the moment against the account is
-- the only version that is actually once.
--
-- Timestamps rather than booleans: "when did this person join the hub" and "how
-- long between applying and being told" are questions worth being able to
-- answer later, and a null is just as easy to test as a false.
-- ============================================================================

alter table public.profiles
  add column welcomed_at timestamptz,
  add column approval_celebrated_at timestamptz;

comment on column public.profiles.welcomed_at is
  'When the creator dismissed the welcome. Null means they have never seen it.';
comment on column public.profiles.approval_celebrated_at is
  'When the creator was shown the "you are approved" moment. Null means never.';

-- ---------------------------------------------------------------- grants ---
-- Added to the existing column-level grant, which is display_name only. These
-- two are safe for someone to set on themselves: the worst a tampered value can
-- do is skip or repeat an animation on their own screen. Nothing reads them for
-- a permission decision, and the escalation guard on this table still blocks
-- role, tier, is_active, id and email exactly as before, because these columns
-- are not in that list.

grant update (welcomed_at, approval_celebrated_at) on public.profiles to authenticated;
