import { m } from 'motion/react';
import { BrandChip } from '@/components/brand/BrandWorldShell';
import type { CreatorBrand } from '@/lib/creator/useCreatorBrands';

/**
 * The first thing a creator sees inside a brand.
 *
 * It has to carry the brand on its own, because most brands have no hero image
 * and several have no logo either. So the gradient does the work and the image
 * is a bonus: with a picture it is a photograph with a wash over it, without
 * one it is a deep brand-coloured field with a ring motif, and neither reads as
 * "something failed to load".
 *
 * THE SCRIM IS INSURANCE, NOT THE MECHANISM. Learned on the contest card, on
 * 2026-08-22: a heavy scrim reads fine in light mode and buries the photograph
 * in dark. The words carry a text-shadow, which is legible over anything and
 * costs the picture nothing.
 *
 * AND `cover` CROPS A DIFFERENT EDGE ON EVERY SCREEN. A wide box trims top and
 * bottom, a narrow one trims the sides, so a phone shows the middle of the
 * picture. The crop origin is responsive for that reason. Do not re-tune one
 * without the other.
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
    <header
      className="relative isolate overflow-hidden px-5 pt-8 pb-10 sm:px-8 sm:pt-10 sm:pb-14"
      style={{
        background:
          'linear-gradient(115deg, var(--wx-brand-hero-from), var(--wx-brand-hero-to))',
        color: 'var(--wx-brand-hero-text)',
      }}
    >
      {brand.hero_url ? (
        <>
          <img
            src={brand.hero_url}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-20 h-full w-full object-cover [object-position:30%_50%] sm:[object-position:center_45%]"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                'linear-gradient(115deg, color-mix(in srgb, var(--wx-brand-hero-from) 88%, transparent), color-mix(in srgb, var(--wx-brand-hero-to) 55%, transparent))',
            }}
          />
        </>
      ) : (
        /*
         * NO PICTURE IS A DESIGN, not a gap. Two soft rings, the same motif the
         * mockup used, drawn from the hero's own text colour so they follow the
         * brand and stay faint in both modes.
         */
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <span
            className="absolute -top-40 -right-28 h-[26rem] w-[26rem] rounded-full border"
            style={{ borderColor: 'color-mix(in srgb, var(--wx-brand-hero-text) 16%, transparent)' }}
          />
          <span
            className="absolute -top-24 -right-12 h-[18rem] w-[18rem] rounded-full border"
            style={{ borderColor: 'color-mix(in srgb, var(--wx-brand-hero-text) 10%, transparent)' }}
          />
          <span
            className="absolute -bottom-36 -left-24 h-[16rem] w-[16rem] rounded-full"
            style={{ background: 'color-mix(in srgb, var(--wx-brand-hero-text) 6%, transparent)' }}
          />
        </div>
      )}

      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        className="relative max-w-3xl"
        style={{ textShadow: '0 1px 12px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.28)' }}
      >
        <div className="flex items-center gap-2.5">
          <BrandChip brand={brand} size={34} />
          {brand.tagline ? (
            <span
              className="rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.08em] uppercase"
              style={{
                borderColor: 'color-mix(in srgb, var(--wx-brand-hero-text) 26%, transparent)',
                background: 'color-mix(in srgb, var(--wx-brand-hero-text) 12%, transparent)',
              }}
            >
              {brand.tagline}
            </span>
          ) : null}
        </div>

        <h2 className="font-display mt-4 text-[clamp(2rem,5.2vw,3.6rem)] leading-[0.98] font-semibold tracking-[-0.035em]">
          Create with {brand.name}.
        </h2>

        {brand.description ? (
          <p
            className="mt-3.5 max-w-xl text-[0.9375rem] leading-relaxed sm:text-[1rem]"
            style={{ color: 'var(--wx-brand-hero-muted)' }}
          >
            {brand.description}
          </p>
        ) : null}

        {offerCount > 0 ? (
          <button
            type="button"
            onClick={onExplore}
            className="mt-6 rounded-md px-4 py-2.5 text-[0.875rem] font-bold shadow-lg transition hover:-translate-y-px"
            style={{
              background: 'var(--wx-brand-accent)',
              color: 'var(--wx-brand-accent-text)',
            }}
          >
            {offerCount === 1 ? 'See the offer' : `See all ${offerCount} offers`}
          </button>
        ) : null}
      </m.div>
    </header>
  );
}
