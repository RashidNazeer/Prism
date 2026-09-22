/**
 * ============================================================================
 * THE WORDS ON THE PUBLIC WEBSITE PAGES. Edit here, not in the components.
 * ============================================================================
 *
 * WHY THESE PAGES EXIST. TikTok rejected the Display API app on 2026-09-15 with
 * one sentence about the site: "Your website URL cannot be a landing page or
 * login page. You must have an externally facing fully developed website ... A
 * valid official website that houses information about your web and services."
 * We had a single scrolling marketing page plus legal pages. This is the rest
 * of the website: who we are, what the hub does, how it works, and how to reach
 * a person.
 *
 * EVERY COMPANY FACT BELOW IS TAKEN FROM wurxmedia.com, the official site, on
 * 2026-09-22 — the address, the phone number, the email, the founders, the
 * headline figures. Our site and the official site must not tell a reviewer two
 * different stories. If the official site changes, change these with it.
 *
 * NOTHING HERE MAY OVERSTATE WHAT THE PRODUCT DOES. A reviewer reads these
 * pages next to the app itself, and a creator reads them before handing over a
 * TikTok connection. Where a claim is about the hub, it describes what is built
 * today, not the roadmap.
 */

/* ------------------------------------------------------------- company --- */

/** Wurx Media LLC, exactly as the official site states it. */
export const COMPANY = {
  legalName: 'Wurx Media LLC',
  tradingName: 'Wurx Media',
  product: 'Wurx Media Hub',
  address: '30 N Gould St #61420, Sheridan, WY 82801, USA',
  phone: '+1 (307) 430-1048',
  phoneHref: 'tel:+13074301048',
  email: 'rajil@wurxmedia.com',
  site: 'https://wurxmedia.com',
  founders: 'Rajil and Usman',
} as const;

/** The figures on wurxmedia.com. Ours to repeat, not to inflate. */
export const COMPANY_FACTS = [
  { value: '$100M+', label: 'GMV generated for brand partners' },
  { value: '50+', label: 'Brands at 7 and 8 figures' },
  { value: '1,000+', label: 'Vetted creators in the network' },
] as const;

/* ------------------------------------------------------ for creators ----- */

export const CREATOR_INTRO =
  'Wurx Media Hub is where the creators who post for our brands see their own numbers. Not an estimate, not a screenshot somebody sent you at the end of the month: the GMV your videos actually made, the commission on it, and the ad money we put behind your content.';

export const CREATOR_POINTS = [
  {
    title: 'Your real GMV, per video',
    body: 'Every video you post for a brand, with the revenue it generated and the items it sold. The same figures we work from, on the same screen we use.',
  },
  {
    title: 'What you earned, and where it stands',
    body: 'Each deal states the fee and how many videos it covers. The hub shows what is delivered, what is outstanding and what has been paid.',
  },
  {
    title: 'The ad spend behind your videos',
    body: 'When we put paid spend behind a video of yours, you can see it. Most creators never find out which of their videos a brand amplified.',
  },
  {
    title: 'One login for every brand',
    body: 'Work with four of our brands and there are still one set of details to remember. Each brand has its own hub, in that brand’s colours.',
  },
  {
    title: 'Briefs, contests and leaderboards',
    body: 'What a brand wants from a video, the contests running this month with their prizes, and where you stand against other creators on the same brand.',
  },
  {
    title: 'Offers made to you',
    body: 'Retainers and one-off deals arrive in the hub with the rate and the number of videos written down, so nothing about the money lives only in a DM.',
  },
] as const;

/** What we will never do with a creator's account. Plain, and all true today. */
export const CREATOR_PROMISES = [
  'We never post from your account. Nothing in the hub can publish, delete or edit anything on TikTok.',
  'Connecting TikTok is optional, and it is read-only. It shows your own video figures to you and to our staff, and you can disconnect it whenever you like.',
  'You keep your account. You own your videos, your following and your other brand deals.',
  'We do not sell creator data to anyone.',
] as const;

/* -------------------------------------------------------- for brands ----- */

