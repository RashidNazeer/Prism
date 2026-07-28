import { cn } from '@/lib/utils';

/**
 * PLACEHOLDER MARK.
 *
 * Rashid has not supplied the real Wurx logo file yet, and wurxmedia.com uses a
 * typographic wordmark rather than a logo image, so this is a geometric "W"
 * built from two chevrons in the brand gold. It uses `currentColor` for the
 * wordmark and the accent token for the glyph, so it themes correctly in both
 * light and dark without any extra work.
 *
 * TO REPLACE: drop the real SVG in `src/components/brand/` and swap the <svg>
 * body below. Nothing else in the app needs to change — every usage goes
 * through this component.
 */
export function WurxMark({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        className="size-7 shrink-0"
        role="img"
        aria-label="Wurx Media"
      >
        <rect width="32" height="32" rx="8" fill="var(--wx-accent)" />
        <path
          d="M7 10.5 L11.2 21.5 L16 13.8 L20.8 21.5 L25 10.5"
          stroke="var(--wx-on-accent)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span className="font-display text-[15px] leading-none font-bold tracking-tight">
          WURX<span className="text-accent">.</span>
        </span>
      )}
    </span>
  );
}
