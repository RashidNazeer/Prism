import { z } from 'zod';
import { optionalCount, optionalMoney } from '@/lib/schemas/brand';

/**
 * A creator asking for an offer.
 *
 * Two shapes, one form. `asOffered` takes the brand's terms exactly as
 * written. `own` is the counter offer: this many videos, for this much. An
 * offer with no fixed terms can only ever be the second one, because there is
 * nothing to accept.
 *
 * The same rules run again in the Edge Function and a third time in the
 * database function. This copy exists so a creator sees the problem before the
 * request leaves their phone.
 */
export const offerApplicationSchema = z
  .object({
    mode: z.enum(['asOffered', 'own']),
    videoCount: optionalCount,
    amount: optionalMoney,
    note: z.string().trim().max(1000, 'Keep it under 1000 characters'),
  })
  .refine((v) => v.mode !== 'own' || v.videoCount !== null, {
    message: 'How many videos will you make?',
    path: ['videoCount'],
  })
  .refine((v) => v.mode !== 'own' || v.amount !== null, {
    message: 'What would you want for it?',
    path: ['amount'],
  });

export type OfferApplicationInput = z.input<typeof offerApplicationSchema>;
