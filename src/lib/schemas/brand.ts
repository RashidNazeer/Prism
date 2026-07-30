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

const requiredMoney = z
  .string()
  .trim()
  .min(1, 'A reward amount is required')
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), {
    message: 'Use a number, with at most two decimal places',
  })
  .refine((v) => Number(v) <= 99_999_999, { message: 'That amount is too large' })
  .transform((v) => Number(v));

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

export const offerSchema = z.object({
  badgeTitle: z.string().trim().max(32, 'Keep the badge under 32 characters'),
  title: z.string().trim().min(1, 'Give the offer a title').max(120, 'That title is too long'),
  description: z.string().trim().max(2000, 'That description is too long'),
  videoCount: z
    .string()
    .trim()
    .min(1, 'How many videos?')
    .refine((v) => /^\d+$/.test(v), { message: 'Use a whole number' })
    .transform((v) => Number(v))
    .refine((n) => n >= 1 && n <= 1000, { message: 'Between 1 and 1000 videos' }),
  rewardAmount: requiredMoney,
  currency: z.enum(CURRENCIES),
  status: z.enum(['active', 'inactive']),
  needsApplication: z.boolean(),
});

export type OfferInput = z.input<typeof offerSchema>;
export type OfferParsed = z.output<typeof offerSchema>;

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
