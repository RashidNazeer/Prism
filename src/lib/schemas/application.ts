import { z } from 'zod';
import {
  NICHES,
  PASSWORD_MIN,
  type ApplicationErrors,
  type ApplicationInput,
} from './application-fields';

/**
 * Creator application contract.
 *
 * This module is loaded LAZILY by the form, on the first submit, so Zod stays
 * off the landing page's initial download. Step 3's Supabase Edge Function will
 * import this same file and re-validate server side: client validation is a
 * convenience, the server is the security boundary.
 */

export const applicationSchema = z
  .object({
    /** Stored without the leading @; the UI shows it with one. */
    tiktokHandle: z
      .string()
      .trim()
      .min(2, 'Enter your TikTok handle')
      .max(64, 'That handle looks too long')
      .regex(
        /^@?[a-zA-Z0-9._]+$/,
        'Handles can only contain letters, numbers, dots and underscores'
      )
      .transform((v) => v.replace(/^@/, '')),

    email: z.string().trim().min(1, 'Enter your email').email('That email does not look right'),

    niche: z.enum(NICHES, { message: 'Pick the niche closest to your content' }),

    /** Only required when `niche` is "Other". */
    nicheOther: z.string().trim().max(60, 'Keep it under 60 characters').optional(),

    workedWithWurx: z.enum(['no', 'yes'], { message: 'Pick one' }),

    videoLinks: z
      .string()
      .trim()
      .min(8, 'Paste at least one video link')
      .max(1000, 'That is a lot of links, keep it to your best three')
      .refine((v) => /https?:\/\/|tiktok\.com/i.test(v), {
        message: 'Include at least one full link, like https://tiktok.com/@you/video/...',
      }),

    password: z
      .string()
      .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
      .max(72, 'Passwords are limited to 72 characters'),
  })
  .refine((data) => data.niche !== 'Other' || (data.nicheOther?.length ?? 0) >= 2, {
    message: 'Tell us which niche',
    path: ['nicheOther'],
  });

export type Application = z.output<typeof applicationSchema>;

/**
 * Validate raw form state and return one message per bad field.
 * Returns an empty object when everything passes.
 */
export function validateApplication(input: ApplicationInput): ApplicationErrors {
  const result = applicationSchema.safeParse(input);
  if (result.success) return {};

  const errors: ApplicationErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ApplicationInput | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
