import {
  Building2,
  Gift,
  History,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Store,
  TrendingUp,
  Trophy,
  Upload,
  Users,
} from 'lucide-react';
import type { AppRole } from '@/lib/auth/auth-context';

/**
 * The sidebar, in one place.
 *
 * The product is being built a step at a time, so most of what will eventually
 * live here does not exist yet. Those items are still listed, marked with the
 * step that brings them, and are not links. That is deliberate: the shape of
 * the finished product should be visible from the first screen, and an
 * applicant seeing "My numbers" greyed out understands what they are waiting
 * for. What we must never do is make them clickable and land someone on an
 * empty page.
 *
 * Adding a screen means moving one item from `soon` to `to`, here, and nowhere
 * else.
 */

export interface NavItem {
  label: string;
  icon: typeof Inbox;
  /** Present once the screen exists. Absent means not built yet. */
  to?: string;
  /** Which roadmap step brings it. Only shown when `to` is absent. */
  soon?: string;
  /**
   * Extra path prefixes that should still light this item up, so a detail
   * screen does not orphan the sidebar.
   */
  activePrefixes?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const ADMIN: NavGroup[] = [
  {
    label: 'Review',
    items: [
      {
        label: 'Applications',
        icon: Inbox,
        to: '/admin',
        activePrefixes: ['/admin/applications'],
      },
      { label: 'Activity', icon: History, to: '/admin/activity' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Creators', icon: Users, soon: 'Step 5' },
      { label: 'Team', icon: Building2, soon: 'Later' },
    ],
  },
  {
    label: 'Brands',
    items: [
      { label: 'Brand hubs', icon: Store, soon: 'Step 6' },
      { label: 'Campaigns', icon: Megaphone, soon: 'Step 6' },
    ],
  },
  {
    label: 'Data',
    items: [{ label: 'Uploads', icon: Upload, soon: 'Step 7' }],
  },
];

const CREATOR: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Home', icon: LayoutDashboard, to: '/app' }],
  },
  {
    label: 'Your work',
    items: [
      { label: 'My numbers', icon: TrendingUp, soon: 'Step 8' },
      { label: 'Brand hubs', icon: Store, soon: 'Step 6' },
      { label: 'Leaderboards', icon: Trophy, soon: 'Step 9' },
      { label: 'Offers', icon: Gift, soon: 'Step 10' },
    ],
  },
];

const STUDIO: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Home', icon: LayoutDashboard, to: '/studio' }],
  },
  {
    label: 'Your work',
    items: [
      { label: 'Briefs', icon: Megaphone, soon: 'Step 6' },
      { label: 'Creators', icon: Users, soon: 'Step 6' },
    ],
  },
];

export function navForRole(role: AppRole | undefined): NavGroup[] {
  if (role === 'admin' || role === 'ops') return ADMIN;
  if (role === 'creative_strategist') return STUDIO;
  return CREATOR;
}

/** True when this item is the screen currently on show. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (!item.to) return false;
  if (pathname === item.to) return true;
  return (item.activePrefixes ?? []).some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}
