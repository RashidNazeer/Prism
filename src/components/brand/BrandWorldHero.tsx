import { m } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { CreatorBrand } from '@/lib/creator/useCreatorBrands';

/** A brand's logo, or its initial on an accent-tinted square when it has none. */
export function BrandChip({ brand, size = 28 }: { brand: CreatorBrand; size?: number }) {
  const style = { width: size, height: size };
  if (brand.logo_url) {
    return (
      <img
        src={brand.logo_url}
        alt=""
        style={style}
        className="shrink-0 rounded-lg object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <span
      style={{
        ...style,
        background: 'color-mix(in srgb, var(--wx-accent) 22%, transparent)',
      }}
      className="text-text grid shrink-0 place-items-center rounded-lg text-[0.75rem] font-bold"
      aria-hidden
    >
      {brand.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * The first thing a creator sees inside a brand: a PRISM card wearing the
 * brand's accent, not a banner.
 *
 * REDESIGNED 2026-10-12. It used to be a full-bleed slab of the brand's colour
 * four to eight rows tall, above a void. The brief for the hub is "who they are,
 * what they sell, what they want from me", and a slab answers none of it, so the
 * hero is now one compact raised card. The brand shows up as three restrained
 * things only: a soft accent bloom in one corner, the accent on the logo chip
 * and the call to action, and the brand's picture (when it has one) as a framed
 * panel at the side rather than a backdrop behind the words.
 *
 * All text is PRISM's own ink on PRISM's own surface, so it is readable in both
 * themes for any colour an admin could pick. The accent never sits behind text.
 */
export function BrandWorldHero({
  brand,
  offerCount,
  onExplore,
}: {
  brand: CreatorBrand;
  offerCount: number;
  onExplore: () => void;
}) {
  return (
    <header className="wx-neo-raised relative isolate overflow-hidden rounded-xl">
      {/* THE CORNER MOTIF. One bloom of the accent, faint, top right. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 -z-10 size-72 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--wx-accent) 20%, transparent), transparent)',
        }}
      />

      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-center md:justify-between"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <BrandChip brand={brand} size={44} />
            <div className="min-w-0">
              <h2 className="font-brand text-[clamp(1.375rem,3.4vw,2rem)] leading-tight font-semibold tracking-[-0.02em] break-words">
                {brand.name}
              </h2>
              {brand.tagline ? (
                <p className="text-muted mt-0.5 text-[0.875rem] break-words">{brand.tagline}</p>
              ) : null}
            </div>
          </div>

          {offerCount > 0 ? (
            <Button variant="primary" size="md" className="mt-5" onClick={onExplore}>
              {offerCount === 1 ? 'See the offer' : `See all ${offerCount} offers`}
              <ArrowRight size={16} aria-hidden />
            </Button>
          ) : null}
        </div>

        {brand.hero_url ? (
          <div className="wx-neo-inset aspect-[16/9] w-full shrink-0 overflow-hidden rounded-lg md:w-72 lg:w-96">
            <img
              src={brand.hero_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          </div>
        ) : null}
      </m.div>
    </header>
  );
}
