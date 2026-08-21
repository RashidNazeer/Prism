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

/**
 * A GROUP HEADING HAS TO EARN ITS ROW, and until 2026-08-21 none of these did.
 *
 * Rashid: *"the menu bar is very borign too much gap between and too many
 * sections modify it"*. He was looking at EIGHT headings above twelve links —
 * Overview, Review, Offers, Contests, Content, People, Brands, Data — five of
 * which sat over a single item. A heading over one link is not navigation, it
 * is the same word twice with a gap around it, and eight of them turned a
 * twelve-item menu into a twenty-item scroll.
 *
 * TWO RULES NOW, and they are the whole of it:
 *
 *   1. No heading over fewer than two items.
 *   2. The first group has no heading at all. Dashboard is where you land; it
 *      does not need to be told it is an overview.
 *
 * The four that remain are grouped by the QUESTION being asked rather than by
 * the table underneath, which is why Content moved in beside Applications and
 * Requests — all three are "who is waiting on me" — and why Activity moved out
 * of Review, which it never was: it is the audit log, and it is read when
 * something needs explaining rather than decided on.
 */
const ADMIN: NavGroup[] = [
  {
    label: '',
    items: [{ label: 'Dashboard', icon: LayoutDashboard, to: '/admin' }],
  },
  {
    // The three queues, and they are one job asked three ways. All three are
    // card grids as of 2026-08-21 and they read as a set now, which is most of
    // the argument for them sitting together.
    label: 'Waiting on you',
    items: [
      {
        label: 'Applications',
        icon: Inbox,
        to: '/admin/applications',
        activePrefixes: ['/admin/applications'],
      },
      { label: 'Requests', icon: Handshake, to: '/admin/offers/requests' },
      { label: 'Content', icon: Video, to: '/admin/content' },
    ],
  },
  {
    /*
     * What we are running, across every brand. Offers and Contests are here
     * rather than in groups of their own for the reason Rashid gave when Claims
     * and Rewards left this list on 2026-08-15: rows of chrome for one subject
     * spend the menu on something the page can carry itself.
     *
     * `/admin/offers/requests` is NOT a child row under All offers. It is a
     * queue, it lives with the other queues, and `sectionTitleFor` resolves it
     * by longest prefix so the top bar still says Requests.
     */
    label: 'Running',
    items: [
      { label: 'All offers', icon: Tag, to: '/admin/offers' },
      {
        label: 'Contests',
        icon: Trophy,
        to: '/admin/contests',
        // The tabs live under /admin/contests/*, so the row has to stay lit
        // while somebody is on Claims or Rewards.
        activePrefixes: ['/admin/contests'],
      },
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
    // Not "Step 7": that step shipped on 2026-08-11 and was the creator
    // screens. A badge naming a step that has already landed reads as a broken
    // promise, so unbuilt items say when rather than which number.
    label: 'Data',
    items: [
      // Named for what it is to an admin, not for the protocol underneath:
      // nobody manages "an OAuth integration", they connect TikTok.
      { label: 'TikTok', icon: Plug, to: '/admin/tiktok' },
      /*
       * WurxBase, brought in whole and unchanged. STAFF ONLY, and it is in the
       * ADMIN list alone: no creator nav mentions it and no creator route
       * reaches it. It carries brand budgets and creator payment details, so
       * that is not a preference.
       */
      { label: 'Paid Collabs', icon: HandCoins, to: '/admin/collabs' },
      // Read when something needs explaining, not when something needs
      // deciding, which is why it is here and not with the queues.
      { label: 'Activity', icon: History, to: '/admin/activity' },
      { label: 'Uploads', icon: Upload, soon: 'Later' },
    ],
  },
];

// Same two rules as ADMIN: no heading over one item, and none over the landing
// screen. "Overview" sat above Home and "Account" above My profile, which is
// two headings for two links.
const CREATOR: NavGroup[] = [
  {
    label: '',
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
      { label: 'Leaderboards', icon: Trophy, to: '/app/leaderboards' },
      { label: 'Offers', icon: Gift, to: '/app/offers' },
      { label: 'Contests', icon: Award, to: '/app/contests' },
      { label: 'My content', icon: Video, to: '/app/content' },
    ],
  },
  {
    label: '',
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
    label: '',
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
