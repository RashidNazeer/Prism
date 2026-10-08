import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { PrismMark } from '@/components/brand/PrismMark';
import { HaloBackdrop } from '@/components/auth/HaloBackdrop';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

/** Shared frame for sign in, sign up and the password screens. */
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
        <Link to="/" className="inline-flex min-h-11 items-center" aria-label="Prism home">
          <PrismMark height={30} />
        </Link>

        {eyebrow ? <div className="mt-9">{eyebrow}</div> : null}

        {/* Back on tokens. These were forced white while the halo was Ink in
            both themes; now the halo follows the theme, so the ordinary ink
            is correct again and light mode is a light page. */}
        <h1
          className={`${eyebrow ? 'mt-4' : 'mt-9'} text-text text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold`}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="text-muted mt-3 leading-relaxed text-pretty">{subtitle}</p>
        ) : null}

        <div className="bg-surface-1 mt-8 rounded-2xl p-6 shadow-lg sm:p-7">{children}</div>

        {footer ? <div className="text-muted mt-6 text-center text-sm">{footer}</div> : null}
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
