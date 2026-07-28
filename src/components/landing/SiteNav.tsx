import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/layout/Section';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#platform', label: 'The platform' },
  { href: '#brands', label: 'Brands' },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

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
      if (window.innerWidth >= 768) setOpen(false);
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
        'fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-brand',
        scrolled || open
          ? 'border-b border-line bg-bg/85 backdrop-blur-xl'
          : 'border-b border-transparent'
      )}
    >
      <Container>
        <nav className="flex h-16 items-center justify-between gap-4">
          <a href="#top" className="shrink-0" aria-label="WurxMediaHub home">
            <WurxMark />
          </a>

          <ul className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="rounded-lg px-3 py-2 text-sm text-muted transition-colors duration-200 ease-brand hover:text-accent"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <ButtonLink to="#apply" size="sm" className="hidden sm:inline-flex">
              Apply
            </ButtonLink>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="grid size-10 place-items-center rounded-full border border-line bg-surface-1/60 text-muted transition-colors duration-200 ease-brand hover:border-line-interactive hover:text-accent md:hidden"
            >
              {open ? <X size={17} aria-hidden /> : <Menu size={17} aria-hidden />}
            </button>
          </div>
        </nav>
      </Container>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line md:hidden"
          >
            <Container>
              <ul className="flex flex-col gap-1 py-4">
                {LINKS.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-3 text-[15px] text-muted transition-colors duration-200 ease-brand hover:bg-surface-2 hover:text-accent"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
                <li className="pt-2">
                  <ButtonLink
                    to="#apply"
                    className="w-full"
                    onClick={() => setOpen(false)}
                  >
                    Apply to join
                  </ButtonLink>
                </li>
              </ul>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
