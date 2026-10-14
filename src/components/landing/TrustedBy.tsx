import { Container, CountUp, Reveal } from '@/components/layout/Section';
import { TiltCard, TiltLift } from '@/components/ui/TiltCard';
import { TiltedGridHero } from '@/components/ui/TiltedGridHero';
import { BRANDS, STATS } from '@/content/site';

/*
 * HIS THREE, AS INK. THESE ARE ALREADY THE PALETTE.
 *
 * It reads like the violet/blue/teal the sweep was sent to remove and it is
 * not: `--wx-accent`, `--wx-info` and `--wx-success` are the DARKENED FORMS of
 * mint, sky and periwinkle, same hue angle, both themes:
 *
 *   #DEFCF9 mint  174deg  ->  --wx-success  #14b5a5 / #0c6c62   174deg
 *   #CADEFC sky   214deg  ->  --wx-info     #6fa3f1 / #145cc8   214-218deg
 *   #C3BEF0 peri  247deg  ->  --wx-accent   #9b93e6 / #5b4dd5   246-248deg
 *
 * MEASURED, AND THAT IS WHY THEY ARE NOT THE PASTELS. These went to
 * mint/sky/peri first — three 4px rules felt like the one place in the product
 * that wants all three swatches at once. Read back off the rendered page in the
 * light theme, against the raised card they sit on: mint 1.08:1, sky 1.37:1,
 * peri 1.76:1. A rule at 1.08:1 is not a faint rule, it is an absent one, and
 * two of the three figures lost their mark entirely.
 *
 * A 4px rule is a HAIRLINE, so the rule from the brief applies to it the way it
 * applies to a border, not the way it applies to a chart bar: a bar is read as
 * an area and a hairline is read as a line. The ink is his colour at a
 * lightness a line can actually be seen at.
 *
 * The ORDER is left exactly as it was — violet first, because it is the
 * interactive one. Nothing in the brief asks these three to run in palette
 * order; the fixed order it does ask for is the chart ramp in `VelocityChart`,
 * where the position of a mark on the ramp is carrying meaning.
 */
const BARS = ['bg-accent', 'bg-info', 'bg-success'] as const;

/**
 * The brand roster, as the curved band wants it. `h` carries straight
 * through: it is the per-logo optical weighting the flat marquee used, and
 * the band still honours the ratio between the values.
 */
const BRAND_MARKS = BRANDS.map((brand) => ({
  src: brand.logo,
  alt: brand.name,
  h: brand.h,
}));

/** Social proof band: the brands we run, then the headline numbers. */
export function TrustedBy() {
  return (
    <section id="brands" className="scroll-mt-20">
      {/* Full-bleed: the band runs edge to edge, not inside the container. */}
      <div className="py-9">
        <Container className="pb-7">
          <p className="text-faint text-center font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
            Trusted by creators &amp; brands worldwide
          </p>
        </Container>
        {/* The band is a size container, so its height has to be stated
            rather than left to the content. */}
        <TiltedGridHero images={BRAND_MARKS} className="h-52 w-full sm:h-60 lg:h-64" />
      </div>

      <Container className="pt-4 pb-16 sm:pb-20">
        {/* Three raised cards that rise out of the page one after another, each
            at its own distance, rather than one strip fading in. The figure
            floats above its own card on `TiltLift`, as on the step cards. */}
        <ul className="grid gap-5 sm:grid-cols-3">
          {STATS.map((stat, i) => (
            <li key={stat.label}>
              <Reveal
                depth={{
                  rise: 90 + i * 50,
                  tilt: 24,
                  from: 0.84,
                  roll: (i - 1) * 5,
                  settle: 0.7,
                }}
                className="h-full"
              >
                <TiltCard className="wx-neo-raised h-full rounded-2xl px-6 py-9 text-center">
                  <span
                    className={`${BARS[i] ?? 'bg-accent'} mx-auto mb-6 block h-1 w-10 rounded-full`}
                    aria-hidden
                  />
                  <TiltLift depth={22}>
                    {/* Counts up to the real figure as the card arrives, each
                        a beat after the last. */}
                    <CountUp
                      value={stat.value}
                      delay={i * 180}
                      className="wx-lining font-brand block text-[clamp(2rem,5vw,3rem)] leading-none tracking-tight tabular-nums"
                    />
                  </TiltLift>
                  <span className="text-faint mt-3 block font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
                    {stat.label}
                  </span>
                </TiltCard>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