export const BRAND_INTRO =
  'Wurx Media runs TikTok Shop creator programmes for 7 and 8 figure brands. The hub is the machinery behind that work: the creator roster, the briefs, the contests, and the numbers that say which creator and which video actually produced revenue.';

export const BRAND_POINTS = [
  {
    title: 'A creator roster, not a spreadsheet',
    body: 'Every creator on your brand, their deal, the videos committed and delivered, and what each one has generated.',
  },
  {
    title: 'Per-video revenue and ad spend',
    body: 'Revenue, items sold and views per video, with the GMV Max spend behind it, so cost per video is a fact rather than an argument.',
  },
  {
    title: 'Budget you can see being spent',
    body: 'Budget, allocated, paid and remaining for the month, per brand, with cost per video alongside.',
  },
  {
    title: 'Briefs and contests that reach creators',
    body: 'What you want made, and the incentives to get it made, delivered to the creators working on your brand instead of to a group chat.',
  },
  {
    title: 'A read-only link for your team',
    body: 'Share your brand’s numbers with someone who has no account here. They see the work, never your ad spend or ROI, and the link can be stopped at any time.',
  },
] as const;

/* ------------------------------------------------------ how it works ----- */

export const CREATOR_JOURNEY = [
  {
    n: '01',
    title: 'Apply',
    body: 'One short application with your TikTok handle and how to reach you. You do not need an invitation, and there is nothing to pay, ever.',
  },
  {
    n: '02',
    title: 'We review it',
    body: 'We look at your account and the brands we are hiring for that month. If it is a fit, you are approved and you get a login.',
  },
  {
    n: '03',
    title: 'You get a brand hub',
    body: 'Each brand you are hired for opens its own hub: the brief, the products, the contests running, and the other creators on the leaderboard.',
  },
  {
    n: '04',
    title: 'You post, and you see the numbers',
    body: 'Post to your own account as you normally would. Your videos, their GMV, their views and the commission on them appear in the hub.',
  },
  {
    n: '05',
    title: 'You get paid on the deal you agreed',
    body: 'Every deal names the fee and the number of videos. The hub shows what is delivered and what has been paid, so the state of it is never a guess.',
  },
] as const;

/* ---------------------------------------------------------------- FAQ ---- */

export const FAQ = [
  {
    q: 'Who can apply?',
    a: 'Any TikTok creator who wants to post for the brands we work with. We look at every application, and we are honest when a brand is not a fit — we would rather tell you than leave you waiting.',
  },
  {
    q: 'Does it cost anything?',
    a: 'No. The hub is free for creators. We never charge a creator a fee, and we never take a cut of a payment for access to it.',
  },
  {
    q: 'Do I have to connect my TikTok account?',
    a: 'No. You can use the hub without connecting TikTok. Connecting it lets the hub show your own video figures alongside the brand’s, and you can disconnect at any time from your profile page.',
  },
  {
    q: 'What does connecting TikTok let you do?',
    a: 'It is read-only. We can read your public profile and the list of your own videos with their views, likes, comments and shares. We cannot post, delete or change anything, and we cannot see your messages. The full explanation is on our Connecting TikTok page.',
  },
  {
    q: 'Who can see my numbers?',
    a: 'You, and Wurx staff working on the brands you are hired for. Other creators see your name and figures on a leaderboard only where the brand runs one, and never your contact details or payment information.',
  },
  {
    q: 'Where do the GMV figures come from?',
    a: 'From the brand’s own TikTok Shop reporting for the videos you posted for them, and the ad spend from the brand’s TikTok ad account. They are the same figures our own team works from.',
  },
  {
    q: 'How and when do I get paid?',
    a: 'On the deal you agreed with us before you posted: a fee for an agreed number of videos, or a retainer. Payments are made by Wurx Media, and the hub shows each deal as delivered and paid so you can see where yours stands.',
  },
  {
    q: 'Can I work with other brands at the same time?',
    a: 'Yes. Your account is yours. A deal covers the videos it names, not your whole calendar.',
  },
  {
    q: 'How do I delete my account or my data?',
    a: 'Write to us and we will delete it. Our Privacy page says exactly what we hold and how to ask.',
  },
] as const;
