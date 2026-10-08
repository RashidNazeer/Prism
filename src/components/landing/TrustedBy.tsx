import { Container, Reveal } from '@/components/layout/Section';
import { STATS } from '@/content/site';
import { BrandMarquee } from './BrandMarquee';

/** Social proof band: the brands we run, then the headline numbers. */
export function TrustedBy() {
  return (
    <section id="brands" className="border-line bg-surface-1 scroll-mt-20 border-y">
      {/* Full-bleed: the marquee runs edge to edge, not inside the container. */}
      <div className="py-9">
        <Container className="pb-7">
          <p className="text-faint text-center font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
            Trusted by creators &amp; brands worldwide
          </p>
        </Container>
        <BrandMarquee />
      </div>

      <Container className="pb-16 sm:pb-20">
        <Reveal>
          <dl className="bg-line grid gap-px overflow-hidden rounded-2xl shadow-md sm:grid-cols-3">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-bg px-6 py-9 text-center">
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="wx-lining font-display block text-[clamp(2rem,5vw,3rem)] leading-none font-extrabold tracking-tight">
                    {stat.value}
                  </span>
                  <span className="text-faint mt-3 block font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </section>
  );
}
