import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { Menu, X } from 'lucide-react';
import { PrismMark } from '@/components/brand/PrismMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/layout/Section';
import { focusApplyForm } from '@/lib/focus-apply';
import { cn } from '@/lib/utils';

/**
 * THE MENU IS PAGES NOW, NOT SECTIONS OF ONE PAGE.
 *
 * It was `#how`, `#platform`, `#brands` â€” anchors into the marketing page,
 * which is precisely what TikTok rejected the app for on 2026-09-15: "Your
 * website URL cannot be a landing page or login page. You must have an
 * externally facing fully developed website." Anchors also did nothing at all
 * from any other page, which is how /terms had a header whose links went
 * nowhere.
 */
const LINKS = [
  { href: '/creators', label: 'For creators' },
  { href: '/brands', label: 'For brands' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  /**
   * Apply, from wherever you are.
   *
   * `focusApplyForm` scrolls to the form in the home page's hero and returns
   * false when that form is not on the page. It now IS on six other pages'
   * headers â€” so on About or the FAQ, "Apply" silently did nothing. Where there
   * is no form, go to the one at /apply.
   */
  const apply = () => {
    if (!focusApplyForm()) void navigate('/apply');
  };

  // The bar is transparent over the hero and gains a background once you
  // scroll, so the header never fights the headline for attention.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Escape closes the mobile menu, and it never survives a resize to desktop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onResize = () => {
      /* 1024, matching the `lg:hidden` on the button that opens it. At 768 this
         closed the menu at a width where the links are still only inside it. */
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <header
      className={cn(
        'ease-brand fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled || open
          ? 'border-line bg-bg/85 border-b backdrop-blur-xl'
          : 'border-b border-transparent'
      )}
    >
      <Container>
        <nav className="flex h-16 items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center"
            aria-label="WurxMediaHub home"
          >
            <PrismMark />
          </Link>

          {/* `lg`, not `md`: six page links and the sign-in cluster do not fit
              a tablet. Below that they are in the menu button beside them. */}
          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  to={l.href}
                  className="text-muted hover:text-accent ease-brand rounded-lg px-3 py-2 text-sm transition-colors duration-200"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2.5">
            {/* Existing partners had no way in from a desktop: "Sign in" only
                existed inside the mobile menu. This is the return path for
                everyone who has already applied. */}
            <Link
              to="/login"
              className="text-muted ease-brand hover:text-accent hidden min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm whitespace-nowrap transition-colors duration-200 sm:inline-flex"
            >
              <span className="hidden lg:inline">Already a partner?</span>
              <span className="text-text hover:text-accent font-medium underline-offset-4 hover:underline">
                Sign in
              </span>
            </Link>

            <ThemeToggle />
            <Button size="sm" className="hidden sm:inline-flex" onClick={apply}>
              Apply
            </Button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="border-line bg-surface-1/60 text-muted hover:border-line-interactive hover:text-accent ease-brand grid size-11 place-items-center rounded-full border transition-colors duration-200 lg:hidden"
            >
              {open ? <X size={17} aria-hidden /> : <Menu size={17} aria-hidden />}
            </button>
          </div>
        </nav>
      </Container>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="border-line overflow-hidden border-t lg:hidden"
          >
            <Container>
              <ul className="flex flex-col gap-1 py-4">
                {LINKS.map((l) => (
                  <li key={l.href}>
                    <Link
                      to={l.href}
                      onClick={() => setOpen(false)}
                      className="text-muted hover:bg-surface-2 hover:text-accent ease-brand block rounded-lg px-3 py-3 text-[0.9375rem] transition-colors duration-200"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li className="pt-2">
                  <Button
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      // Let the menu finish collapsing before scrolling.
                      window.setTimeout(apply, 300);
                    }}
                  >
                    Apply to join
                  </Button>
                </li>
                <li className="pt-1 text-center">
                  <ButtonLink to="/login" variant="ghost" className="w-full">
                    Already a partner? Sign in
                  </ButtonLink>
                </li>
              </ul>
            </Container>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}
