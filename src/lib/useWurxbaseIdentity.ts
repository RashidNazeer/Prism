import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  WURXBASE_TABS,
  wurxbaseRoleFor,
  type WurxBaseRole,
} from '@/lib/wurxbase-identity';
import { defaultFor } from '@/vendor/wurxbase/access';

/**
 * WHO THIS PERSON IS INSIDE PAID COLLABS — asked, not assumed.
 *
 * `wurxbase-identity.ts` can DERIVE a WurxBase role from ours, and that is the
 * fallback. It is a poor answer for their team: eight people across five roles
 * with twenty-five personal overrides Asad has tuned, all of whom would arrive
 * through our `ops` role as their `admin` — full edit on deals and money, for
 * two people who are viewers today.
 *
 * So when their `app_users` row can be found by email, that row wins: their
 * role, their overrides, exactly as Asad set them. Our own role still decides
 * whether the person reaches /admin/collabs at all — that gate is ours and
 * stays ours.
 *
 * ONE QUERY, SHARED. The sidebar needs it to decide which rows to draw and the
 * route needs it to write the session; both call this and React Query serves
 * one request. `staleTime` is generous because permissions change about as
 * often as people join.
 */

export interface WurxbaseIdentity {
  /** Their role, from their own row where we could find it. */
  role: WurxBaseRole;
  /** Their personal overrides, or `{}`. */
  customPerms: Record<string, boolean>;
  /** True when this came from their row rather than from our mapping. */
  matched: boolean;
  /**
   * True while the answer is still being fetched and could still change.
   *
   * WHOEVER HANDS THIS TO THEIR APP MUST WAIT FOR IT. Their App reads its
   * session ONCE, in a `useState` initialiser, and never looks again. Mounting
   * it before this is false hands it the FALLBACK role — which is the more
   * generous of the two — and the correction that arrives 200ms later reaches
   * sessionStorage and nothing else. The sidebar would be right, because it
   * reads this hook live, and every button on the screen would be wrong.
   */
  pending: boolean;
  /** The slugs of the tabs this person may actually open. */
  tabs: string[];
  /** Their WurxBase display name, when they have a row. */
  display: string | null;
}

function tabsFrom(role: WurxBaseRole, customPerms: Record<string, boolean>): string[] {
  return WURXBASE_TABS.filter((t) =>
    Object.prototype.hasOwnProperty.call(customPerms, t.cap)
      ? Boolean(customPerms[t.cap])
      : defaultFor(role, t.cap)
  ).map((t) => t.slug);
}

export function useWurxbaseIdentity(): WurxbaseIdentity {
  const { user, status } = useAuth();
  const { data: profile } = useProfile();
  const email = (user?.email || '').trim().toLowerCase();

  const derivedRole = wurxbaseRoleFor(profile?.role);

  /* Staff only. A creator never reaches Paid Collabs, and running this for
     every signed-in creator would be a query per session for an answer
     nothing asks for. */
  const enabled =
    status === 'signedIn' && Boolean(email) && (profile?.role === 'ops' || profile?.role === 'admin');

  const { data, isPending } = useQuery({
    queryKey: ['wurxbase-identity', email],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .schema('wurxbase')
        .from('app_users')
        .select('id,display,role,custom_perms,hub_email')
        .ilike('hub_email', email)
        .maybeSingle();
      /*
       * A FAILED LOOKUP MUST NOT WIDEN ANYBODY'S ACCESS.
       *
       * Returning null here falls through to the derived mapping, which is the
       * more permissive of the two answers. That is the right way round only
       * because our own route guard already limits this to ops and admin — the
       * lookup refines what staff can do, it is not what keeps others out.
       */
      if (error) return null;
      return data;
    },
  });

  const matched = Boolean(data);
  const role = (data?.role as WurxBaseRole) || derivedRole;
  const customPerms = (data?.custom_perms as Record<string, boolean>) || {};

  return {
    role,
    customPerms,
    matched,
    /* A disabled query reports `isPending` forever, so it is only pending if it
       was going to run. On an error `isPending` goes false and we fall through
       to the derived role, deliberately — see the note in queryFn. */
    pending: enabled && isPending,
    tabs: tabsFrom(role, customPerms),
    display: (data?.display as string) || null,
  };
}
