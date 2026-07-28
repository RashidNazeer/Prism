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
    'active:translate-y-px',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-hover shadow-sm hover:shadow-md',
        secondary:
          'border border-line-interactive bg-surface-1 hover:border-accent hover:text-accent',
        ghost: 'text-muted hover:bg-surface-2 hover:text-accent',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 rounded-lg px-3.5 text-[13px]',
        md: 'h-11 rounded-xl px-5 text-sm',
        lg: 'h-13 rounded-xl px-7 text-[15px]',
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

  // Same-page anchors must NOT go through the router — <Link to="#how"> is
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
