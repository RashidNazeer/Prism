import { Suspense, lazy, useEffect, useRef } from 'react';
import { useTheme } from '@/components/theme/theme-context';

/**
 * Paid Collabs: the WurxBase dashboard, running inside WurxMediaHub.
 *
 * WHAT THIS IS. WurxBase is a separate Create React App project another
 * developer built, roughly 24,000 lines of plain JavaScript covering creators,
 * brands, budgets, performance, reporting and paid collaborations. Rashid asked
 * for it to be brought in **whole and unchanged** — his words, no code, no
 * logic, nothing on that side to change — with only the styling made ours.
 *
 * So `src/vendor/wurxbase/` is a verbatim copy. It is not converted to
 * TypeScript, not refactored, not linted to our rules and not tidied. When it
 * needs to change, it changes there, in its own idiom. This file is the only
 * seam between it and the rest of the product, and it does four things:
 *
 *   1. ADMIN ONLY. The route guard keeps creators out, and the sidebar never
 *      offers it to them. Nothing in here is creator-facing.
 *   2. FENCES ITS CSS. WurxBase styles `body`, `*` and bare elements, written
 *      for a site of its own. Every one of its selectors was rewritten to sit
 *      under `.wurxbase-root`, so it cannot reach a single pixel of the rest of
 *      the product. Without that, opening this page once would restyle
 *      everything, permanently, because a lazily loaded chunk injects its CSS
 *      and never takes it back.
 *   3. HANDS IT THE THEME. Its stylesheets switch on `data-theme` on the root
 *      element. Ours lives on `<html>`, and the fence is a div, so the value is
 *      mirrored onto it and kept in step.
 *   4. LOADS IT LAZILY. It is a large bundle with jsPDF, PptxGenJS and SheetJS
 *      inside, and nobody who never opens this screen should pay for any of it.
 */

const WurxBaseApp = lazy(() => import('@/vendor/wurxbase/App'));

export function PaidCollabs() {
  const { resolved } = useTheme();
  const fence = useRef<HTMLDivElement>(null);

  /*
   * Their CSS reads `data-theme` off the element its rules are anchored to.
   * That anchor used to be `<html>`; scoping moved it to this div, so the value
   * has to arrive here. Kept in an effect rather than rendered as a prop so it
   * follows a theme change made while the screen is open.
   */
  useEffect(() => {
    const el = fence.current;
    if (el) el.setAttribute('data-theme', resolved);
  }, [resolved]);

  return (
    <div
      ref={fence}
      className="wurxbase-root wurxbase-fence -mx-4 -my-4 sm:-mx-6"
      data-theme={resolved}
    >
      <Suspense fallback={<div className="wx-skeleton m-4 h-96 rounded-xl" />}>
        <WurxBaseApp />
      </Suspense>
    </div>
  );
}
