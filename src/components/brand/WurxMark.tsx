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
/**
 * Where the mascot actually sits inside `wurx-logo.png`, in source pixels.
 * Measured off the file's own alpha channel, not eyeballed. See `markOnly`.
 */
const MARK = { x: 5, y: 5, w: 73, h: 50, imgW: 228, imgH: 64 } as const;

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
    /*
     * THE MASCOT IS NOT SQUARE, so a square window cuts its face off.
     *
     * This drew a `height × height` box with `object-fit: cover` and
     * `object-position: left center`, on the assumption that the mascot sits in
     * a square at the left of the artwork. It does not. Measured off the asset
     * itself: the mascot occupies x 5..78 and y 5..54 of a 228×64 image, so it
     * is 73 wide by 50 tall — an aspect of 1.46. Cropping that to a square at
     * the same height threw away the rightmost 15% of it, which is the side of
     * its head, and Rashid spotted it the moment he collapsed the rail.
     *
     * So the region is cut out by hand rather than guessed at: the artwork is a
     * background, scaled so the mascot's 50px height becomes the height asked
     * for, and offset so its top-left corner lands at 0,0. The box is then
     * exactly the mascot and nothing else, at any size.
     *
     * If the logo file is ever replaced, re-measure it. Nothing here can tell
     * that these numbers have stopped matching the artwork.
     */
    const scale = height / MARK.h;
    return (
      <span
        role="img"
        aria-label="Wurx Media"
        className={cn('inline-block shrink-0 select-none', className)}
        style={{
          width: Math.round(MARK.w * scale),
          height,
          backgroundImage: `url(${logo})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${MARK.imgW * scale}px ${MARK.imgH * scale}px`,
          backgroundPosition: `${-MARK.x * scale}px ${-MARK.y * scale}px`,
          filter: 'var(--wx-mark-filter)',
        }}
      />
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
