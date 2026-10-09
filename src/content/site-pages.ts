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
 * 2026-09-22 â€” the address, the phone number, the email, the founders, the
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
  product: 'Prism',
  address: '30 N Gould St #61420, Sheridan, WY 82801, USA',
  phone: '+1 (307) 430-1048',
  phoneHref: 'tel:+13074301048',
  email: 'rajil@wurxmedia.com',
  site: 'https://wurxmedia.com',
  founders: 'Rajil and Usman',
  /** Their own line, at the foot of every page of wurxmedia.com. */
  tagline: 'The TikTok Shop growth partner for ambitious DTC brands.',
} as const;

/** The figures on wurxmedia.com. Ours to repeat, not to inflate. */
export const COMPANY_FACTS = [
  { value: '$100M+', label: 'GMV generated for brand partners' },
  { value: '50+', label: 'Brands at 7 and 8 figures' },
  { value: '1,000+', label: 'Creators in the network' },
  { value: '2B+', label: 'Views on creator content' },
] as const;

/**
 * The six services, from wurxmedia.com/content, "Our Services · One connected
 * team". Condensed, and nothing added: a reviewer asked for "information about
 * our web and services", and the brands reading this page are buying these.
 *
 * TWO OF THEM ARE WHAT THIS HUB IS. "Paid Collaborations" is the deal a creator
 * signs here, and "Creator Community" is the Brand Hub itself â€” which is why
 * the hub is not sold separately and this page does not price it.
 */
export const SERVICES = [
  {
    title: 'Shop Management',
    body: 'The day-to-day operation of a TikTok Shop: listings, pricing, promotions, inventory sync and compliance â€” the layer that decides whether the traffic content earns actually converts.',
  },
  {
    title: 'Affiliate Program',
    body: 'Recruiting, onboarding and managing affiliates at scale, with the commission structures and retention flows that keep them posting.',
  },
  {
    title: 'Paid Collaborations',
    body: 'Flat-fee campaigns with hand-picked creators, for guaranteed output against a specific angle rather than waiting on organic affiliate volume. This is the deal a creator signs in the hub.',
  },
  {
    title: 'Paid Media',
    body: 'GMV Max campaigns run with budget pacing and creative rotation, and the judgement to kill or scale a piece of content. This is the ad spend a creator sees behind their own videos.',
  },
  {
    title: 'Creator Community',
    body: 'A private community per brand, with the incentives and coaching that keep creators posting past month two. The Brand Hub is where it lives.',
  },
  {
    title: 'Meta Creative Pipeline',
    body: 'The TikTok content that wins is repurposed into Meta ad creative, so one production budget feeds two channels.',
  },
] as const;

/** Case studies as wurxmedia.com states them. Figures theirs, not rounded up. */
export const RESULTS = [
  { value: '$12.7M', label: 'Cutler Nutrition, TikTok Shop GMV in 12 months' },
  { value: '3,144%', label: 'M3 Naturals, monthly GMV growth in 6 months' },
  { value: '$5.5M+', label: 'BrüMate, GMV generated, #1 in Drinkware' },
  { value: '213%', label: 'Inno Supps, off-site GMV lift from TikTok Shop content' },
] as const;

/* ------------------------------------------------------ for creators ----- */

export const CREATOR_INTRO =
  'Prism is where the creators who post for our brands see their own numbers. Not an estimate, not a screenshot somebody sent you at the end of the month: the GMV your videos actually made, the commission on it, and the ad money we put behind your content.';

/**
 * What working with Wurx is actually like, from wurxmedia.com/content: a brief
 * and a sample rather than a cold DM, a private community per brand with
 * coaching in it, and ad rights agreed at the brief stage.
 *
 * THE AD RIGHTS LINE IS A DISCLOSURE, not a selling point, and it stays in
 * plain words. A creator is entitled to know before they post that their video
 * may be run as an advert.
 */
export const CREATOR_WORKING = [
  {
    title: 'A brief and a sample, not a cold DM',
    body: 'Before you film, you get the angle the brand is testing, what to say and what to avoid, and the product itself where the brand is sending samples.',
  },
  {
    title: 'A community for each brand, with coaching in it',
    body: 'Every creator on a brand goes into that brandâ€™s hub together: the brief, the contests, the leaderboard and our team, rather than a group chat that goes quiet in week three.',
  },
  {
    title: 'Your best video may be run as an advert',
    body: 'We agree ad rights at the brief stage, so a video that performs can be put behind paid spend instead of dying in the feed. You can see that spend in the hub, on your own video.',
  },
  {
    title: 'Paid on the deal, from the brandâ€™s budget',
    body: 'A paid collaboration is a flat fee for an agreed number of videos. Wurx pays you; the money comes out of the brandâ€™s campaign budget, which is why the hub tracks both.',
  },
] as const;

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
    body: 'Work with four of our brands and there are still one set of details to remember. Each brand has its own hub, in that brandâ€™s colours.',
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
  'Wurx Media is a full-service TikTok Shop agency: shop management, affiliate programmes, paid collaborations, GMV Max media, a creator community per brand, and the pipeline that turns winning TikTok content into Meta ad creative. Wurx Media Hub is the machinery behind the creator half of that â€” the roster, the briefs, the contests, and the numbers that say which creator and which video actually produced revenue.';

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
    body: 'Share your brandâ€™s numbers with someone who has no account here. They see the work, never your ad spend or ROI, and the link can be stopped at any time.',
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
    a: 'Any TikTok creator who wants to post for the brands we work with. There is no follower minimum written down: what we look at is your account, your niche and your videos against the brands hiring that month. We are honest when a brand is not a fit â€” we would rather tell you than leave you waiting.',
  },
  {
    q: 'Does it cost anything?',
    a: 'No. The hub is free for creators. We never charge a creator a fee, and we never take a cut of a payment for access to it.',
  },
  {
    q: 'Do I have to connect my TikTok account?',
    a: 'No. You can use the hub without connecting TikTok. Connecting it lets the hub show your own video figures alongside the brandâ€™s, and you can disconnect at any time from your profile page.',
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
    a: 'From the brandâ€™s own TikTok Shop reporting for the videos you posted for them, and the ad spend from the brandâ€™s TikTok ad account. They are the same figures our own team works from.',
  },
  {
    q: 'How and when do I get paid?',
    a: 'On the deal you agreed before you posted: a flat fee for an agreed number of videos, or a retainer. Wurx pays you, out of the brandâ€™s campaign budget, and the hub shows each deal as delivered and as paid so you can see where yours stands rather than asking.',
  },
  {
    q: 'Do I get the product?',
    a: 'Where a brand is sending samples, that is arranged with your deal before you film â€” sample flow is part of how we run a campaign, not an afterthought. The brief says what is coming and what the brand wants shown.',
  },
  {
    q: 'Can my video be used as an advert?',
    a: 'Yes, and we agree that at the brief stage rather than afterwards. A video that performs organically can be put behind paid spend, which is how a good video keeps earning instead of disappearing in a few days. The hub shows you the ad spend sitting behind your own videos.',
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
