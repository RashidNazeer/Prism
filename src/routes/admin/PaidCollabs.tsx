import { Suspense, lazy, useEffect, useRef } from 'react';
import { useTheme } from '@/components/theme/theme-context';
// Both win on specificity rather than on order. See the header of each file:
// the vendored CSS ships in a lazily loaded chunk, so "loaded after theirs" is
// not something an import position in here can promise.
import './wurxbase-overrides.css';
import './wurxbase-chrome.css';

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
   *
   * AND THE OTHER DIRECTION, which is the whole reason this effect got longer.
   * WurxBase has its own appearance settings, and `applyPrefsToDOM` writes all
   * five of them straight onto `<html>`: theme, accent, density, radius,
   * motion. One of those five is `data-theme`, which is the exact attribute
   * `src/styles/tokens.css` switches our entire palette on, and theirs defaults
   * to `light`. So opening this screen turned the whole admin light, and it
   * STAYED light after leaving it, because our provider only writes that
   * attribute when the theme actually changes and nothing had changed.
   *
   * Rather than edit their file, the seam takes the attribute back: an observer
   * puts our theme straight back on `<html>` whenever they set it, and mirrors
   * their other four onto the fence, where their own scoped rules read them.
   * Their settings panel therefore still works inside here, on everything
   * except the theme, which our toggle owns because our toggle is the one that
   * moves the rest of the product with it.
   */
  useEffect(() => {
    const el = fence.current;
    if (!el) return;

    const html = document.documentElement;
    const theirs = ['data-accent', 'data-density', 'data-radius', 'data-motion'];

    const reclaim = () => {
      if (html.getAttribute('data-theme') !== resolved) {
        // Writing this fires the observer again; the guard above stops there.
        html.setAttribute('data-theme', resolved);
      }
      el.setAttribute('data-theme', resolved);
      for (const name of theirs) {
        const value = html.getAttribute(name);
        if (value === null) el.removeAttribute(name);
        else el.setAttribute(name, value);
      }
    };

    reclaim();
    const observer = new MutationObserver(reclaim);
    observer.observe(html, {
      attributes: true,
      attributeFilter: ['data-theme', ...theirs],
    });

    return () => {
      observer.disconnect();
      // Leave the document as we found it: our theme, and none of their four.
      html.setAttribute('data-theme', resolved);
      for (const name of theirs) html.removeAttribute(name);
    };
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
