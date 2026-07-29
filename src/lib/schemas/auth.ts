import { z } from 'zod';

/**
 * Auth form contracts.
 *
 * Kept separate from the application schema so the two do not drag each other
 * into the same chunk. These load with the auth routes, which are behind a
 * click, so they can be imported normally.
 *
 * The minimum length matches `password_min_length` on the Supabase project. If
 * one changes, change the other, or people will pass the form and be rejected
 * by the server, which is a maddening bug to report.
 */
export const PASSWORD_MIN = 10;

const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(72, 'Passwords are limited to 72 characters');

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email')
  .email('That email does not look right');

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export const signUpSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Tell us what to call you')
      .max(60, 'Keep it under 60 characters'),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Both passwords need to match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Both passwords need to match',
    path: ['confirmPassword'],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** One message per bad field, in the shape the forms expect. */
export function collectErrors<T extends Record<string, unknown>>(
  schema: z.ZodType<unknown, T>,
  input: T
): Partial<Record<keyof T, string>> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  const errors: Partial<Record<keyof T, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof T | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
