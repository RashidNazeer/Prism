import {
  Award,
  Building2,
  Gift,
  HandCoins,
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
  Plug,
  UserRound,
  Users,
  Video,
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
    // Its own group, the same shape as Offers and for the same reason. It is
    // NOT only a tab inside a brand: "what is running" and "who is waiting on
    // me" are asked across every brand at once, and making somebody walk into a
    // brand to find out was the wrong shape.
    //
    // CLAIMS AND REWARDS LEFT THIS LIST ON 2026-08-15, at Rashid's request, and
    // became tabs in the Contests page header instead. His reasoning, and it is
    // right: three sidebar rows for one subject spends the menu on something
    // the page can carry itself, and the three screens are one job read three
    // ways rather than three places to go.
    //
    // They are still routes, still linked, still reachable directly. Nothing
    // was removed except three rows of chrome.
    label: 'Contests',
    items: [
      {
        label: 'Contests',
        icon: Trophy,
        to: '/admin/contests',
        // The tabs live under /admin/contests/*, so the sidebar row has to stay
        // lit while somebody is on Claims or Rewards.
        activePrefixes: ['/admin/contests'],
      },
    ],
  },
  {
    label: 'Content',
    items: [{ label: 'Content', icon: Video, to: '/admin/content' }],
  },
  {
    label: 'People',
    items: [
      {
        label: 'Creators',
        icon: Users,
        to: '/admin/creators',
        activePrefixes: ['/admin/creators'],
      },
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
    // Not "Step 7": that step shipped on 2026-08-11 and was the creator
    // screens. A badge naming a step that has already landed reads as a broken
    // promise, so unbuilt items say when rather than which number.
    items: [
      // The TikTok ad connection and the brand matching. Named for what it is
      // to an admin, not for the protocol underneath: nobody manages "an OAuth
      // integration", they connect TikTok.
      { label: 'TikTok', icon: Plug, to: '/admin/tiktok' },
      /*
       * WurxBase, brought in whole and unchanged. STAFF ONLY, and it is in the
       * ADMIN list alone: no creator nav mentions it and no creator route
       * reaches it. It carries brand budgets and creator payment details, so
       * that is not a preference.
       */
      { label: 'Paid Collabs', icon: HandCoins, to: '/admin/collabs' },
      { label: 'Uploads', icon: Upload, soon: 'Later' },
    ],
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
      { label: 'My numbers', icon: TrendingUp, to: '/app/numbers' },
      {
        label: 'Brand hubs',
        icon: Store,
        to: '/app/brands',
        activePrefixes: ['/app/brands'],
      },
      { label: 'Leaderboards', icon: Trophy, soon: 'Step 9' },
      { label: 'Offers', icon: Gift, to: '/app/offers' },
      { label: 'Contests', icon: Award, to: '/app/contests' },
      { label: 'My content', icon: Video, to: '/app/content' },
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
const LOCKED_UNTIL_APPROVED = [
  '/app/brands',
  '/app/offers',
  '/app/contests',
  '/app/content',
];

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

/**
 * WHICH SECTION AM I IN, in the words the menu already uses.
 *
 * Added 2026-08-16. The top bar now names the section instead of every screen
 * repeating its own title in a heading and a description underneath it, which
 * cost roughly 120px before any work appeared. Rashid asked for exactly that:
 * the section name, underlined, in the bar, and the two rows below it gone.
 *
 * It reads the SAME list the sidebar draws, so the bar and the lit menu row can
 * never disagree. A screen that needs a different word passes `title` to
 * `PageChrome`; a record screen keeps its own name in the body, because the bar
 * says which section you are in, not which record you have open.
 *
 * The longest prefix wins, so `/admin/offers/requests` resolves to Requests
 * rather than to All offers, which also matches which row the sidebar lights.
 */
export function sectionTitleFor(role: AppRole | undefined, pathname: string): string | null {
  let best: { label: string; score: number } | null = null;

  for (const group of navForRole(role)) {
    for (const item of group.items) {
      if (!isNavItemActive(item, pathname)) continue;
      // Score by how much of the path the match accounts for. An exact hit on a
      // long route beats a prefix hit on a short one.
      const candidates = [item.to ?? '', ...(item.activePrefixes ?? [])];
      const score = Math.max(
        ...candidates.map((c) =>
          c && (pathname === c || pathname.startsWith(`${c}/`)) ? c.length : 0
        )
      );
      if (!best || score > best.score) best = { label: item.label, score };
    }
  }

  return best?.label ?? null;
}
