-- ============================================================================
-- Three read-only Paid Collabs roles: Affiliate Team Lead, Operations Lead,
-- Ads Manager.
--
-- THIS MIGRATION ONLY ADDS THE ENUM VALUES, and that is not tidiness. Postgres
-- will not let a value added by `alter type ... add value` be USED in the same
-- transaction that added it, and each migration file runs in its own
-- transaction. So the labels are committed here and everything that references
-- them lives in the next file. Combining the two fails at deploy, not at
-- review, which is the worst place to find it.
--
-- ADDING A ROLE IS SAFE BY CONSTRUCTION HERE, and that was checked before it
-- was written. Every role test in this database is an ALLOW-LIST:
--   public.is_staff()            -> jwt_role() in ('ops','admin')   [70 policies]
--   public.assert_active_staff() -> rejects anything not ops/admin
--   the seven direct jwt_role() tests are all `=` or `in`, never `<>`
-- so a role that exists but is named nowhere can read and write nothing at all.
-- The next migration grants exactly one thing: SELECT on the Paid Collabs
-- schema. If that migration were reverted, these three would simply see an
-- empty app rather than somebody else's money.
-- ============================================================================

alter type public.app_role add value if not exists 'affiliate_team_lead';
alter type public.app_role add value if not exists 'operations_lead';
alter type public.app_role add value if not exists 'ads_manager';
