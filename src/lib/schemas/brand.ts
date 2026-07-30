import { z } from 'zod';

/**
 * Brand and offer input, validated in the browser.
 *
 * The identical rules are enforced again in the Edge Function and a third time
 * by check constraints in the database. This copy exists so an admin sees the
 * problem before a request leaves the machine; it is not what makes the rule
 * true.
 */

/** Money arrives from an <input> as a string. Empty means "not set". */
const optionalMoney = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || /^\d+(\.\d{1,2})?$/.test(v), {
    message: 'Use a number, with at most two decimal places',
  })
  .refine((v) => v === null || Number(v) <= 99_999_999, {
    message: 'That budget is larger than we allow',
  })
  .transform((v) => (v === null ? null : Number(v)));

/** Whole number, or null when the box is left empty. */
const optionalCount = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || /^\d+$/.test(v), { message: 'Use a whole number' })
  .transform((v) => (v === null ? null : Number(v)))
  .refine((n) => n === null || (n >= 1 && n <= 1000), {
    message: 'Between 1 and 1000 videos',
  });

export const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'] as const;

export const brandSchema = z.object({
  name: z.string().trim().min(1, 'Give the brand a name').max(120, 'That name is too long'),
  storeId: z
    .string()
    .trim()
    .min(1, 'The TikTok Shop store id is required')
    .max(64, 'That store id is too long'),
  clientName: z.string().trim().max(120, 'That client name is too long'),
  budget: optionalMoney,
  currency: z.enum(CURRENCIES),
  isActive: z.boolean(),
});

export type BrandInput = z.input<typeof brandSchema>;
export type BrandParsed = z.output<typeof brandSchema>;

export const offerSchema = z
  .object({
    badgeTitle: z.string().trim().max(32, 'Keep the badge under 32 characters'),
    title: z.string().trim().min(1, 'Give the offer a title').max(120, 'That title is too long'),
    description: z.string().trim().max(2000, 'That description is too long'),
    videoCount: optionalCount,
    rewardAmount: optionalMoney,
    currency: z.enum(CURRENCIES),
    status: z.enum(['active', 'inactive']),
    needsApplication: z.boolean(),
  })
  /*
   * The terms are required only when the creator has to apply.
   *
   * Not every offer is "N videos for $X". A boosted commission rate or an open
   * collaboration has no fixed deliverable and no fixed fee, and demanding one
   * only gets a made up number typed in. But an offer somebody has to APPLY
   * for has to say what they are applying for, so when that box is ticked the
   * description, the video count and the reward are all required.
   *
   * This lives here rather than as a database constraint because it is a
   * product rule and will keep moving. The database only enforces what is
   * always true: if a video count is present it is between 1 and 1000.
   */
  .refine((v) => !v.needsApplication || v.description.trim().length > 0, {
    message: 'An offer creators apply for needs a description of what to deliver',
    path: ['description'],
  })
  .refine((v) => !v.needsApplication || v.videoCount !== null, {
    message: 'How many videos would they deliver?',
    path: ['videoCount'],
  })
  .refine((v) => !v.needsApplication || v.rewardAmount !== null, {
    message: 'What does this offer pay?',
    path: ['rewardAmount'],
  });

export type OfferInput = z.input<typeof offerSchema>;
export type OfferParsed = z.output<typeof offerSchema>;

/**
 * The brand's story, as creators read it.
 *
 * Everything is optional. A brand is useful the moment it has a name, and
 * demanding a tagline before an admin can save a logo would only get a
 * placeholder typed in that nobody ever comes back to fix.
 */
export const brandAboutSchema = z.object({
  logoUrl: z
    .string()
    .trim()
    .max(500, 'That image address is too long')
    .transform((v) => (v === '' ? null : v)),
  tagline: z.string().trim().max(160, 'Keep the tagline to one line'),
  description: z.string().trim().max(4000, 'That description is too long'),
});

export type BrandAboutInput = z.input<typeof brandAboutSchema>;

/** A percentage, from a text box. Empty means "not set yet". */
const optionalPercent = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v.replace(/%$/, '').trim()))
  .refine((v) => v === null || /^\d+(\.\d{1,2})?$/.test(v), {
    message: 'Use a number, for example 25',
  })
  .transform((v) => (v === null ? null : Number(v)))
  .refine((n) => n === null || (n >= 0 && n <= 100), {
    message: 'A commission is between 0 and 100',
  });

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Give the product a name').max(160, 'That name is too long'),
  externalProductId: z
    .string()
    .trim()
    .min(1, 'The TikTok Shop product id is required')
    .max(64, 'That product id is too long'),
  imageUrl: z
    .string()
    .trim()
    .max(500, 'That image address is too long')
    .transform((v) => (v === '' ? null : v)),
  // Price and commission are optional on purpose. A product can be listed
  // before its numbers are confirmed, and the card says so rather than
  // printing a zero somebody would read as real.
  price: optionalMoney,
  currency: z.enum(CURRENCIES),
  commissionRate: optionalPercent,
  badgeTitle: z.string().trim().max(32, 'Keep the badge under 32 characters'),
  isActive: z.boolean(),
});

export type ProductInput = z.input<typeof productSchema>;

/** First error per field, in the shape the form components expect. */
export function collectFieldErrors<T extends z.ZodType>(
  schema: T,
  value: unknown
): Record<string, string> {
  const result = schema.safeParse(value);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
