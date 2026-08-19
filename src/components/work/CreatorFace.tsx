import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A creator's face, on an admin screen.
 *
 * ONE COMPONENT FOR EVERY LIST, so a person looks the same in the Creators
 * roster, the applications queue, the content queue and a brand's table. Two
 * ways of drawing the same human is how a screen stops feeling like one
 * product.
 *
 * THE INITIAL IS ALWAYS THERE, UNDERNEATH. It is not a fallback that appears
 * when something fails; it is the base state, and the photograph fades in on
 * top once it has actually decoded. The first version drew the image with a
 * surface behind it, and a page of forty faces opened as a page of blank pale
 * discs while four megabytes arrived. A letter that becomes a face reads as
 * loading; an empty circle reads as broken.
 *
 * So a creator with no picture, a picture that has gone missing from the
 * bucket, and one still on its way all look the same for as long as that is
 * true: their initial, in the brand gold, exactly as the sidebar already draws
 * the signed-in person.
 *
 * NOT the vendored WurxBase treatment, which hashes the name into one of seven
 * hardcoded gradients. Those are indigo, pink, teal and orange, none of which
 * is in this product's palette, and a colour that means nothing is noise.
 */
export function CreatorFace({
  src,
  name,
  handle,
  size = 36,
  className,
}: {
  /** Signed URL from `useCreatorAvatars`. Undefined is normal, not an error. */
  src?: string | null;
  name?: string | null;
  handle?: string | null;
  /** Rendered size in px. A number, so a table row can ask for exactly one. */
  size?: number;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  const label = (name ?? handle ?? '').trim();
  const initial = label.charAt(0).toUpperCase() || '?';

  return (
    /*
     * `aria-hidden` on the whole thing. The name is written beside this in every
     * place it is used, and a screen reader announcing "Brooke Jackson, image,
     * Brooke Jackson" is worse than one that reads the name once.
     */
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={cn(
        'ring-line relative grid shrink-0 place-items-center overflow-hidden rounded-full ring-1 select-none',
        // The base state, and the thing you see first, every time.
        'bg-accent-soft text-accent font-mono font-bold uppercase',
        className
      )}
    >
      {initial}

      {src && !broken ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          // Below the fold in a long queue, which is most of them.
          loading="lazy"
          decoding="async"
          draggable={false}
          /*
           * BOTH, and the ref is the one that matters. An image already in the
           * browser cache can finish before React attaches onLoad, and then
           * that handler never fires and the photograph sits at zero opacity
           * for ever. It looked like the pictures had stopped working
           * altogether on the second visit to a screen. `complete` with a real
           * width is the only reliable way to ask "is it already here".
           */
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-200',
            // Only once it has decoded. Fading in a half-drawn image is how you
            // get a flicker instead of an arrival.
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      ) : null}
    </span>
  );
}
