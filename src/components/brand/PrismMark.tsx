import { useTheme } from '@/components/theme/theme-context';
import { cn } from '@/lib/utils';

/**
 * THE PRISM MARK.
 *
 * The identity is PRISM, by Wurx Media. Wurx is the company; it is no longer
 * the name or the face of this product.
 *
 * THE ARTWORK IS SVG, NOT THE LIVE FONT, and that is deliberate for now. The
 * wordmark is lowercase `prism` in Caprasimo with the letter i replaced by the
 * mark — a small outlined triangle over a rounded stem carrying the spectrum in
 * four stripes. Rendering it live would mean loading Caprasimo on the landing
 * page, which today loads no web fonts at all on purpose. The kit's SVGs are
 * pure geometry with the letters already converted to outlines, so they render
 * identically everywhere with no font at all. When Caprasimo lands for
 * headlines (phase 1b), the live component can replace this without the
 * artwork changing.
 *
 * TWO FILES, NOT A CSS FILTER. The old mark was recoloured per theme with
 * `invert()` and `multiply`, because it was a cream mascot that had to survive
 * a white page. PRISM ships an ink version and a white version, so the right
 * one is chosen rather than a filter guessing at it — and the spectrum stripe,
 * which must never change colour, survives intact. A filter would have shifted
 * it in one of the two themes.
 */
export function PrismMark({
  className,
  height = 26,
  markOnly = false,
  onDark: forceDark,
}: {
  className?: string;
  /** Rendered height in px. */
  height?: number;
  /**
   * Just the i, no word. For the collapsed rail and small square tiles, where
   * the full wordmark would be clipped to something unreadable.
   */
  markOnly?: boolean;
  /**
   * Force the white artwork regardless of theme.
   *
   * For the places whose ground is dark whatever the theme is — the sign-in
   * page sits on an Ink halo even in light mode, and the ink wordmark on it
   * renders as an invisible word beside a floating spectrum stripe, which is
   * how this was found.
   */
  onDark?: boolean;
}) {
  const { resolved } = useTheme();
  const onDark = forceDark ?? resolved === 'dark';

  const file = markOnly
    ? onDark
      ? '/brand/prism-icon-white.svg'
      : '/brand/prism-icon.svg'
    : onDark
      ? '/brand/prism-wordmark-white.svg'
      : '/brand/prism-wordmark.svg';

  return (
    <img
      src={file}
      alt="Prism"
      /* Height drives it; width follows the artwork's own ratio, so neither
         version is ever stretched. */
      style={{ height }}
      className={cn('block w-auto select-none', className)}
      draggable={false}
    />
  );
}
