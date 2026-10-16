import { OFFER_STAGES, type OfferStage } from '@/lib/offer-stages';
import type { WorkSummary } from '@/lib/creator/useMyWork';

/**
 * A believable pipeline for the dev preview at /dev/home.
 *
 * It lives beside the components rather than in the dev route so the shape is
 * checked against the real `WorkSummary` type: if `summarise` grows a field,
 * this stops compiling instead of quietly drifting from what Home receives.
 * Nothing imports it outside the dev route.
 */
const byStage = Object.fromEntries(
  OFFER_STAGES.map((s) => [s, { count: 0, amount: 0 }])
) as Record<OfferStage, { count: number; amount: number }>;

byStage.content_pending = { count: 1, amount: 360 };
byStage.payment_pending = { count: 1, amount: 350 };
byStage.paid = { count: 1, amount: 330 };

export const EMPTY_STAGES_FOR_PREVIEW: WorkSummary = {
  active: 2,
  approved: 3,
  waiting: 1,
  declined: 0,
  brands: 2,
  money: { paid: 330, due: 350, working: 360, total: 1040, currency: 'USD' },
  byStage,
};
