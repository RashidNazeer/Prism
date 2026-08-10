# UI brief, the creator experience after approval

**Paste everything below the line into the UI agent.** It is written to be read
by a design/UI generator, not by us. It carries the product context, the exact
design tokens, every screen and every state, the animation direction, and a
realistic dataset so the agent renders screens with data in them rather than
empty shells.

Scope: the creator side only, from the moment they are approved. Sign up,
application and review screens are deliberately out of scope.

---

# Brief: WurxMediaHub, the creator experience

You are designing and building the creator-facing UI for **WurxMediaHub**, a
private platform for TikTok Shop creators who work with the brands Wurx Media
runs. It is going to be a paid product, and the interface has to feel worth
paying for: modern, confident, animated, and quietly premium. Think Linear,
Vercel and Stripe's dashboards, in a warm gold-on-near-black brand.

## 1. What the product is, in one paragraph

Creators apply once. When Wurx approves them, they get into **Brand Hubs**:
one per brand, showing what the brand sells, what commission each product pays,
and what offers are on the table. A creator takes an offer, Wurx approves them
onto it, and from that moment the platform tracks the job through seven stages,
from "sample requested" all the way to "paid". **Transparency is the product.**
The single most important moment in the whole thing is a creator logging in and
seeing, without asking anyone, exactly what they have been paid, what is coming,
and where every piece of work has got to.

## 2. Who is looking at this

Full-time and part-time TikTok Shop creators in the US and UK. Most of them are
on a phone. They are used to TikTok's own creator tools, to Shopify Collabs and
to Amazon's influencer dashboard, and they are unimpressed by dashboards that
show numbers without meaning. They open this app to answer three questions:

1. **Have I been paid, and what is still coming?**
2. **What is happening with the work I already took?**
3. **What else can I take?**

Every screen should be judged on how fast it answers one of those.

## 3. The three moments to design for

- **First login after approval.** The screen has to land. This is the moment
  they find out the platform is honest with them about money.
- **A stage changing while they watch.** Updates arrive live over a websocket,
  with no refresh. When a stage advances on screen it should be felt, not just
  redrawn.
- **Deciding whether to take an offer.** The numbers on an offer card are the
  point. Everything else on the card is supporting cast.

## 4. What you are delivering

- React 19 + TypeScript, function components, presentational only.
- **Tailwind CSS v4** utilities. No CSS-in-JS, no styled-components.
- **Motion** (`motion/react`, the framer-motion successor) for all animation.
- **lucide-react** for icons. No other icon set.
- **No other dependencies.** Specifically: no chart library. Any chart is
  hand-built with SVG or divs. No date library, no UI kit, no carousel.
- **No data fetching, no routing library, no global state.** Every component
  takes its data through props. Ship one `mock-data.ts` in the shape given in
  section 11, and a tiny screen switcher so all screens can be viewed.
- Every screen rendered in **both themes** and at **375, 768, 1024 and 1440px**.
- Components split by screen, plus a `components/` folder for shared pieces.
  Keep them pure and props-driven; this code gets ported into a real app that
  supplies the data.

## 5. The design system, use exactly these values

Every colour is a CSS variable. **Never write a hex code in a component.** Use
Tailwind arbitrary values against the variables, for example
`bg-[var(--wx-surface-1)] text-[var(--wx-text-muted)] border-[var(--wx-border)]`.

Both themes are first-class. The theme is set with `data-theme="dark"` or
`data-theme="light"` on `<html>`. A value that exists in one mode must exist in
the other. Include a theme toggle in your demo.

