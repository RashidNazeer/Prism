import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { joinChannel } from '@/lib/realtime';
import { useAuth } from '@/lib/auth/auth-context';

/**
 * What this creator has earned from contests, and how much of it has landed.
 *
 * ITS OWN HOOK, AND ITS OWN QUERY, rather than a field on `useCreatorContests`.
 * That hook answers "everything about every contest I can see" in seven reads:
 * the catalogue, the deliverables, the products, my entries, my frozen terms,
 * my progress and my claims. The home screen needs one number and a half, and
 * pulling all of that onto the first screen a creator opens would be paying for
 * six reads to render two figures.
 *
 * ONE READ, and it is the bill itself. `contest_awards` rows are only ever
 * written when staff confirm a figure that crosses a target, so this cannot
 * disagree with the contests screen and there is no arithmetic here to get
 * wrong. Own rows only: `contest_awards_select_own` is `creator_id =
 * auth.uid()` and there is no other creator policy on the table.
 *
 * GROUPED BY CURRENCY, because two is possible. Summing across currencies is
 * the single arithmetic error this data can cause, and it is prevented by
 * shape rather than by remembering.
 */

export interface ContestEarnings {
  currency: string;
  /** Earned and confirmed, not yet sent. */
  owed: number;
  /** Sent, and the creator has been told so. */
  paid: number;
  owedCount: number;
  paidCount: number;
}

/** Everything they have ever earned from a contest, in one figure per currency. */
export function useContestEarnings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator', 'contest-earnings'],
    staleTime: 15_000,
    queryFn: async (): Promise<ContestEarnings[]> => {
      const { data, error } = await getSupabase()
        .from('contest_awards')
        .select('awarded_amount, awarded_currency, paid_at')
        // Generous, and never unbounded. A creator with more than this many
        // separate contest rewards is a conversation, not a screen.
        .limit(500);

      if (error) throw error;

      const byCurrency = new Map<string, ContestEarnings>();
      for (const row of (data ?? []) as unknown as {
        awarded_amount: number | string;
        awarded_currency: string;
        paid_at: string | null;
      }[]) {
        const at = byCurrency.get(row.awarded_currency) ?? {
          currency: row.awarded_currency,
          owed: 0,
          paid: 0,
          owedCount: 0,
          paidCount: 0,
        };
        if (row.paid_at) {
          at.paid += Number(row.awarded_amount);
          at.paidCount += 1;
        } else {
          at.owed += Number(row.awarded_amount);
          at.owedCount += 1;
        }
        byCurrency.set(row.awarded_currency, at);
      }

      // Most owed first: the figure somebody is waiting on leads.
      return [...byCurrency.values()].sort((a, b) => b.owed + b.paid - (a.owed + a.paid));
    },
  });

  /*
   * ITS OWN CHANNEL NAME, and deliberately NOT the contests screen's
   * `creator-contest-entries:<id>`. That one binds three tables; this binds
   * one, and `joinChannel` refuses to let two different binding sets share a
   * name, loudly, in development. It is right to: a caller joining a name
   * expecting only awards would silently be woken by submissions too.
   *
   * The two do overlap on `contest_awards`, so a creator with the home screen
   * and the contests screen open holds two subscriptions to it. That is the
   * honest cost of the two hooks wanting different things, and it is two
   * bindings rather than two sockets' worth of anything a creator can feel.
   *
   * Filtered to their own id, which is load bearing rather than tidiness:
   * postgres_changes does not apply row security to DELETE events.
   */
  useEffect(() => {
    if (!user?.id) return;

    return joinChannel(
      `contest-awards:${user.id}`,
      [{ table: 'contest_awards', filter: `creator_id=eq.${user.id}` }],
      () => {
        void queryClient.invalidateQueries({ queryKey: ['creator', 'contest-earnings'] });
      }
    );
  }, [user?.id, queryClient]);

  return query;
}
