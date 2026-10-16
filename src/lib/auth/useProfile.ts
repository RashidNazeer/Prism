import { useQuery } from '@tanstack/react-query';
import { useAuth, type AppRole, type CreatorTier } from './auth-context';

/*
 * `@/lib/supabase` IS IMPORTED DYNAMICALLY, AND THAT IS ABOUT THE ENTRY CHUNK.
 *
 * `AuthProvider` already takes this care (see the note at the top of that
 * file), but it was being undone from here. This hook is reached statically
 * from `router.tsx` — router -> ShellLayout -> AppShell -> AppSidebar ->
 * useWurxbaseIdentity -> useProfile -> `@/lib/supabase` — so a top-level
 * import put `@supabase/supabase-js` (52.5 KB gzipped) back into the entry
 * chunk that every visitor downloads before first paint, landing page
 * included. Measured on 2026-10-16.
 *
 * It costs nothing to load it here instead: `queryFn` is already async, and it
 * only ever runs for a signed-in user, by which point the client is in memory
 * anyway because `AuthProvider` fetched it to read the session. `getSupabase`
 * returns the one shared client, so there is still exactly one.
 */
const supabaseClient = () => import('@/lib/supabase').then((m) => m.getSupabase());

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: AppRole;
  tier: CreatorTier | null;
  is_active: boolean;
  created_at: string;
  /** Null until they have dismissed the welcome. See `useOnboarding`. */
  welcomed_at: string | null;
  /** Null until they have been shown the approval moment. */
  approval_celebrated_at: string | null;
}

/**
 * The signed-in user's own profile row.
 *
 * The JWT claims are enough to decide which screen to show, but this is the
 * source of truth and the only place a role change shows up immediately, since
 * a token can be up to an hour stale.
 *
 * Note the explicit column list. `select('*')` is banned on this project: it
 * ships whatever gets added later, including columns a screen has no business
 * reading.
 */
export function useProfile() {
  const { user, status } = useAuth();

  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: status === 'signedIn' && Boolean(user?.id),
    // Profiles barely change. Show the cached copy instantly and refresh
    // quietly rather than blocking a screen on it.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Profile> => {
      const supabase = await supabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, email, display_name, role, tier, is_active, created_at, welcomed_at, approval_celebrated_at'
        )
        .eq('id', user!.id)
        .single();

      if (error) throw error;
      return data as Profile;
    },
  });
}
