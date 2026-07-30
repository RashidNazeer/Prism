import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { useAuth, type AppRole, type CreatorTier } from './auth-context';

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
      const { data, error } = await getSupabase()
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
