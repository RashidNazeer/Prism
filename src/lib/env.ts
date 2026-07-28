import { z } from 'zod';

/**
 * Browser environment contract.
 *
 * ONLY public values belong here. Anything in this file ships inside the
 * JavaScript bundle that every visitor downloads, so a service-role key or any
 * other secret must never appear. Those live in Edge Function secrets.
 *
 * Validation is lazy on purpose: the public shell renders fine without Supabase
 * configured, but the moment anything touches the database we want a loud,
 * readable error instead of a mystery `undefined` in a network call.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a full https:// URL'),
  /**
   * The `sb_publishable_...` key, not the legacy `eyJ...` anon JWT. Both work
   * today, but Supabase is phasing the legacy keys out and this project is
   * meant to run for years. Safe to ship publicly: it grants nothing on its
   * own, because every table is behind Row Level Security.
   */
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_PUBLISHABLE_KEY looks empty or truncated'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Missing or invalid environment variables.\n${details.join('\n')}\n\n` +
        `Locally: copy .env.example to .env.local and fill it in.\n` +
        `On Vercel: set them in Project Settings -> Environment Variables, then redeploy.`
    );
  }

  cached = parsed.data;
  return cached;
}
