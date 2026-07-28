import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/** Page gutter + max width. Every section uses this so nothing drifts. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('mx-auto w-full max-w-6xl px-6', className)}>{children}</div>;
}

/** Vertical rhythm for a page section. */
export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // scroll-mt clears the fixed header so anchor jumps don't hide the heading.
    <section id={id} className={cn('scroll-mt-20 py-20 sm:py-28', className)}>
      <Container>{children}</Container>
    </section>
  );
}

/**
 * Small uppercase label above a section heading. Monospace and letter-spaced,
 * with a live gold dot — the one recurring motif across the marketing page.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
      <span className="size-1.5 rounded-full bg-accent" aria-hidden />
      {children}
    </span>
  );
}

/**
 * Fades content up as it scrolls into view. `once` so a section never
 * re-animates when the user scrolls back — that reads as jittery, not polished.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
