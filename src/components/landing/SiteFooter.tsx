import { Link } from 'react-router';
import { WurxMark } from '@/components/brand/WurxMark';
import { Container } from '@/components/layout/Section';
import { focusApplyForm } from '@/lib/focus-apply';

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-12">
      <Container>
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <WurxMark />
            <p className="mt-4 text-sm leading-relaxed text-faint">
              The creator platform behind Wurx Media&rsquo;s TikTok Shop brands.
            </p>
          </div>

          {/*
            THREE COLUMNS, and every page of the website is in one of them.
            A reviewer checking "fully developed website" reads the footer to
            see how much site there is; so does anyone lost on a sub-page.
          */}
          <nav className="grid grid-cols-2 gap-10 text-sm sm:flex sm:gap-14" aria-label="Footer">
            <div>
              <h2 className="text-faint font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
                Platform
              </h2>
              <ul className="mt-4 space-y-2.5">
                {[
                  { to: '/creators', label: 'For creators' },
                  { to: '/brands', label: 'For brands' },
                  { to: '/how-it-works', label: 'How it works' },
                  { to: '/faq', label: 'FAQ' },
                ].map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-muted hover:text-accent transition-colors">
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
              <ul className="mt-4 space-y-2.5">
                <li>
                  <Link to="/about" className="text-muted hover:text-accent transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="text-muted hover:text-accent transition-colors">
                    Contact
                  </Link>
                </li>
                <li>
                  <a
                    href="https://wurxmedia.com"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-muted hover:text-accent transition-colors"
                  >
                    Wurx Media
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => focusApplyForm() || window.location.assign('/apply')}
                    className="text-muted hover:text-accent transition-colors"
                  >
                    Apply
                  </button>
                </li>
                <li>
                  <Link to="/login" className="text-muted hover:text-accent transition-colors">
                    Sign in
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-faint font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
                Legal
              </h2>
              <ul className="mt-4 space-y-2.5">
                {/*
                  LINKED, not merely reachable. An app reviewer looks for these
                  in the footer of the site itself; a URL that only exists in a
                  form field reads as one made for the form.
                */}
                <li>
                  <Link to="/privacy" className="text-muted hover:text-accent transition-colors">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-muted hover:text-accent transition-colors">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link to="/tiktok" className="text-muted hover:text-accent transition-colors">
                    Connecting TikTok
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-7 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Wurx Media. All rights reserved.</p>
          <p className="font-mono tracking-wider">WURXMEDIAHUB</p>
        </div>
      </Container>
    </footer>
  );
}
