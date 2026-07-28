import { z } from 'zod';

/**
 * Creator application contract.
 *
 * Lives in its own file because Step 3 will import this exact schema inside the
 * Supabase Edge Function that stores the application. Client-side validation is
 * a convenience; the server re-validates with the same rules so a crafted
 * request cannot bypass them.
 */

export const NICHES = [
  'Beauty & skincare',
  'Health & wellness',
  'Fitness & recovery',
  'Home & kitchen',
  'Fashion & accessories',
  'Food & beverage',
  'Baby & kids',
  'Pets',
  'Tech & gadgets',
  'Other',
] as const;

export const WORKED_WITH_WURX = [
  { value: 'no', label: 'No — this is my first time' },
  { value: 'yes', label: 'Yes — I know my contact by name' },
] as const;

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
      .max(1000, 'That is a lot of links — keep it to your best three')
      .refine((v) => /https?:\/\/|tiktok\.com/i.test(v), {
        message: 'Include at least one full link, e.g. https://tiktok.com/@you/video/...',
      }),
  })
  .refine((data) => data.niche !== 'Other' || (data.nicheOther?.length ?? 0) >= 2, {
    message: 'Tell us which niche',
    path: ['nicheOther'],
  });

export type ApplicationInput = z.input<typeof applicationSchema>;
export type Application = z.output<typeof applicationSchema>;

/** Empty form state. */
export const emptyApplication: ApplicationInput = {
  tiktokHandle: '',
  email: '',
  niche: '' as ApplicationInput['niche'],
  nicheOther: '',
  workedWithWurx: '' as ApplicationInput['workedWithWurx'],
  videoLinks: '',
};
