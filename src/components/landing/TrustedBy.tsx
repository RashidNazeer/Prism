import { Container, Reveal } from '@/components/layout/Section';
import { BRANDS, STATS } from '@/content/site';

/**
 * Social proof band: the brands we run, then the headline numbers.
 *
 * Brand entries with no `logo` render as a monochrome wordmark, which is both a
 * decent placeholder and a legitimate final state — plenty of real logo rows are
 * just wordmarks. See src/content/site.ts to fill in the real list.
 */
export function TrustedBy() {
  return (
    <section
      id="brands"
      className="scroll-mt-20 border-y border-line bg-surface-1/40 py-16 sm:py-20"
    >
      <Container>
        <Reveal>
          <p className="text-center font-mono text-[11px] tracking-[0.18em] text-faint uppercase">
            Trusted by creators &amp; brands worldwide
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <ul className="mt-10 grid grid-cols-2 items-center gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
            {BRANDS.map((brand) => (
              <li key={brand.name} className="flex items-center justify-center">
                {brand.logo ? (
                  <img
                    src={brand.logo}
                    alt={brand.name}
                    loading="lazy"
                    className="h-7 w-auto max-w-full object-contain opacity-60 grayscale transition-all duration-300 ease-brand hover:opacity-100 hover:grayscale-0"
                  />
                ) : (
                  <span className="font-display text-base font-bold tracking-tight text-faint uppercase transition-colors duration-300 ease-brand hover:text-muted">
                    {brand.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1}>
          <dl className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-surface-1 px-6 py-9 text-center">
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="wx-numeric block font-display text-[clamp(2rem,5vw,3rem)] leading-none font-extrabold tracking-tight">
                    {stat.value}
                  </span>
                  <span className="mt-3 block font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
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
