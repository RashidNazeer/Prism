/**
 * THE QUESTIONS A SIGNED-IN CREATOR ACTUALLY ASKS, answered from what the app
 * does today.
 *
 * NOT a copy of the public FAQ in `src/content/site-pages.ts`, and deliberately
 * not an import of it. That one is written for somebody deciding whether to
 * apply: who can apply, does it cost anything, what does connecting TikTok
 * allow. These are written for somebody already inside, looking at a figure
 * that has not moved since yesterday or at a video marked "needs another take".
 * Two audiences, two lists; the overlap is small and the tone is different.
 *
 * EVERY ANSWER HERE IS CHECKABLE AGAINST THE CODE, and that matters more than
 * the copy reading nicely. The sources, in order of the entries below:
 *
 *   - `src/lib/creator/usePerformance.ts`: "NONE OF THIS TOUCHES TIKTOK. Every
 *     figure comes from `tiktok_video_daily`, which a nightly job fills one
 *     complete day at a time."
 *   - `src/lib/tiers.ts`: "THE AUTOMATION IS STILL NOT BUILT. `profiles.tier`
 *     is set by hand", and the thresholds are in US dollars.
 *   - `src/lib/offer-stages.ts`: the seven stage labels and the sentence each
 *     one says to a creator.
 *   - `src/lib/content.ts`: the three content statuses.
 *   - `src/routes/app/Profile.tsx`: display name is the only editable field,
 *     because it is the only column granted to `authenticated`.
 *
 * If one of those changes, change the answer with it. An out-of-date support
 * page is worse than no support page: it is the product telling a creator
 * something untrue in a place she went to be told the truth.
 */

export interface SupportQuestion {
  q: string;
  a: string;
}

export const SUPPORT_FAQ: readonly SupportQuestion[] = [
  {
    q: 'Where do the figures in the app come from?',
    a: 'From the brand’s own TikTok Shop reporting for the videos you filed with us, and from the brand’s TikTok ad account for the ad spend. They are TikTok’s own numbers. We import them and show them; we do not recalculate them, and they are the same figures the Wurx team works from.',
  },
  {
    q: 'Why has today not appeared yet?',
    a: 'The import runs once a night and fills one complete day at a time, so the most recent full day is what you see. Opening a screen or changing a date range never asks TikTok for anything, which is why moving the range is instant — and also why nothing you do in the app makes the numbers arrive sooner.',
  },
  {
    q: 'My figures do not match what TikTok shows me. Why?',
    a: 'Three usual reasons. The app only counts videos you filed against a brand here, so anything you posted outside that is not in these totals. Every screen is for a date window, and TikTok’s app may be showing you a different one. And the most recent night’s import is the cut-off, so the last few hours are not in either number yet.',
  },
  {
    q: 'What decides my tier?',
    a: 'The Wurx team does, by hand. Tiers are reviewed by us rather than awarded automatically, so you can sit either side of the GMV figure your tier implies. The ring on Home shows how far you are towards the next tier’s figure; it is not a claim that your current tier was earned by crossing one. The thresholds are in US dollars, so if you are paid in another currency they are not directly comparable.',
  },
  {
    q: 'Do I have to connect my TikTok account?',
    a: 'No, and you can use everything else without it. Connecting is read-only: it lets the app show your own video figures — views, likes, comments and shares — beside the brand’s. Until it is connected those read "Not reported". You can disconnect at any time from My profile.',
  },
  {
    q: 'Where is my deal up to, and when do I get paid?',
    a: 'Every approved job carries a stage, and the stage is the answer: the team is setting it up, your sample has been asked for, it is on its way, over to you to film, filmed and being checked, approved for payment, then paid. You are paid on the fee agreed before you filmed, by Wurx, out of the brand’s campaign budget.',
  },
  {
    q: 'One of my videos says it needs another take.',
    a: 'That means the team has reviewed it and asked for a second attempt. The reason they gave is on the video itself in My content. Film the new version, file the new link against the same job, and it goes back for review.',
  },
  {
    q: 'Who can see my numbers?',
    a: 'You, and Wurx staff working on the brands you are hired for. Other creators see your name and your GMV on a leaderboard only where a brand runs one, and never your contact details or your payment information.',
  },
  {
    q: 'Can I change my details, or have my account deleted?',
    a: 'Your display name is yours to change on My profile. Your email, role and tier are set by the Wurx team, so those are a message to us rather than a field. For deletion, write to us at the address below and we will do it; the public Privacy page says exactly what we hold and for how long.',
  },
] as const;
