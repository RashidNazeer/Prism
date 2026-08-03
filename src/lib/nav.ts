import {
  Building2,
  Gift,
  Handshake,
  History,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Store,
  Tag,
  TrendingUp,
  Trophy,
  Upload,
  UserRound,
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
    label: 'Overview',
    items: [{ label: 'Dashboard', icon: LayoutDashboard, to: '/admin' }],
  },
  {
    label: 'Review',
    items: [
      {
        label: 'Applications',
        icon: Inbox,
        to: '/admin/applications',
        activePrefixes: ['/admin/applications'],
      },
      { label: 'Activity', icon: History, to: '/admin/activity' },
    ],
  },
  {
    // Its own group, with the catalogue first and the queue under it. They are
    // different jobs: one is "what are we running", the other is "who is
    // waiting on me".
    label: 'Offers',
    items: [
      { label: 'All offers', icon: Tag, to: '/admin/offers' },
      { label: 'Requests', icon: Handshake, to: '/admin/offers/requests' },
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
      {
        label: 'Brand hubs',
        icon: Store,
        to: '/admin/brands',
        activePrefixes: ['/admin/brands'],
      },
      { label: 'Campaigns', icon: Megaphone, soon: 'Next' },
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
      {
        label: 'Brand hubs',
        icon: Store,
        to: '/app/brands',
        activePrefixes: ['/app/brands'],
      },
      { label: 'Leaderboards', icon: Trophy, soon: 'Step 9' },
      { label: 'Offers', icon: Gift, to: '/app/offers' },
    ],
  },
  {
    label: 'Account',
    items: [{ label: 'My profile', icon: UserRound, to: '/app/profile' }],
  },
];

/*
 * Somebody still in review sees the same shape, with the hub not yet a link.
 *
 * They CAN reach the screen by typing the address, and it tells them plainly
 * that it opens on approval. What we will not do is put a live-looking link in
 * front of somebody it does not work for yet.
 */
const LOCKED_UNTIL_APPROVED = ['/app/brands', '/app/offers'];

const APPLICANT: NavGroup[] = CREATOR.map((group) => ({
  ...group,
  items: group.items.map((item) =>
    item.to && LOCKED_UNTIL_APPROVED.includes(item.to)
      ? { label: item.label, icon: item.icon, soon: 'Once approved' }
      : item
  ),
}));

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
  if (role === 'creator') return CREATOR;
  return APPLICANT;
}

/** True when this item is the screen currently on show. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (!item.to) return false;
  if (pathname === item.to) return true;
  return (item.activePrefixes ?? []).some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}
