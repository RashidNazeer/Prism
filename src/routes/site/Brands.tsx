import { Section, Reveal, Eyebrow } from '@/components/layout/Section';
import { SitePage, SiteCard } from '@/components/site/SitePage';
import { ButtonLink } from '@/components/ui/Button';
import {
  BRAND_INTRO,
  BRAND_POINTS,
  COMPANY,
  COMPANY_FACTS,
  RESULTS,
  SERVICES,
} from '@/content/site-pages';

/**
 * For brands: what the hub is, from the side that pays for the campaign.
 *
 * The agency itself is sold on wurxmedia.com and this page does not try to
 * repeat it — a second, slightly different pitch for the same company is how
 * two sites end up contradicting each other. This describes the software and
 * sends a brand to the official site to talk to somebody.
 */
export function Brands() {
  return (
    <SitePage
      eyebrow="For brands"
      title="The machinery behind a TikTok Shop creator programme"
      intro={BRAND_INTRO}
      documentTitle="For brands"
    >
      <Section>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {BRAND_POINTS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06}>
              <SiteCard title={p.title}>{p.body}</SiteCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-line border-t">
        <Reveal>
          <Eyebrow>Our services</Eyebrow>
          <h2 className="font-brand mt-5 max-w-3xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-normal tracking-[-0.02em]">
            One connected team, six services
          </h2>
          <p className="text-muted mt-5 max-w-2xl leading-relaxed">
            A content agency delivers videos and the job ends at delivery. Wurx runs whole
            TikTok Shops, which is why a creator budget is an input into a system here rather
            than a production quota.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.05}>
              <SiteCard title={s.title}>{s.body}</SiteCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-line border-t">
        <Reveal>
          <Eyebrow>Results</Eyebrow>
          <h2 className="font-brand mt-5 max-w-3xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-normal tracking-[-0.02em]">
            Real brands, real numbers
          </h2>
        </Reveal>
        <dl className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {RESULTS.map((r, i) => (
            <Reveal key={r.label} delay={i * 0.05}>
              <div className="wx-neo-raised h-full rounded-2xl p-7">
                <dt className="font-brand wx-numeric text-3xl font-normal tracking-[-0.02em]">
                  {r.value}
                </dt>
                <dd className="text-muted mt-2 text-sm leading-relaxed">{r.label}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
        <p className="text-faint mt-6 text-sm">
          Case studies and the full figures are on wurxmedia.com.
        </p>
      </Section>

      <Section className="border-line border-t">
        <Reveal>
          <Eyebrow>Wurx Media</Eyebrow>
          <h2 className="font-brand mt-5 max-w-3xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-normal tracking-[-0.02em]">
            The agency behind the hub
          </h2>
          <p className="text-muted mt-5 max-w-2xl leading-relaxed">
            {COMPANY.tagline} The hub is not sold separately: it is how we run the creator side
            of the brands we work with, and how those creators see what their work produced.
          </p>
        </Reveal>
        <dl className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {COMPANY_FACTS.map((f, i) => (
            <Reveal key={f.label} delay={i * 0.06}>
              <div className="wx-neo-raised rounded-2xl p-7">
                <dt className="font-brand wx-numeric text-3xl font-normal tracking-[-0.02em]">
                  {f.value}
                </dt>
                <dd className="text-muted mt-2 text-sm leading-relaxed">{f.label}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink to={COMPANY.site} external size="lg">
            Talk to Wurx Media
          </ButtonLink>
          <ButtonLink to="/contact" variant="secondary" size="lg">
            Contact us
          </ButtonLink>
        </div>
      </Section>
    </SitePage>
  );
}
