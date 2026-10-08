import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PrismMark } from '@/components/brand/PrismMark';
import { Container } from '@/components/layout/Section';
import { SiteFooter } from '@/components/landing/SiteFooter';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { allowIndexing } from '@/lib/seo';

/**
 * The shell every legal page sits in.
 *
 * WHY THESE PAGES EXIST AT ALL, and it is not decoration. TikTok's developer
 * portal will not accept an app without a Terms of Service URL and a Privacy
 * Policy URL, both required, both public, both on the same domain as the app
 * itself. Registering the Display API app on 2026-08-26 is what forced them.
 *
 * They are also the two pages most likely to be read by somebody deciding
 * whether to trust us with their TikTok account, so they are written in the
 * same plain English as the rest of the product rather than in the language of
 * a document nobody finishes.
 *
 * NOT `SiteNav`. That header carries `#how` and `#platform`, which are sections
 * of the marketing page: on a legal page every one of them is a link that
 * scrolls nowhere. This is the mark, a way back, and the theme toggle, which is
 * all a page of prose needs.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** The date this document last changed, as a person would write it. */
  updated: string;
  children: ReactNode;
}) {
  /*
   * ITS OWN TAB TITLE. All three of these pages wore index.html's title, so a
   * reviewer with Terms, Privacy and Connecting TikTok open saw three
   * identical tabs â€” which reads as one page pretending to be three, the exact
   * impression the 2026-09-15 rejection was about.
   */
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | Wurx Media Hub`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  /* Public pages: Terms, Privacy and Connecting TikTok are three of the pages a
     reviewer, or a creator deciding whether to trust us, searches for by name. */
  useEffect(() => allowIndexing(), []);

  return (
    <div className="bg-bg min-h-dvh">
      <header className="border-line border-b">
        <Container>
          <div className="flex h-16 items-center justify-between gap-4">
            <Link
              to="/"
              className="rounded-md focus-visible:outline-2"
              aria-label="Wurx Media Hub, back to the home page"
            >
              <PrismMark className="h-6 w-auto" />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to="/"
                className="text-muted hover:text-accent rounded-md px-2 py-1 text-[0.875rem] font-medium transition-colors"
              >
                Home
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </Container>
      </header>

      <main>
        <Container className="py-14 sm:py-20">
          {/*
            A READING MEASURE, not the full page width. The rest of the product
            fills the width because it is dense with data; a page of prose at
            1280px is unreadable, and this is the one place a max-width is
            right rather than the thing that leaves a gap when you zoom out.
          */}
          <div className="max-w-2xl">
            <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold tracking-[-0.02em]">
              {title}
            </h1>
            <p className="text-faint mt-3 font-mono text-[0.75rem] tracking-[0.1em] uppercase">
              Last updated {updated}
            </p>

            {/*
              `wx-prose` rather than a plugin. Everything below is our own
              markup, and the two type scales it needs are already tokens.
            */}
            <div className="wx-prose mt-10">{children}</div>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
