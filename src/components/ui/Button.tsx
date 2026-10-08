import { cva, type VariantProps } from 'class-variance-authority';
import { Link } from 'react-router';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The one button in the product. Every call to action goes through this so
 * hover, focus and disabled states can never drift between screens.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium transition-all duration-200 ease-brand',
    'disabled:pointer-events-none disabled:opacity-50',
    // Keyboard focus needs its own indicator: the neo shadows are the only
    // other "edge", and they say nothing about which control has focus. An
    // outline (not a ring) so it never fights the shadow stack for box-shadow.
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  ],
  {
    variants: {
      variant: {
        // Raised like every button, but filled with the accent. The ! is
        // deliberate: wx-neo-raised-sm and wx-neo-press both set background
        // (surface-1, then the pressed surface), which would swallow the accent
        // and leave on-accent text unreadable. The press still reads through
        // the inset shadow; only the fill is held.
        primary:
          'wx-neo-raised-sm wx-neo-press bg-accent! text-on-accent hover:bg-accent-hover! active:bg-accent-hover! disabled:shadow-none',
        // border-line-interactive! replaces the utility's faint hairline:
        // a shadow-only edge fails WCAG 1.4.11 and vanishes under forced-colors,
        // so the 1px boundary must itself clear 3:1.
        secondary:
          'wx-neo-raised-sm wx-neo-press border-line-interactive! hover:text-accent disabled:shadow-none',
        // Flat at rest so a row of ghost actions does not read as a row of
        // buttons; it still sinks on press so a tap is acknowledged.
        ghost: 'text-muted hover:bg-surface-2 hover:text-accent active:wx-neo-pressed',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 rounded-lg px-3.5 text-[0.8125rem]',
        md: 'h-[44px] rounded-xl px-5 text-sm',
        lg: 'h-13 rounded-xl px-7 text-[0.9375rem]',
        xl: 'h-15 rounded-2xl px-9 text-base font-semibold',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

type ButtonVariants = VariantProps<typeof button>;

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<'button'> & ButtonVariants) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}

/** Same look, but renders a router link (or an <a> for external URLs). */
export function ButtonLink({
  to,
  className,
  variant,
  size,
  external,
  children,
  ...props
}: {
  to: string;
  external?: boolean;
  children: ReactNode;
  className?: string;
} & ButtonVariants &
  Omit<ComponentProps<'a'>, 'href' | 'className' | 'children'>) {
  const classes = cn(button({ variant, size }), className);

  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer noopener" className={classes} {...props}>
        {children}
      </a>
    );
  }

  // Same-page anchors must NOT go through the router, <Link to="#how"> is
  // treated as a route change and never scrolls.
  if (to.startsWith('#')) {
    return (
      <a href={to} className={classes} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={classes} {...props}>
      {children}
    </Link>
  );
}
