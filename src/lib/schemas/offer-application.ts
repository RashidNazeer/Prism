import { z } from 'zod';

/**
 * A creator asking for an offer.
 *
 * The offer's own terms are what they are asking for. There is nothing to
 * choose and nothing to negotiate, so the only thing this carries is whatever
 * they want to say alongside it.
 *
 * Countering an offer with your own video count and your own price shipped on
 * 2026-07-31 and was withdrawn the same day. If it returns, it returns here
 * first, then in the dialog, then as parameters on `apply_for_offer`; the
 * columns behind it were kept.
 */
export const offerApplicationSchema = z.object({
  note: z.string().trim().max(1000, 'Keep it under 1000 characters'),
});

export type OfferApplicationInput = z.input<typeof offerApplicationSchema>;
