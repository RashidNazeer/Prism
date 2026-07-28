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
}: {
  className?: string;
  /** Rendered height in px. The source is 2x this by default, so it stays crisp. */
  height?: number;
}) {
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
