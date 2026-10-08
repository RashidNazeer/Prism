import { useEffect, type ReactNode } from 'react';
import { SiteNav } from '@/components/landing/SiteNav';
import { SiteFooter } from '@/components/landing/SiteFooter';
import { Container } from '@/components/layout/Section';
import { allowIndexing } from '@/lib/seo';

/**
 * The shell every public website page sits in: the site header, the page's own
 * title block, and the site footer.
 *
 * WHY IT IS NOT `LegalPage`. That shell is a reading measure for a page of
 * prose, with a stripped header. These pages are the website — a stranger
 * arrives on one and has to be able to get to the others — so they carry the
 * full navigation, exactly as the home page does.
 *
 * THE TITLE IS SET HERE, per page. Every route shared one `<title>` from
 * index.html, which is how a site ends up with seven tabs all called the same
 * thing. A reviewer reading a "fully developed website" notices; so does anyone
 * with more than one tab open.
 */
export function SitePage({
  title,
  eyebrow,
  intro,
  documentTitle,
  children,
}: {
  /** The page's own <h1>. */
  title: string;
  /** Small label above it. */
  eyebrow: string;
  /** One paragraph under the title, in plain words. */
  intro?: string;
  /** The browser tab. Defaults to the title. */
  documentTitle?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${documentTitle ?? title} | Wurx Media Hub`;
    return () => {
      document.title = previous;
    };
  }, [title, documentTitle]);

  /* A page of the public website, so search engines may have it — on the real
     site only. Rashid, 2026-09-22. */
  useEffect(() => allowIndexing(), []);

  return (
    <div className="bg-bg min-h-dvh">
      <SiteNav />
      {/* Clears the fixed header, which is 4rem tall. */}
      <main className="pt-16">
        <header className="border-line border-b py-14 sm:py-20">
          <Container>
            <span className="text-muted inline-flex items-center gap-2 font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
              <span className="bg-accent size-1.5 rounded-full" aria-hidden />
              {eyebrow}
            </span>
            <h1 className="font-display mt-5 max-w-4xl text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-extrabold tracking-[-0.02em]">
              {title}
            </h1>
            {intro && (
              <p className="text-muted mt-6 max-w-2xl text-lg leading-relaxed">{intro}</p>
            )}
          </Container>
        </header>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/** A plain card, the one repeated shape on these pages. */
export function SiteCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`wx-neo-raised ease-brand h-full rounded-2xl p-7 transition-colors duration-300 ${className ?? ''}`}
    >
      <h3 className="text-lg font-bold">{title}</h3>
      <div className="text-muted mt-3 leading-relaxed">{children}</div>
    </div>
  );
}
