import { BRANDS } from '@/content/site';

/**
 * Infinite logo marquee.
 *
 * The list is rendered twice; CSS slides the track exactly -50% so the second
 * copy arrives where the first began. No JavaScript, no animation library, no
 * scroll listeners.
 *
 * The logos are white artwork on opaque black, so they are blended rather than
 * drawn flat: `screen` in dark mode drops the black away, and in light mode the
 * image is inverted first and then `multiply` drops the white away. Without
 * that, light mode would show eight black rectangles.
 */
function LogoRow({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center" aria-hidden={ariaHidden || undefined}>
      {BRANDS.map((brand) => (
        <li key={brand.name} className="flex shrink-0 items-center">
          <img
            src={brand.logo}
            alt={ariaHidden ? '' : brand.name}
            loading="lazy"
            decoding="async"
            style={{ height: brand.h ?? 32 }}
            className="wx-logo w-auto max-w-none opacity-80 transition-opacity duration-300 ease-brand hover:opacity-100"
            draggable={false}
          />
          <span className="px-8 text-lg leading-none text-accent select-none sm:px-11" aria-hidden>
            &middot;
          </span>
        </li>
      ))}
    </ul>
  );
}

export function BrandMarquee() {
  return (
    <div className="wx-marquee">
      <div className="wx-marquee-track">
        <LogoRow />
        <LogoRow ariaHidden />
      </div>
    </div>
  );
}
