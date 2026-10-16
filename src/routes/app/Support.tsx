import { m, useReducedMotion } from 'motion/react';
import { SupportFaq } from '@/components/creator/support/SupportFaq';
import { SupportContact } from '@/components/creator/support/SupportContact';

/**
 * SUPPORT. Both external reviewers asked for it, and the app had nothing: no
 * help text behind the login, no address, no explanation of where a figure
 * comes from. A creator with a question had to leave the product and find the
 * public site.
 *
 * TWO SECTIONS, AND THAT IS THE WHOLE SCREEN. The answers she can get without
 * us, then the way to reach us when she cannot. No search box over nine
 * entries, no category tree, no "was this helpful" — each of those is a
 * feature to maintain and none of them makes nine answers easier to read.
 *
 * WHAT IS NOT HERE, on purpose. No ticket list and no ticket status, because
 * there is no backend for either; the contact section says so in words rather
 * than leaving it to be discovered. No contact form, following the public
 * Contact page's own reasoning: a form that posts into a mailbox nobody has
 * confirmed is worse than an address you can see and test.
 *
 * NO TITLE ROW. The top bar names the section from the sidebar's own label —
 * see `sectionTitleFor` — and a screen that draws its own heading repeats the
 * lit menu row and pushes the work down the page. House rule, not taste.
 *
 * MOTION: opacity and translateY, 1rem of travel, and nothing at all under
 * `prefers-reduced-motion`. `m.div` because `LazyMotion` is `strict` and a
 * bare `motion.div` throws.
 */
export function Support() {
  const reduced = useReducedMotion();

  const reveal = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    /* `max-w-4xl` is the one place a width cap is right: this is prose, and a
       sentence 1800px wide is unreadable. The rule against capping is about
       screens of CARDS leaving a dead gap when you zoom out. Left aligned
       against the rail, as everything else is. */
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <m.div {...reveal(0)}>
        <SupportFaq />
      </m.div>

      <m.div {...reveal(0.06)}>
        <SupportContact />
      </m.div>
    </div>
  );
}
