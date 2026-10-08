import { m } from 'motion/react';
import { ArrowRight } from 'lucide-react';
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
      /*
       * THE HERO NEEDS A HEIGHT OF ITS OWN, or it is only as tall as its words.
       *
       * Measured on 2026-08-24: with no minimum, the box ran from 1.41:1 on a
       * phone to 5.31:1 on a 1920 monitor, because the width grows and the text
       * does not. `object-fit: cover` then threw away 72% of the picture's
       * height on a wide screen, which is exactly the "fitted but zoomed"
       * Rashid reported. No single export ratio can serve a box that moves that
       * far, so the box is pinned instead: it now runs 1.46:1 to about 3.7:1,
       * and a 2.4:1 image sits inside that with a sensible margin either way.
       *
       * The steps are `rem`, so they follow the text-size setting rather than
       * clipping the words at Large.
       */
      className="relative isolate flex min-h-[16rem] flex-col justify-center overflow-hidden px-5 pt-8 pb-10 sm:min-h-[18rem] sm:px-8 sm:pt-10 sm:pb-14 lg:min-h-[21rem] xl:min-h-[24rem] 2xl:min-h-[28rem]"
      /*
       * THE ANGLE AND THE STOPS ARE THE ADMIN'S NOW, not this file's.
       *
       * It used to hardcode `linear-gradient(115deg, from, to)`, which was the
       * right call while a hero was always two derived colours. From 2026-08-25
       * a brand can carry up to four, in an order and at an angle somebody
       * chose, and none of that can be expressed by naming two ends. The whole
       * value arrives assembled in `--wx-brand-hero-wash`, and a brand that
       * customised nothing still gets exactly 115 degrees from-to.
       */
      style={{
        background: 'var(--wx-brand-hero-wash)',
        color: 'var(--wx-brand-hero-text)',
      }}
    >
      {brand.hero_url ? (
        <>
          <img
            src={brand.hero_url}
            alt=""
            aria-hidden
            /*
             * WHICH PART SURVIVES THE CROP, and the two ends disagree, so they
             * are set separately.
             *
             * A wide screen shows the whole WIDTH and trims top and bottom, so
             * the headline sits over the left of the picture and the subject
             * belongs on the right. A phone shows the whole HEIGHT and trims
             * the SIDES, so a left-anchored crop would cut off exactly that
             * subject. 58% keeps the right-of-centre band, which is where the
             * upload guidance in OPERATIONS asks for the product.
             */
            className="absolute inset-0 -z-20 h-full w-full object-cover [object-position:58%_50%] sm:[object-position:center_50%]"
          />
          {/*
            THE SCRIM CLEARS THE PICTURE, and this is the correction to the
            first version, which laid 88% brand colour over the whole frame and
            turned a product photograph into a flat wash of the brand's hue.

            The words sit on the LEFT, so that is the only place the tint needs
            to be heavy. It falls away across the frame and is gone by about
            three quarters, which leaves the right-hand side of the photograph
            actually visible. Legibility is carried by the text-shadow on the
            words, exactly as on the contest card: the scrim is insurance for a
            blown-out upload, not the mechanism.

            Below `sm` the text spans the whole width, so there is no left
            column to protect and it becomes a bottom-up wash instead.
          */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 sm:hidden"
            style={{
              background:
                'linear-gradient(to top, color-mix(in srgb, var(--wx-brand-hero-from) 92%, transparent) 0%, color-mix(in srgb, var(--wx-brand-hero-from) 74%, transparent) 55%, color-mix(in srgb, var(--wx-brand-hero-from) 48%, transparent) 100%)',
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 hidden sm:block"
            style={{
              background:
                'linear-gradient(100deg, color-mix(in srgb, var(--wx-brand-hero-from) 94%, transparent) 0%, color-mix(in srgb, var(--wx-brand-hero-from) 76%, transparent) 34%, color-mix(in srgb, var(--wx-brand-hero-from) 26%, transparent) 62%, transparent 82%)',
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
            style={{
              borderColor: 'color-mix(in srgb, var(--wx-brand-hero-text) 16%, transparent)',
            }}
          />
          <span
            className="absolute -top-24 -right-12 h-[18rem] w-[18rem] rounded-full border"
            style={{
              borderColor: 'color-mix(in srgb, var(--wx-brand-hero-text) 10%, transparent)',
            }}
          />
          <span
            className="absolute -bottom-36 -left-24 h-[16rem] w-[16rem] rounded-full"
            style={{
              background: 'color-mix(in srgb, var(--wx-brand-hero-text) 6%, transparent)',
            }}
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

        <h2 className="font-brand mt-4 text-[clamp(2rem,5.2vw,3.6rem)] leading-[0.98] font-semibold tracking-[-0.035em]">
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
          /*
           * LARGE AND TRANSPARENT, which is what Rashid asked for: "see the
           * offer button in hero image should be large transparent type".
           *
           * A solid accent button on top of a photograph is a second poster
           * competing with the picture. Glass instead: the hero's own text
           * colour at low opacity, a hairline border and a blur, so the image
           * carries on behind it and the button reads as part of the hero
           * rather than as something dropped on it.
           *
           * IT STILL HAS TO BE A BUTTON, THOUGH. Glass over an unknown
           * photograph is exactly where a control disappears, so it keeps the
           * text-shadow of the block it sits in, and it fills solid on hover so
           * the affordance is unmistakable once a cursor is near it.
           */
          <button
            type="button"
            onClick={onExplore}
            className="group/cta mt-7 inline-flex items-center gap-2.5 rounded-lg border px-6 py-3.5 text-[0.9375rem] font-bold backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl"
            style={{
              borderColor: 'color-mix(in srgb, var(--wx-brand-hero-text) 45%, transparent)',
              background: 'color-mix(in srgb, var(--wx-brand-hero-text) 12%, transparent)',
              color: 'var(--wx-brand-hero-text)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--wx-brand-hero-text)';
              e.currentTarget.style.color = 'var(--wx-brand-hero-from)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                'color-mix(in srgb, var(--wx-brand-hero-text) 12%, transparent)';
              e.currentTarget.style.color = 'var(--wx-brand-hero-text)';
            }}
          >
            {offerCount === 1 ? 'See the offer' : `See all ${offerCount} offers`}
            <ArrowRight
              size={17}
              aria-hidden
              className="transition-transform duration-300 group-hover/cta:translate-x-1"
            />
          </button>
        ) : null}
      </m.div>
    </header>
  );
}