```css
:root, [data-theme='dark'] {
  color-scheme: dark;
  --wx-bg: #0a0a0a;
  --wx-surface-1: #141414;
  --wx-surface-2: #1a1a1a;
  --wx-surface-3: #232320;

  --wx-text: #f5efe1;
  --wx-text-muted: #a59c8a;
  --wx-text-faint: #8a8478;
  --wx-text-inverse: #0a0a0a;

  --wx-border: #2a2825;
  --wx-border-strong: #3d3a34;
  --wx-border-interactive: #6e675c;

  --wx-accent: #c8924b;
  --wx-accent-hover: #d8a35e;
  --wx-accent-active: #b8823b;
  --wx-accent-soft: rgba(200, 146, 75, 0.14);
  --wx-accent-ring: rgba(200, 146, 75, 0.45);
  --wx-on-accent: #0a0a0a;

  --wx-success: #3ecf8e;
  --wx-success-soft: rgba(62, 207, 142, 0.14);
  --wx-danger: #f06a6a;
  --wx-danger-soft: rgba(240, 106, 106, 0.14);
  --wx-warning: #f0b429;
  --wx-warning-soft: rgba(240, 180, 41, 0.14);
  --wx-info: #5cb8e8;
  --wx-info-soft: rgba(92, 184, 232, 0.14);

  --wx-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.6);
  --wx-shadow-md: 0 4px 12px -2px rgb(0 0 0 / 0.7);
  --wx-shadow-lg: 0 16px 40px -12px rgb(0 0 0 / 0.85);
  --wx-glow: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(200,146,75,0.16) 0%, transparent 70%);
  --wx-grid-line: rgba(245, 239, 225, 0.04);
}

[data-theme='light'] {
  color-scheme: light;
  --wx-bg: #faf8f3;
  --wx-surface-1: #ffffff;
  --wx-surface-2: #f5efe1;
  --wx-surface-3: #efe8d8;

  --wx-text: #14120e;
  --wx-text-muted: #5f574c;
  --wx-text-faint: #786f62;
  --wx-text-inverse: #faf8f3;

  --wx-border: #e5ded0;
  --wx-border-strong: #d3c9b5;
  --wx-border-interactive: #948771;

  --wx-accent: #8a5f1f;
  --wx-accent-hover: #6f4c18;
  --wx-accent-active: #5c3f14;
  --wx-accent-soft: rgba(138, 95, 31, 0.10);
  --wx-accent-ring: rgba(138, 95, 31, 0.40);
  --wx-on-accent: #ffffff;

  --wx-success: #0f7a43;
  --wx-success-soft: rgba(15, 122, 67, 0.10);
  --wx-danger: #b02424;
  --wx-danger-soft: rgba(176, 36, 36, 0.10);
  --wx-warning: #8a6410;
  --wx-warning-soft: rgba(138, 100, 16, 0.10);
  --wx-info: #186d92;
  --wx-info-soft: rgba(24, 109, 146, 0.10);

  --wx-shadow-sm: 0 1px 2px 0 rgb(20 18 14 / 0.06);
  --wx-shadow-md: 0 4px 12px -2px rgb(20 18 14 / 0.10);
  --wx-shadow-lg: 0 16px 40px -12px rgb(20 18 14 / 0.18);
  --wx-glow: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(138,95,31,0.10) 0%, transparent 70%);
  --wx-grid-line: rgba(20, 18, 14, 0.05);
}

:root {
  --wx-font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --wx-font-display: 'Segoe UI Variable Display', 'SF Pro Display', system-ui, sans-serif;
  --wx-font-mono: ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', SFMono-Regular, Menlo, Consolas, monospace;

  --wx-radius-sm: 6px;  --wx-radius-md: 10px;  --wx-radius-lg: 16px;
  --wx-radius-xl: 24px; --wx-radius-pill: 999px;

  --wx-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --wx-dur-fast: 140ms; --wx-dur-base: 240ms; --wx-dur-slow: 420ms;
}
```

**Typography rules.** System fonts only, nothing downloaded. Character comes
from weight, size and tracking, not from a novelty typeface.

- Headings: `--wx-font-display`, 800 weight, tight tracking, fluid with `clamp()`.
- Body and UI: `--wx-font-sans`.
- **Every number and every small uppercase label uses `--wx-font-mono`** with
  tabular figures (`font-variant-numeric: tabular-nums`). This is the product's
  signature: money and counts always in mono, so they line up and read as data.
- Small labels: mono, 10 to 11px, uppercase, `letter-spacing: 0.14em`,
  `--wx-text-faint`.

**Two colour traps you must avoid.**

