import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { PrismMark } from '@/components/brand/PrismMark';
import { HaloBackdrop } from '@/components/auth/HaloBackdrop';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

/**
 * Shared frame for sign in, sign up and the password screens.
 *
 * ONE CARD, CENTRED. Rashid, 2026-10-10. The mark, the heading, the subtitle
 * and the footer used to sit on the page with only the form in a card, so the
 * screen read as four loose things above a box rather than one door into the
 * product. They are all in the card now, centred on its axis.
 *
 * THE GAP THAT WAS NOT SYMMETRIC. The mark sits in a `min-h-11` link, because
 * 44px is the tap floor and a logo that is also the way home has to be tappable.
 * A 30px mark inside a 44px box leaves 7px of slack above and below it, and the
 * heading then added `mt-9` on top of that: about 43px of emptiness under the
 * logo against 36px above it, which is what Rashid drew a red box around. The
 * stack is one flex column with ONE `gap` now, so every gap in the header is
 * the same measurement and no element gets to add its own.
 *
 * FIELD LABELS STAY LEFT ALIGNED, deliberately, and they are the one thing here
 * that is not centred. A label centred over its input moves the start of the
 * text with the length of the word, so the eye has to find the beginning of
 * each one instead of running down a single edge. Centring the furniture around
 * a form is a look; centring the form itself costs the person filling it in.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Small label above the heading. Used to mark the staff door as staff. */
  eyebrow?: ReactNode;
}) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10 sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* The halo replaces the old grid and glow. Both drew the Wurx
            language, and two decorative layers under a WebGL field is one
            more than the page needs. */}
        <HaloBackdrop className="absolute inset-0" />
      </div>

      <div className="absolute top-6 right-5 sm:right-8">
        <ThemeToggle />
      </div>

      <main className="relative w-full max-w-md">
        <div className="wx-neo-raised flex flex-col items-center gap-4 rounded-2xl p-6 text-center sm:p-8">
          <Link
            to="/"
            className="inline-grid min-h-11 place-items-center"
            aria-label="Prism home"
          >
            <PrismMark height={30} />
          </Link>

          {eyebrow}

          {/* Back on tokens. These were forced white while the halo was Ink in
              both themes; now the halo follows the theme, so the ordinary ink
              is correct again and light mode is a light page. */}
          <div className="flex flex-col gap-2">
            <h1 className="text-text font-brand text-[clamp(1.75rem,4vw,2.25rem)] leading-[1.15] font-normal">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-muted leading-relaxed text-pretty">{subtitle}</p>
            ) : null}
          </div>

          {/* The form keeps its own alignment inside the centred card. */}
          <div className="mt-2 w-full text-left">{children}</div>

          {footer ? <div className="text-muted text-sm">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

/** A red banner for the one error that applies to the whole form. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="bg-danger-soft text-danger mb-5 rounded-xl px-4 py-3 text-[0.875rem] leading-relaxed"
    >
      {children}
    </p>
  );
}
