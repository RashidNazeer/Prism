import { z } from 'zod';
import { NICHES, type ApplicationErrors, type ApplicationInput } from './application-fields';
import { PASSWORD_MAX, PASSWORD_MIN, isObviousPassword } from './password-rules';

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
      .max(PASSWORD_MAX, `Passwords are limited to ${PASSWORD_MAX} characters`)
      /*
       * THE ONE NEW BLOCKING RULE, 2026-10-16, and it only ever TIGHTENS this
       * form: a password that passed before still passes unless it is a run, a
       * repeat or one of a handful of names on the list in `password-rules.ts`.
       * Email verification is parked, so this password is the whole lock on an
       * account that will later carry someone's earnings.
       */
      .refine((v) => !isObviousPassword(v), {
        message: 'That is too easy to guess. Three unrelated words work well.',
      }),

    confirmPassword: z.string(),
  })
  .refine((data) => data.niche !== 'Other' || (data.nicheOther?.length ?? 0) >= 2, {
    message: 'Tell us which niche',
    path: ['nicheOther'],
  })
  /* Reported on the SECOND box, which is the one to fix. */
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Both passwords need to match',
    path: ['confirmPassword'],
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

  /*
   * THE MATCH IS CHECKED AGAIN HERE, AND IT HAS TO BE.
   *
   * A `.refine` on the OBJECT only runs once every field inside it has parsed.
   * So on the first submit of a half-empty form — which is exactly when people
   * look for this message — Zod reports the empty handle and the empty email
   * and says nothing at all about two passwords that plainly differ. The person
   * fixes four fields, presses the button again, and only then learns about the
   * fifth. One line here means every problem on the form is told to them at the
   * same time. The refine stays, because the schema is also the contract for
   * anything that parses it server side.
   */
  if (!errors.confirmPassword && input.password !== input.confirmPassword) {
    errors.confirmPassword = 'Both passwords need to match';
  }

  return errors;
}