1. In light mode `--wx-accent` (#8a5f1f) and `--wx-warning` (#8a6410) are almost
   the same colour. **Never put both in one chart, bar or legend.** A bar using
   success / warning / accent reads as one solid block on paper.
2. Never encode meaning in colour alone. Every coloured state also carries an
   icon or a word.

For the money bar specifically, use **green (success) / gold (accent) / grey
(border-strong)**. That ramp also says something true: green is in your account,
gold is about to be, grey is not yet.

## 6. Hard rules, these come from the product owner and are not negotiable

- **Fill the main area with what matters.** A header that restates what the page
  already shows gets cut.
- **No tall hero panels.** A brand hub header is one compact row: back control,
  logo, name, tagline. Nothing more. Content starts high on every screen.
- **Never say the same thing twice on one card.** A status chip above a button
  that says the same thing reads as a second, different fact.
- **Do not explain the absence of something.** If an offer has no fixed fee,
  leave the fee out. Do not write "no fixed fee on this one".
- **The main column is left aligned against the sidebar** with a max width, never
  centred. Centred content leaves a dead gap beside the rail on a wide monitor.
- **Never show ids, slugs or URLs.** They are plumbing.
- **No em dashes or en dashes anywhere in the copy.** Commas, full stops and
  colons only.
- Copy is plain, warm, direct British-neutral English. Short sentences. No
  marketing voice, no exclamation marks, no emoji in the UI.

## 7. Responsiveness and accessibility, checked, not hoped

- Every screen works at **375, 768, 1024 and 1440px**. Most of these users are on
  a phone, so design the phone layout first and let it grow.
- **No horizontal page scroll at any width.** Wide things scroll inside their own
  container. Tables become stacked cards on narrow screens.
- Anything reachable only by hover needs a tap equivalent. Tap targets 44px min.
- WCAG AA contrast in both themes. Visible focus rings using `--wx-accent-ring`.
- Every animation respects `prefers-reduced-motion: reduce`: keep the opacity
  fade, drop the movement, never remove the information.
- Modals scroll **inside themselves** (`max-h` plus `overflow-y-auto` on the
  panel), never on the fixed wrapper, or the top of a tall dialog becomes
  unreachable on a short phone.

## 8. The shell every creator screen sits in

- **Desktop (≥1024px):** a fixed 16rem left rail on `--wx-surface-1` with a right
  border. It collapses to a 4.5rem icon rail. Groups with mono uppercase
  headings. The active item is `--wx-accent-soft` background, accent text,
  semibold. At the bottom, a single compact user row: circular initial avatar,
  name, email, sign out icon.
- **Mobile:** the rail becomes a slide-in drawer from the left with a blurred
  scrim, opened from a hamburger in the top bar.
- **Top bar:** 64px, sticky, opaque (`--wx-surface-1` at 90% with a backdrop
  blur), holding the collapse control on desktop, the logo on mobile, a theme
  toggle and the menu button.
- **Main:** `max-width: 80rem`, left aligned, `padding: 1.5rem` growing to 2rem.

Creator navigation, exactly this, in this order:

- **Overview**: Home (`/app`)
- **Your work**: My numbers *(not built, shown greyed with a "Step 8" chip, not a
  link)*, Brand hubs (`/app/brands`), Leaderboards *(greyed, "Step 9")*,
  Offers (`/app/offers`)
- **Account**: My profile (`/app/profile`)

Items that are not built are listed but never clickable. That honesty is
deliberate: a creator should be able to see the shape of what is coming.

## 9. The seven stages, the vocabulary of the whole product

The same seven words are used by creators and by the Wurx team, so a phone call
between them means one thing. **Do not rename, reorder or add to these.**

| # | Stage key | Label | What the creator is told | Money bucket |
|---|---|---|---|---|
| 1 | `pending_request` | Pending request | You are on this one. The team is getting it set up. | working |
| 2 | `sample_requested` | Sample requested | Your sample has been asked for from the brand. | working |
| 3 | `sample_shipped` | Sample shipped | It is on its way to you. | working |
| 4 | `content_pending` | Content pending | Over to you. Film it and send it in. | working |
| 5 | `content_completed` | Content completed | Your content is in and being checked. | working |
| 6 | `payment_pending` | Payment pending | Approved for payment. The money is on its way. | due |
| 7 | `paid` | Paid | Paid out. Nothing left to do on this one. | paid |

Suggested icons (lucide): BadgeCheck, PackageOpen, Truck, Clapperboard,
PackageCheck, Wallet, Banknote.

**Money is bucketed by stage, never by status.** Every stage belongs to exactly
one bucket, so **paid + due + working always equals the total agreed**, and a
creator can add the three cards up and get the headline number. That identity
must survive whatever you design.

## 10. The screens

### 10.1 Home, `/app`, the one that has to land

The most important screen in the product. A creator opens the app to find out
where their money is. In order down the page:

**a. Greeting line.** "Welcome back, Maya" with one line under it: "Where your
work stands, and where your money is." Compact. No card, no panel.

**b. The money block.** One bordered card, `--wx-surface-1`, radius 16px.

- Mono uppercase label: "Paid to you so far".
- The headline figure, `clamp(2rem, 7vw, 3rem)`, extrabold, accent colour,
  **counting up from zero on mount** over about 900ms with an ease-out curve.
- One line under it: "$2,540 more agreed and on its way". When nothing is
  outstanding it reads "Everything agreed has been paid out."
- A **flow bar**: a single 10px rounded track split into three segments, paid /
  awaiting payment / in progress, each animating its width from 0 on mount with
  a staggered delay. Green, gold, grey. It carries an `aria-label` spelling out
  the three amounts.
- Under it, three cells divided by hairlines (stacked on mobile, three across
  from 640px): **Paid** ("Already in your account"), **Awaiting payment** ("Work
  done, payment approved"), **In progress** ("Agreed, still being worked"). Each
  has a small circular tinted icon whose colour matches its segment in the bar
  above, so the bar needs no legend of its own.

**c. Four counters**, one row on desktop, two by two on mobile. Each is a link,
each counts up on mount: **Offers you are on**, **Brands you work with**,
**Waiting on a decision**, **Not accepted**.

**d. A visualisation of the pipeline.** This is where the screen currently has
the least personality and where you have the most freedom. Design something
genuinely good from `byStage` (count and amount per stage, given in the data):
where every piece of work is sitting right now, and how much money is parked at
each step. It must stay readable at 375px and in light mode, and it must not use
accent and warning together.

**e. Your work.** A card per approved job, active work first, paid work last and
visually settled (a dashed border works well). Each card carries:
- Brand logo and name as a subtle link.
- The offer title, bold.
- The creator hint line for the current stage, from the table above.
- The amount, right aligned, mono, with a mono uppercase label above it that
  reads "You get", or "Paid" once it is paid.
- A **stage tracker**: seven segments in a row, filled up to the current stage,
  animating in with a per-segment stagger. Under it, one line only: the icon,
  the current stage label, and "4 of 7". Seven captions across a phone is a wall
  of text; one caption and a row of segments is a status.

**f. Latest.** A timeline of the most recent stage moves, newest first. Each row:
tinted circular stage icon, "**Content completed** on Summer drinkware push at
BruMate", any note the team left, and a mono date on the right.

**Empty state**, a creator approved but with nothing taken yet: no money block.
Instead a centred invitation, "Take your first offer", one line of explanation,
a primary button to the offers screen, and three quiet rows of what is coming
(their numbers straight from the brands, briefs and contests and leaderboards,
retainer offers as they grow).

**Loading state:** skeletons in the shape of the real content. Never a spinner.

### 10.2 Offers, `/app/offers`

Everything on the table from every brand, because the brand hub only answers
"what is *this* brand offering".

- Compact heading row: "Offers" with "Everything on the table, from every brand
  you work with." beside it.
- **Pill tabs with counts**: Everything, You are in, Waiting, Not asked yet. On a
  phone they scroll horizontally inside their own container.
- A search field (offer, brand or description) and a brand dropdown.
- A responsive grid of offer cards: one column on a phone, two from 768px, three
  from 1280px.

**The offer card**, top to bottom: brand logo and name; an optional badge pill
(TOP PICK, SEASONAL, HIGHEST PAYING) in accent-soft, mono uppercase; the offer
title; up to three lines of description; a hairline; then the terms, **Videos**
and **You get**, as mono uppercase labels with large values, the money in accent.
Either or both of those may be missing, and then that row is simply not there.

The bottom of the card is the only part that differs, and it must be the same
answer this offer gets on every other screen:

- **Never needed applying for:** a green tick note, "You are already on this
  one", with "No application needed. Start posting whenever you are ready."
- **Approved:** a tinted panel with "You are in" (or "Paid out", in green, once
  paid) and the agreed amount, the stage hint line under it, then the same seven
  segment stage tracker.
- **Pending:** an amber note, "With the team", plus a quiet Withdraw button.
- **Rejected:** a red note, "Not this time", the team's reason if there is one,
  and an "Ask again" button.
- **Never asked:** a primary "Apply for this" button.

**Empty states:** distinguish "no offers yet" from "nothing matches that".

### 10.3 Brand hubs, `/app/brands`

- Heading, one supporting line, then a grid of brand cards: one column, two from
  640px, three from 1280px.
- **Brand card:** circular logo, brand name bold, tagline muted, up to three
  lines of description, and at the bottom a small pill with the number of offers.
  Whole card is the link, with a border that goes accent on hover.
- **Empty state:** "No brands open yet", explaining it fills up as brands come on
  board.

### 10.4 A Brand Hub, `/app/brands/:slug`

- **Header, one compact row only:** a small square back control, the brand mark,
  the name at about 1.25rem, the tagline under it, truncated. This must not grow
  into a hero panel. It was one once and it pushed the real content off the
  screen.
- **Pill tabs:** Overview (default), Offers, then My numbers, Leaderboards,
  Campaigns & briefs, Contests, Creative studio, all shown with a dashed border
  and disabled because they are not built yet.
- **Overview**, two sections, each under a mono uppercase heading with a hairline
  running off to the right:
  - **Meet the brand:** the brand's description, and a secondary button, "See 3
    offers", that switches to the Offers tab.
  - **What they sell:** a list of products. Each row: a 48px rounded product
    image, the name, an optional badge pill (HERO), the price in mono under it,
    and on the right the commission the creator earns, large, mono, accent, with
    a tiny mono uppercase caption "Your cut". **Price and commission can both be
    missing**, and then nothing is printed rather than a zero.
    Products are the reason a creator decides they want a brand, so this list
    deserves real design attention, not a plain table.
- **Offers:** the same offer cards as 10.2, minus the brand row, since you are
  already standing in the brand.

### 10.5 The apply dialog

Opens from any "Apply for this" button. A centred modal on desktop, a bottom
sheet on mobile, entering with a short spring.

- The offer title, the brand name under it.
- A restatement of exactly what is being asked for, in a tinted well: "5 videos
  for **$300**", mono, the money in accent. When the offer has no fixed terms:
  "The team will confirm what this one involves with you directly."
- The offer description under a hairline.
- One optional textarea, "Anything to add", hint "Optional. The team reads this
  with your request", placeholder "e.g. I already use this product, so I can post
  within a week."
- "Send request" and "Cancel".

**There is nothing to negotiate.** A creator takes the offer as written. Do not
add fields for their own price, their own video count, or a date. The
confirmation step exists purely because this is a commitment about money.

### 10.6 My profile, `/app/profile`

Quiet by design, and it should still look finished.

- **Your name:** the only editable thing in the whole creator account. A text
  input and a Save button, with a green "Saved" confirmation.
- **Account:** email, status (Creator), tier (Creator, Rising, Pro, Elite) and
  the date they joined, as read-only pairs.
- **Your application:** TikTok handle, niche, whether they had worked with Wurx
  before, and the date they applied. A closing line explaining that the Wurx team
  corrects anything wrong here.

## 11. Sample data, build every screen against this

Close to our real seed data, so the screens can be recognised. All amounts USD.
Percentages are commission rates. Money adds up: **paid 460 + due 240 +
working 2300 = 3000 total agreed**.

```ts
export const creator = {
  displayName: 'Maya Ellison',
  email: 'maya@example.com',
  tiktokHandle: 'mayaonmain',
  tier: 'Rising',
  role: 'Creator',
  joined: '2026-03-14',
  niche: 'Beauty & skincare',
  workedWithWurxBefore: false,
};

export const summary = {
  approved: 5,          // offers you are on
  brands: 3,            // brands you work with
  waiting: 1,           // waiting on a decision
  declined: 1,          // not accepted
  money: { paid: 460, due: 240, working: 2300, total: 3000, currency: 'USD' },
  byStage: {
    pending_request:   { count: 0, amount: 0 },
    sample_requested:  { count: 0, amount: 0 },
    sample_shipped:    { count: 1, amount: 900 },
    content_pending:   { count: 1, amount: 1400 },
    content_completed: { count: 0, amount: 0 },
    payment_pending:   { count: 1, amount: 240 },
    paid:              { count: 2, amount: 460 },
  },
};

export const brands = [
  { id: 'b1', name: 'Vitauthority', slug: 'vitauthority',
    tagline: 'Wellness & Weight Support',
    description: 'Clean, science-backed supplements with a loyal repeat customer base. Creators do best here with honest before-and-after storytelling rather than hard selling.',
    offerCount: 3 },
  { id: 'b2', name: 'BruMate', slug: 'brumate',
    tagline: 'Drinkware That Keeps Up',
    description: 'Insulated drinkware with a strong outdoor and tailgate audience. Product in use beats product on a shelf every single time.',
    offerCount: 4 },
  { id: 'b3', name: 'Physicians Choice', slug: 'physicians-choice',
    tagline: 'Gut Health, Backed by Research',
    description: 'Probiotics and digestive health, sold on evidence. Claims are checked before anything goes live, so scripts are approved in advance here.',
    offerCount: 1 },
  { id: 'b4', name: 'Bentgo', slug: 'bentgo',
    tagline: 'Lunch, Sorted',
    description: 'Leakproof lunchboxes with a huge back-to-school season. Parents buy on convenience, kids buy on colour.',
    offerCount: 2 },
];

export const products = {
  b1: [
    { name: 'Multi Collagen Burn, 30 servings', price: 49.99, commission: 25, badge: 'HERO' },
    { name: 'Lean Bliss Greens, 30 servings',   price: 39.99, commission: 22 },
    { name: 'Daily Multivitamin, 60 count',     price: 24.99, commission: 20 },
  ],
  b2: [
    { name: 'Hopsulator Trio, 16 oz', price: 29.99, commission: 18, badge: 'HERO' },
    { name: 'Era Tumbler, 25 oz',     price: 34.99, commission: 18 },
  ],
  b3: [
    { name: 'Probiotic 60 Billion CFU, 30 count', price: 27.95, commission: 24, badge: 'HERO' },
    { name: 'Prebiotic Fiber, 30 servings',       price: 21.95, commission: 20 },
    // Numbers not in yet. Print nothing, never a zero.
    { name: 'Digestive Enzymes, 60 count',        price: null,  commission: null },
  ],
  b4: [],   // empty state: "Products are on their way"
};

// state: 'in' approved | 'waiting' pending | 'declined' rejected
//        | 'open' no application needed | 'canApply' never asked
export const offers = [
  { id: 'o1', brandId: 'b1', badge: 'TOP PICK', title: 'Starter bundle',
    description: 'Five in-feed videos featuring the hero product, posted within 30 days. Hook in the first two seconds.',
    videoCount: 5, reward: 300, state: 'in', stage: 'paid', committed: 300 },
  { id: 'o2', brandId: 'b1', badge: 'QUICK START', title: 'Single video test',
    description: 'One video, no commitment. A good way to see if we fit.',
    videoCount: 1, reward: 75, state: 'open' },
  { id: 'o3', brandId: 'b1', badge: null, title: 'Volume deal',
    description: 'Twenty videos across the quarter, paid monthly.',
    videoCount: 20, reward: 1400, state: 'in', stage: 'content_pending', committed: 1400 },
  { id: 'o4', brandId: 'b2', badge: 'SEASONAL', title: 'Summer drinkware push',
    description: 'Three videos with the tumbler range, outdoors, before the end of August.',
    videoCount: 3, reward: 240, state: 'in', stage: 'payment_pending', committed: 240 },
  { id: 'o5', brandId: 'b2', badge: null, title: 'Unboxing only',
    description: 'One unboxing video. Open to anyone on the roster.',
    videoCount: 1, reward: 60, state: 'open' },
  { id: 'o6', brandId: 'b2', badge: null, title: 'Autumn restock',
    description: 'Two videos for the autumn colourways.',
    videoCount: 2, reward: 160, state: 'in', stage: 'paid', committed: 160 },
  { id: 'o7', brandId: 'b2', badge: null, title: 'Holiday gifting hero',
    description: 'Six videos through November, gifting angle.',
    videoCount: 6, reward: 520, state: 'declined',
    decisionNote: 'We have filled this one for now. Come back for the winter push.' },
  { id: 'o8', brandId: 'b3', badge: 'HIGHEST PAYING', title: 'Gut health series',
    description: 'Ten videos telling one story across the month. Script approval required.',
    videoCount: 10, reward: 900, state: 'in', stage: 'sample_shipped', committed: 900 },
  { id: 'o9', brandId: 'b4', badge: null, title: 'Back to school lunchbox push',
    description: 'Four videos before the end of August, parent-facing.',
    videoCount: 4, reward: 320, state: 'waiting' },
  // No fixed deliverable and no fixed fee. The terms row is simply absent.
  { id: 'o10', brandId: 'b4', badge: 'BOOSTED', title: 'Lunchbox commission boost',
    description: 'Raised commission on the whole range for the season.',
    videoCount: null, reward: null, state: 'canApply' },
];

// Tab counts on /app/offers: Everything 10, You are in 7, Waiting 1, Not asked yet 2.

export const stageEvents = [
  { id: 8, offerId: 'o4', toStage: 'payment_pending',   note: null, at: '2026-08-08' },
  { id: 7, offerId: 'o4', toStage: 'content_completed', note: null, at: '2026-08-06' },
  { id: 6, offerId: 'o8', toStage: 'sample_shipped',    note: 'Tracking sent to your email.', at: '2026-08-04' },
  { id: 5, offerId: 'o3', toStage: 'content_pending',   note: null, at: '2026-08-02' },
  { id: 4, offerId: 'o6', toStage: 'paid',              note: null, at: '2026-07-29' },
  { id: 3, offerId: 'o8', toStage: 'sample_requested',  note: null, at: '2026-07-24' },
  { id: 2, offerId: 'o3', toStage: 'pending_request',   note: null, at: '2026-07-19' },
  { id: 1, offerId: 'o1', toStage: 'paid',              note: null, at: '2026-06-12' },
];
```

Brand logos and product images: use a neutral placeholder block with the
lucide `Store` or `Package` icon inside a bordered circle or rounded square.
**Every image can be missing and every screen must look right without one.**

Also show, as separate variants: the **brand new creator** (nothing taken yet),
the **loading skeletons**, and an **error state** ("That list would not load")
for each list screen.

## 12. Animation direction

Animation should feel like confirmation, not decoration. One easing curve for the
whole product, `cubic-bezier(0.22, 1, 0.36, 1)`. Durations 140 / 240 / 420ms.

- **Entrances:** content rises 10 to 14px and fades in, staggered by 40 to 60ms,
  and the stagger is capped so the tenth card does not wait a second to appear.
- **Numbers count up** on mount, roughly 900ms, ease-out, tabular figures so the
  layout does not jitter while they run.
- **Bars and trackers grow from zero** with a per-segment delay.
- **Live updates:** when a stage advances while the creator is watching, the newly
  filled segment should pulse once and the card should acknowledge it. Design an
  explicit "this just changed" treatment. This is the product's proudest
  behaviour and today it just quietly redraws.
- **Hover:** border to accent, a 1px lift at most, 140ms. Never scale a card.
- **Skeletons** shimmer gently. Never a bare spinner anywhere.
- Everything above degrades to a plain fade under `prefers-reduced-motion`.

## 13. What you must not do

- **Never show a brand's budget, its client name, or anything about what Wurx
  pays for a brand.** Creators must never see commercial data. If you invent a
  field, it will be deleted.
- **Do not invent GMV, views, conversion, follower or earnings-over-time charts.**
  That data does not exist yet in this product. The only honest visualisations
  are: the paid / due / working split, the distribution of work across the seven
  stages, earnings by brand, and payouts over time from the stage events. If you
  want to gesture at what is coming, mark it plainly as not built, the way the
  sidebar does.
- Do not add negotiation, counter-offers, custom pricing, scheduling or
  messaging. None of them exist.
- Do not add a new dependency, a chart library, or a component library.
- Do not centre the main column, do not build a tall hero, do not print an id or
  a slug, and do not use an em dash.

## 14. How to hand it back

For each screen: the component code, plus a note of anything you changed about
the structure and why. If a piece of copy is better than ours, change it and say
so. If a section is in the wrong order, move it and say so. You are expected to
improve the layout, not just repaint it.

Deliver in this order, so it can be reviewed a piece at a time:

1. Shared primitives: tokens file, buttons, cards, pills, mono labels, skeletons,
   the stage tracker, the count-up number.
2. **Home, `/app`.** The most important screen. Get this one right first.
3. Offers, `/app/offers`.
4. Brand hubs list and a single Brand Hub.
5. The apply dialog and the profile screen.
