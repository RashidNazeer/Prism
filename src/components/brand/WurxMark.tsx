import { cn } from '@/lib/utils';
import logo from '@/assets/wurx-logo.png';

/**
 * The Wurx Media logo, taken from wurxmedia.com and downscaled to 228x64
 * (from 1641x460, which was 125 KB for a 28px-tall slot).
 *
 * The artwork is cream, drawn for a dark background, so light mode darkens it
 * through `--wx-mark-filter`. That token uses brightness(), which multiplies
 * each channel and therefore keeps the mascot's internal contrast instead of
 * flattening it into a black blob the way a plain invert would.
 */
export function WurxMark({
  className,
  height = 26,
  markOnly = false,
}: {
  className?: string;
  /** Rendered height in px. The source is 2x this by default, so it stays crisp. */
  height?: number;
  /**
   * Just the mascot, no wordmark. For the collapsed sidebar rail, where there
   * is no room for the words and simply clipping the full logo leaves a
   * half-cut "WURX" that reads as a broken image rather than a mark.
   */
  markOnly?: boolean;
}) {
  if (markOnly) {
    // A square window on the left of the artwork, which is where the mascot
    // sits. `cover` scales it to fill that square rather than squashing it.
    return (
      <span className={cn('inline-flex items-center', className)}>
        <img
          src={logo}
          alt="Wurx Media"
          style={{
            height,
            width: height,
            objectFit: 'cover',
            objectPosition: 'left center',
            filter: 'var(--wx-mark-filter)',
          }}
          className="select-none"
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center', className)}>
      <img
        src={logo}
        alt="Wurx Media"
        width={Math.round(height * (228 / 64))}
        height={height}
        style={{ height, filter: 'var(--wx-mark-filter)' }}
        className="w-auto select-none"
        draggable={false}
      />
    </span>
  );
}
