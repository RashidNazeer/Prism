import { defaultFor } from '@/vendor/wurxbase/access';
import type { AppRole } from '@/lib/auth/auth-context';

/**
 * WHO OUR ADMIN IS INSIDE PAID COLLABS.
 *
 * Rashid, 2026-08-28: *"when admin is already in app no need of signin
 * obviously so remove it"*. He is right, and it was never a security boundary
 * anyway — WurxBase checked a password against a plaintext column in a table
 * anyone holding the browser key could read. The real boundary is our own
 * sign-in and the RLS on the `wurxbase` schema underneath it.
 *
 * So the second login goes. This module is what replaces it: it decides which
 * WurxBase role a person carries, derived from the role they already signed in
 * with, in one place that both the route and the sidebar read.
 *
 * WHY A MAPPING AND NOT "EVERYONE IS SUPERADMIN". Their capability model is
 * client-side and always was, but it still decides what is on screen, and
 * Rashid's answer about the tabs was *"i don't want any leak"*. Handing every
 * staff member God Mode, user management and hard delete because it was
 * convenient is the opposite of that. Ops get the working roles; only an admin
 * gets the keys.
 */

/** Their role names. Not ours: `admin` means something narrower over there. */
export type WurxBaseRole = 'superadmin' | 'ipc' | 'admin' | 'apc' | 'viewer' | 'client';

/**
 * Our role in, theirs out.
 *
 * `admin`  -> `superadmin`  everything, including God Mode and user management
 * `ops`    -> `admin`       every tab and every day-to-day action, but no God
 *                           Mode, no managing users, no hard delete
 *
 * Nobody else reaches /admin/collabs at all: the route sits behind
 * `RequireAuth allow={['ops','admin']}`. The remaining entries exist so this
 * function is total rather than throwing on a role that cannot get here.
 */
const ROLE_MAP: Record<AppRole, WurxBaseRole> = {
  admin: 'superadmin',
  ops: 'admin',
  creator: 'viewer',
  applicant: 'viewer',
  /* Creative strategists get scoped brand access elsewhere in the product and
     are not on the allow-list for this route, so they never reach it. Mapped
     to the weakest role rather than left out, so this stays total. */
  creative_strategist: 'viewer',
};

export function wurxbaseRoleFor(role: AppRole | undefined): WurxBaseRole {
  return (role && ROLE_MAP[role]) || 'viewer';
}

/** The six tabs, in the order the sidebar lists them, with the capability
 *  each one is gated by inside their app. */
export const WURXBASE_TABS = [
  { slug: 'brands', cap: 'tabBrands' },
  { slug: 'creators', cap: 'tabCreators' },
  { slug: 'performance', cap: 'tabPerformance' },
  { slug: 'reporting', cap: 'tabReporting' },
  { slug: 'leaderboard', cap: 'tabLeaderboard' },
  { slug: 'discovery', cap: 'tabDiscovery' },
] as const;

/**
 * Which of the six a role may actually open.
 *
 * The sidebar uses this to decide which rows to draw. Before it did, all six
 * were offered to everybody and a person without the capability was silently
 * redirected to Brands — a menu row that lies about what it opens. Rashid:
 * *"if it was u remove it i dont want any leak"*.
 *
 * `defaultFor` is theirs, from `access.js`, and is a pure function over a role
 * and a capability key — no client, no network, nothing to isolate. This is the
 * direction the isolation rule allows: ours may read theirs.
 *
 * It does NOT account for per-person overrides in `app_users.custom_perms`, nor
 * for God Mode hiding a tab for the whole workspace. Both live in their
 * database and would make the sidebar depend on a fetch. The route still
 * redirects if a tab turns out to be unavailable, so those cases degrade to
 * what happened before rather than to something broken.
 */
export function wurxbaseTabsFor(role: AppRole | undefined): string[] {
  const wb = wurxbaseRoleFor(role);
  return WURXBASE_TABS.filter((t) => defaultFor(wb, t.cap)).map((t) => t.slug);
}

/**
 * The session object their app reads out of `sessionStorage`.
 *
 * Their `logActivity` writes `user_id` and `user_display` into every audit row,
 * so these two fields decide whose name is against every change made in Paid
 * Collabs from now on. It has to be the real person — an audit trail that says
 * "usman" for work five different people did is worse than none.
 */
export function wurxbaseSession(params: {
  id: string;
  displayName: string | null | undefined;
  email: string | null | undefined;
  role: AppRole | undefined;
}) {
  const display =
    (params.displayName || '').trim() || (params.email || '').split('@')[0] || 'Wurx staff';
  return {
    id: params.id,
    username: display,
    display,
    role: wurxbaseRoleFor(params.role),
    brand_access: [] as string[],
    custom_perms: {} as Record<string, boolean>,
  };
}
