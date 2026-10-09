import { Container, CountUp, Reveal } from '@/components/layout/Section';
import { TiltCard, TiltLift } from '@/components/ui/TiltCard';
import { STATS } from '@/content/site';
import { BrandMarquee } from './BrandMarquee';

/** One spectrum accent per figure, violet first because it is the interactive one. */
const BARS = ['bg-accent', 'bg-info', 'bg-success'] as const;

/** Social proof band: the brands we run, then the headline numbers. */
export function TrustedBy() {
  return (
    <section id="brands" className="bg-bg scroll-mt-20">
      {/* Full-bleed: the marquee runs edge to edge, not inside the container. */}
      <div className="py-9">
        <Container className="pb-7">
          <p className="text-faint text-center font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
            Trusted by creators &amp; brands worldwide
          </p>
        </Container>
        <BrandMarquee />
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
                      className="wx-lining font-display block text-[clamp(2rem,5vw,3rem)] leading-none font-extrabold tracking-tight tabular-nums"
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
