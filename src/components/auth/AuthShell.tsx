import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { WurxMark } from '@/components/brand/WurxMark';
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
        <div className="wx-grid absolute inset-0" />
        <div className="wx-glow absolute inset-0" />
      </div>

      <div className="absolute top-6 right-5 sm:right-8">
        <ThemeToggle />
      </div>

      <main className="relative w-full max-w-md">
        <Link to="/" className="inline-flex" aria-label="WurxMediaHub home">
          <WurxMark />
        </Link>

        {eyebrow ? <div className="mt-9">{eyebrow}</div> : null}

        <h1
          className={`${eyebrow ? 'mt-4' : 'mt-9'} text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold`}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-3 leading-relaxed text-muted text-pretty">{subtitle}</p>
        ) : null}

        <div className="mt-8 rounded-2xl border border-line bg-surface-1 p-6 shadow-lg sm:p-7">
          {children}
        </div>

        {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
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
      className="mb-5 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-[0.875rem] leading-relaxed text-danger"
    >
      {children}
    </p>
  );
}
