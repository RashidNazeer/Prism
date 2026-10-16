import { Link } from 'react-router';
import { PrismMark } from '@/components/brand/PrismMark';
import { Container } from '@/components/layout/Section';

/*
 * THE FOOTER IS A GLASS PANEL NOW, not a hairline rule on bare ground.
 *
 * It was `border-t` and nothing else, which was right when the page was a flat
 * colour: a line was the only way to mark the end of it. With a photograph and
 * a WebGL field running the full height, that line separated nothing — the
 * footer sat directly on the background and read as content that had fallen off
 * the page.
 *
 * Same material as every other surface, so it ends the page the way a card ends
 * a section: `wx-neo-raised` for the fill, rim and lift, the card radius on the
 * TOP corners only (it runs to the bottom edge of the viewport, and rounding a
 * corner with no gap below it draws a notch), and the shell's gutter so it
 * lines up with the content above.
 */
export function SiteFooter() {
  return (
    <footer className="wx-neo-raised mx-3 mt-16 rounded-t-2xl py-12">
      <Container>
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <PrismMark />
            <p className="text-faint mt-4 text-sm leading-relaxed">
              The creator platform behind Wurx Media&rsquo;s TikTok Shop brands.
            </p>
          </div>

          {/*
            THREE COLUMNS, and every page of the website is in one of them.
            A reviewer checking "fully developed website" reads the footer to
            see how much site there is; so does anyone lost on a sub-page.
          */}
          <nav
            className="grid grid-cols-2 gap-10 text-sm sm:flex sm:gap-14"
            aria-label="Footer"
          >
            <div>
              <h2 className="text-faint font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
                Platform
              </h2>
              <ul className="mt-2 space-y-0 lg:mt-4 lg:space-y-2.5">
                {[
                  { to: '/creators', label: 'For creators' },
                  { to: '/brands', label: 'For brands' },
                  { to: '/how-it-works', label: 'How it works' },
                  { to: '/faq', label: 'FAQ' },
                ].map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-muted hover:text-accent focus-visible:text-accent inline-flex items-center transition-colors max-lg:min-h-11 pointer-coarse:min-h-11"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-faint font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
                Company
              </h2>
              <ul className="mt-2 space-y-0 lg:mt-4 lg:space-y-2.5">
                <li>
                  <Link
                    to="/about"
                    className="text-muted hover:text-accent focus-visible:text-accent inline-flex items-center transition-colors max-lg:min-h-11 pointer-coarse:min-h-11"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    to="/contact"
                    className="text-muted hover:text-accent focus-visible:text-accent inline-flex items-center transition-colors max-lg:min-h-11 pointer-coarse:min-h-11"
                  >
                    Contact
                  </Link>
                </li>
                <li>
                  <a
                    href="https://wurxmedia.com"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-muted hover:text-accent focus-visible:text-accent inline-flex items-center transition-colors max-lg:min-h-11 pointer-coarse:min-h-11"
                  >
                    Wurx Media
                  </a>
                </li>
                <li>
                  {/*
                    A LINK, LIKE EVERY OTHER ITEM IN THIS COLUMN.

                    It was a `<button>` running
                    `focusApplyForm() || window.location.assign('/apply')`.
                    Two faults in one line: the form is only mounted on
                    `/apply` now, so the first half never succeeds from the
                    footer; and `window.location.assign` is a FULL PAGE RELOAD
                    out of a single-page app, which threw away the router, the
                    auth session cache and a second of the visitor's time, in a
                    list where every neighbour is an instant client-side
                    navigation.

                    Rashid: "ditch the buttons where you can." A destination is
                    a link.
                  */}
                  <Link
                    to="/apply"
                    className="text-muted hover:text-accent focus-visible:text-accent inline-flex items-center transition-colors max-lg:min-h-11 pointer-coarse:min-h-11"
                  >
                    Apply
                  </Link>
                </li>
                <li>
                  <Link
                    to="/login"
                    className="text-muted hover:text-accent focus-visible:text-accent inline-flex items-center transition-colors max-lg:min-h-11 pointer-coarse:min-h-11"
                  >
                    Sign in
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-faint font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
                Legal
              </h2>
              <ul className="mt-2 space-y-0 lg:mt-4 lg:space-y-2.5">
                {/*
                  LINKED, not merely reachable. An app reviewer looks for these
                  in the footer of the site itself; a URL that only exists in a
                  form field reads as one made for the form.
                */}
                <li>
                  <Link
                    to="/privacy"
                    className="text-muted hover:text-accent focus-visible:text-accent inline-flex items-center transition-colors max-lg:min-h-11 pointer-coarse:min-h-11"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    to="/terms"
                    className="text-muted hover:text-accent focus-visible:text-accent inline-flex items-center transition-colors max-lg:min-h-11 pointer-coarse:min-h-11"
                  >
                    Terms
                  </Link>
                </li>
                <li>
                  <Link
                    to="/tiktok"
                    className="text-muted hover:text-accent focus-visible:text-accent inline-flex items-center transition-colors max-lg:min-h-11 pointer-coarse:min-h-11"
                  >
                    Connecting TikTok
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="text-faint mt-12 flex flex-col gap-2 pt-7 text-xs sm:flex-row sm:items-center sm:justify-between [border-top:1px_solid_var(--wx-glass-line)]">
          <p>&copy; {new Date().getFullYear()} Wurx Media. All rights reserved.</p>
          <p className="font-mono tracking-wider">WURXMEDIAHUB</p>
        </div>
      </Container>
    </footer>
  );
}
