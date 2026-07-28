/**
 * ============================================================================
 * MARKETING COPY AND NUMBERS — the only file to edit for landing page content.
 * ============================================================================
 * Everything a non-developer would want to change lives here: the headline
 * stats, the brand list, the three steps. No component hardcodes this text.
 */

/* ---------------------------------------------------------------- stats --- */

/** Headline numbers. Confirmed by Rashid on 2026-07-29. */
export const STATS = [
  { value: '100M+', label: 'Est. revenue generated' },
  { value: '5K+', label: 'Creators' },
  { value: '2B+', label: 'Views generated' },
] as const;

/* --------------------------------------------------------------- brands --- */

/**
 * ⚠️ PLACEHOLDER DATA — replace before this page is shown to anyone.
 *
 * These are NOT real partners. Rashid needs to supply the actual brand list.
 * Two ways to fill this in:
 *   1. Names only  -> set `name`, leave `logo` undefined. Renders as a clean
 *                     uppercase wordmark, which is how half of real logo rows
 *                     look anyway.
 *   2. Real logos  -> drop an SVG in src/assets/brands/ and set `logo` to the
 *                     imported URL. Monochrome SVGs theme themselves.
 */
export const BRAND_PLACEHOLDERS_NEED_REPLACING = true;

export interface BrandLogo {
  name: string;
  logo?: string;
}

export const BRANDS: BrandLogo[] = [
  { name: 'Brand One' },
  { name: 'Brand Two' },
  { name: 'Brand Three' },
  { name: 'Brand Four' },
  { name: 'Brand Five' },
  { name: 'Brand Six' },
];

/* ----------------------------------------------------------- how it works -- */

export const STEPS = [
  {
    n: '01',
    title: 'Apply',
    body: 'Tell us your handles, your niche and your best videos. Every application is read by a human — we keep the roster intentional, so this is not a sign-up button.',
  },
  {
    n: '02',
    title: 'Get matched',
    body: 'Approved creators are assigned a tier and let into the Brand Hubs that fit them. Samples, briefs and commission rates are waiting inside.',
  },
  {
    n: '03',
    title: 'Post and track',
    body: 'Film, post, and watch your real GMV land in your dashboard. Same numbers we see. No screenshots, no waiting on a reply.',
  },
] as const;

/* -------------------------------------------------------------- features -- */

export const FEATURES = [
  {
    icon: 'chart' as const,
    title: 'My Numbers',
    body: 'GMV, orders, commission earned and the ad spend sitting behind your own videos — per brand, updated daily, with the timestamp shown.',
  },
  {
    icon: 'trophy' as const,
    title: 'Live leaderboards',
    body: 'See exactly where you rank inside every brand hub. Totals only, and you can opt out whenever you want.',
  },
  {
    icon: 'target' as const,
    title: 'Contests and sprints',
    body: 'Tiered GMV sprints with real progress bars. Hit $1K, earn the bonus. No guessing how close you are.',
  },
  {
    icon: 'wallet' as const,
    title: 'Retainers and offers',
    body: 'Boosted commission tiers, pay-per-video slots and retainer openings — unlocked as your tier goes up.',
  },
  {
    icon: 'file' as const,
    title: 'Briefs that make sense',
    body: 'Hooks, angles, do and do-not lists, deadlines and sample requests. Everything a brand expects, in one place.',
  },
  {
    icon: 'users' as const,
    title: 'One login, every brand',
    body: 'Every brand you work with in a single hub, each themed as itself. Stop juggling group chats and spreadsheets.',
  },
] as const;
