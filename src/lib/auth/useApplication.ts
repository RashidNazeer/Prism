import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from './auth-context';

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface Application {
  id: string;
  tiktok_handle: string;
  niche: string;
  niche_other: string | null;
  worked_with_wurx: boolean;
  video_links: string;
  status: ApplicationStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * The signed-in user's own application, kept live.
 *
 * Row level security means this can only ever return their own row, so the
 * realtime channel below is safe: Supabase evaluates the same policies before
 * sending an event, and a creator never receives anyone else's changes.
 *
 * The live subscription is what makes Step 4 work: when an admin approves
 * someone, the applicant's screen changes while they are looking at it, with no
 * refresh and no email required.
 */
export function useApplication() {
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const enabled = status === 'signedIn' && Boolean(user?.id);

  const query = useQuery({
    queryKey: ['application', user?.id],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Application | null> => {
      const { data, error } = await getSupabase()
        .from('applications')
        .select(
          'id, tiktok_handle, niche, niche_other, worked_with_wurx, video_links, status, review_note, reviewed_at, created_at'
        )
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) throw error;
      return (data as Application | null) ?? null;
    },
  });

  useEffect(() => {
    if (!enabled || !user?.id) return;
    const supabase = getSupabase();

    // A narrow channel: this user's row only. Never a global firehose.
    const channel = supabase
      .channel(`application:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'applications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['application', user.id] });
          // A decision usually changes the role too, so refresh that as well.
          void queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, user?.id, queryClient]);

  return query;
}
