import {
  Award,
  BarChart3,
  Building2,
  Compass,
  FileBarChart,
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
import { wurxbaseTabsFor } from '@/lib/wurxbase-identity';

/** The heading the Paid Collabs rows sit under. Named once so the group and the
 *  filter that prunes it cannot drift apart. */
const COLLABS_GROUP = 'Paid Collabs';

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
  /**
   * One line the TOP BAR says beside the section name.
   *
   * Rashid, looking at the creator Contests screen: "write this everything.
   * line in header and remove Contests ... as we did in admin side to reduce
   * the space".
   *
   * It lives here rather than in the screen for the same reason the title
   * does: a screen that draws its own heading repeats the lit menu row a few
   * pixels lower and pushes the actual work down the page. One definition,
   * sitting next to the label it appears beside, so the two cannot disagree.
   *
   * KEEP IT SHORT. It shares a 3.5rem bar with the section name, and it is
   * hidden below `md`, where there is no room and the name alone is the answer.
   */
  description?: string;
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
      // Read when something needs explaining, not when something needs
      // deciding, which is why it is here and not with the queues.
      { label: 'Activity', icon: History, to: '/admin/activity' },
      { label: 'Uploads', icon: Upload, soon: 'Later' },
    ],
  },
  {
    /*
     * PAID COLLABS IS A SECTION NOW, not one row that opens an app with its own
     * tabs inside it.
     *
     * Rashid, 2026-08-28, looking at the six pills across the top of the
     * embedded screen: *"pull them out and create new menus item on main menu
     * as Paid Collabs and put all these tabs there as menu item section we will
     * navigate from there so we need to remove those tabs from top... i want to
     * give it native look of our own app now"*.
     *
     * A heading over six links earns its row by the rule at the top of this
     * file, and it removes a whole second navigation system from the product:
     * before this, finding Reporting meant knowing that Paid Collabs was a row
     * in Data that opened something with a tab rail of its own.
     *
     * THE NAMES ARE THEIRS, deliberately. "Creators" and "Brands" already
     * appear elsewhere in this menu meaning our own creators and our own brand
     * hubs, and these are neither — they are the paid-deal tracker's. The
     * heading is what tells them apart, which is exactly what a heading is for,
     * and renaming them would break the one thing every person using that
     * screen already knows.
     *
     * STAFF ONLY, and in the ADMIN list alone: no creator nav mentions these
     * and no creator route reaches them. They carry brand budgets and creator
     * payment details, so that is not a preference.
     */
    label: COLLABS_GROUP,
    items: [
      { label: 'Brands', icon: HandCoins, to: '/admin/collabs/brands' },
      { label: 'Creators', icon: Users, to: '/admin/collabs/creators' },
      { label: 'Performance', icon: BarChart3, to: '/admin/collabs/performance' },
      {
        label: 'Reporting',
        icon: FileBarChart,
        to: '/admin/collabs/reporting',
        // Creative angle testing is a sub-tab of Reporting, so the row stays
        // lit while somebody is inside it.
        activePrefixes: ['/admin/collabs/reporting'],
      },
      { label: 'Leaderboard', icon: Award, to: '/admin/collabs/leaderboard' },
      { label: 'Discovery', icon: Compass, to: '/admin/collabs/discovery' },
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
      {
        label: 'Offers',
        icon: Gift,
        to: '/app/offers',
        description: 'Everything on the table, from every brand you work with.',
      },
      {
        label: 'Contests',
        icon: Award,
        to: '/app/contests',
        description: 'Everything running right now, from every brand you work with.',
      },
      {
        label: 'My content',
        icon: Video,
        to: '/app/content',
        description: 'Every video you have filmed for us, and what is still to come.',
      },
    ],
  },
  {
    label: '',
    items: [
      {
        label: 'My profile',
        icon: UserRound,
        to: '/app/profile',
        description: 'Only your name is yours to change; the rest is set by the Wurx team.',
      },
    ],
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
  /*
   * A MENU ROW MUST NOT LIE ABOUT WHAT IT OPENS.
   *
   * Rashid, asked whether to hide Paid Collabs rows a person cannot open:
   * *"if it was u remove it i dont want any leak"*.
   *
   * The six tabs became six rows on 2026-08-28, and rows are drawn from this
   * static list while the tab a person may actually open is decided by their
   * WurxBase capability. All six were offered to everybody, and clicking one
   * you lacked bounced you to Brands with no explanation. Before the move the
   * row simply was not in the rail, which is the behaviour restored here.
   */
  if (role === 'admin' || role === 'ops') return withCollabTabs(ADMIN, role);
  if (role === 'creative_strategist') return STUDIO;
  if (role === 'creator') return CREATOR;
  return APPLICANT;
}

/**
 * Drop the Paid Collabs rows this person cannot open, and the heading with them
 * if none survive.
 *
 * The six tabs are drawn from a static list here, while WHICH of them opens is
 * decided by the person's WurxBase capability. Offering all six to everybody
 * meant clicking one you lacked bounced you to Brands with no explanation —
 * a menu row lying about what it opens. Before the tabs moved into this sidebar
 * the row simply was not in their rail, which is the behaviour restored here.
 *
 * A cheap identity map when nothing is filtered, so the common case allocates
 * nothing and the array stays reference-stable for anything memoising on it.
 */
function withCollabTabs(groups: NavGroup[], role: AppRole | undefined): NavGroup[] {
  const allowed = new Set(wurxbaseTabsFor(role));
  const slug = (to: string | undefined) => (to ?? '').replace('/admin/collabs/', '');

  let changed = false;
  const out = groups
    .map((group) => {
      if (group.label !== COLLABS_GROUP) return group;
      const items = group.items.filter((item) => allowed.has(slug(item.to)));
      if (items.length === group.items.length) return group;
      changed = true;
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);

  return changed || out.length !== groups.length ? out : groups;
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

/**
 * The line the top bar says beside the section name, when that section has one.
 *
 * Resolved by exactly the same longest-prefix rule as `sectionTitleFor`, so the
 * name and the line beside it always come from the SAME nav item. Resolving
 * them separately is how a screen ends up captioned with a neighbour's
 * sentence.
 */
export function sectionDescriptionFor(
  role: AppRole | undefined,
  pathname: string
): string | null {
  let best: { description: string | undefined; score: number } | null = null;

  for (const group of navForRole(role)) {
    for (const item of group.items) {
      if (!isNavItemActive(item, pathname)) continue;
      const candidates = [item.to ?? '', ...(item.activePrefixes ?? [])];
      const score = Math.max(
        ...candidates.map((c) =>
          c && (pathname === c || pathname.startsWith(`${c}/`)) ? c.length : 0
        )
      );
      if (!best || score > best.score) best = { description: item.description, score };
    }
  }

  return best?.description ?? null;
}
