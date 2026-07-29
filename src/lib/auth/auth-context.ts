import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export const ROLES = [
  'applicant',
  'creator',
  'creative_strategist',
  'ops',
  'admin',
] as const;
export type AppRole = (typeof ROLES)[number];

export const TIERS = ['creator', 'rising', 'pro', 'elite'] as const;
export type CreatorTier = (typeof TIERS)[number];

/**
 * Claims we put into the access token via the Postgres hook
 * (`custom_access_token_hook`). Reading them avoids a database round trip on
 * every screen just to find out who someone is.
 *
 * These are for DECIDING WHAT TO SHOW, never for deciding what is allowed.
 * A token is signed but it is still client-side data, and it can be up to an
 * hour stale. Permission is enforced by row level security in the database.
 */
export interface AuthClaims {
  role: AppRole;
  tier: CreatorTier | null;
  active: boolean;
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  claims: AuthClaims | null;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where each role belongs after signing in. */
export const HOME_FOR_ROLE: Record<AppRole, string> = {
  applicant: '/app',
  creator: '/app',
  creative_strategist: '/studio',
  ops: '/admin',
  admin: '/admin',
};

const isRole = (v: unknown): v is AppRole =>
  typeof v === 'string' && (ROLES as readonly string[]).includes(v);

const isTier = (v: unknown): v is CreatorTier =>
  typeof v === 'string' && (TIERS as readonly string[]).includes(v);

/**
 * Pull our custom claims out of the access token.
 *
 * Deliberately hand-rolled rather than pulling in a JWT library: we are only
 * reading a base64 payload we already trust the server to have signed, and we
 * never verify it here because verification is the database's job.
 */
export function readClaims(accessToken: string | undefined): AuthClaims | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      role: isRole(parsed.user_role) ? parsed.user_role : 'applicant',
      tier: isTier(parsed.user_tier) ? parsed.user_tier : null,
      active: parsed.user_active !== false,
    };
  } catch {
    // A malformed token means we know nothing. Treat it as the least
    // privileged case rather than guessing.
    return null;
  }
}
