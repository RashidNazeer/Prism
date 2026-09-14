import type { AppRole, CreatorTier } from '@/lib/auth/auth-context';

/**
 * What we call roles and tiers, in one place.
 *
 * NEUTRAL, like the stage vocabulary next to it. Both sides print these, and
 * two copies of a label is how an admin ends up calling somebody "Pro" on one
 * screen and "pro" on another.
 *
 * Note the collision these two share: a creator on the starting tier is a
 * "Creator" with the tier "Creator". Anywhere both appear, label the tier as a
 * TIER rather than stacking the two words in a column, or it reads as a
 * mistake.
 */

export const ROLE_LABEL: Record<AppRole, string> = {
  applicant: 'Applicant',
  creator: 'Creator',
  creative_strategist: 'Creative strategist',
  ops: 'Ops',
  admin: 'Admin',
  /* Spelled out rather than abbreviated: "ATL" means nothing to somebody
     reading an audit row. The first two are read-only Paid Collabs roles;
     Ads Manager is full staff since 2026-09-15. */
  affiliate_team_lead: 'Affiliate Team Lead',
  operations_lead: 'Operations Lead',
  ads_manager: 'Ads Manager',
};

export const TIER_LABEL: Record<CreatorTier, string> = {
  creator: 'Creator',
  rising: 'Rising',
  pro: 'Pro',
  elite: 'Elite',
};
