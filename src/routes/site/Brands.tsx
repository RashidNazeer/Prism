import { Section, Reveal, Eyebrow } from '@/components/layout/Section';
import { SitePage, SiteCard } from '@/components/site/SitePage';
import { ButtonLink } from '@/components/ui/Button';
import { BRAND_INTRO, BRAND_POINTS, COMPANY, COMPANY_FACTS } from '@/content/site-pages';

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
          <Eyebrow>Wurx Media</Eyebrow>
          <h2 className="font-display mt-5 max-w-3xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-extrabold tracking-[-0.02em]">
            The agency behind the hub
          </h2>
          <p className="text-muted mt-5 max-w-2xl leading-relaxed">
            Wurx Media is a TikTok Shop growth agency. The hub is not sold separately: it is how we
            run the creator side of the brands we work with, and how those creators see what their
            work produced.
          </p>
        </Reveal>
        <dl className="mt-10 grid gap-5 sm:grid-cols-3">
          {COMPANY_FACTS.map((f, i) => (
            <Reveal key={f.label} delay={i * 0.06}>
              <div className="border-line bg-surface-1 rounded-2xl border p-7">
                <dt className="font-display wx-numeric text-3xl font-extrabold tracking-[-0.02em]">
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
