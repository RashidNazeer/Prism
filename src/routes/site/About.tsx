import { Section, Reveal, Eyebrow } from '@/components/layout/Section';
import { SitePage } from '@/components/site/SitePage';
import { ButtonLink } from '@/components/ui/Button';
import { COMPANY, COMPANY_FACTS } from '@/content/site-pages';

/**
 * Who we are. The page a reviewer opens to find out whether a real company is
 * behind the app, so it carries the registered name, the address and a way to
 * reach a person rather than a founder story.
 */
export function About() {
  return (
    <SitePage
      eyebrow="About"
      title="Wurx Media, and why this hub exists"
      intro="Wurx Media is a TikTok Shop growth agency for 7 and 8 figure brands. Wurx Media Hub is the platform the creators who post for those brands use."
      documentTitle="About us"
    >
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <Reveal>
            <div className="text-muted grid max-w-2xl gap-5 text-lg leading-relaxed">
              <p>
                We are a full-service TikTok Shop agency. We run the shop itself — listings,
                pricing, promotions, compliance — the affiliate programme, paid collaborations
                with hand-picked creators, GMV Max media, a private creator community for each
                brand, and the pipeline that turns winning TikTok videos into Meta ad creative.
                Over that work we have generated more than $100M in GMV for our brand partners,
                across 50+ brands, with a network of 1,000 creators and more than 2B views on
                their content.
              </p>
              <p>
                The hub came out of a problem we could not solve with spreadsheets. A creator
                posts a video, it sells, and nobody tells them how much. Brands hold the
                numbers, agencies hold the numbers, and the person who made the thing gets a
                screenshot at the end of the month, if that.
              </p>
              <p>
                So the hub shows creators their own figures: the GMV their videos made, the
                commission on it, the ad spend we put behind them, the contests they are in and
                the offers made to them. It is the same data our own team works from, on the
                same day.
              </p>
              <p>
                Wurx Media is founder-led: {COMPANY.founders} run the playbook themselves rather
                than handing it to an account manager. We have worked with three major
                e-commerce aggregators, and taken brands to number one in their TikTok Shop
                category.
              </p>
              <p className="text-faint text-base">
                {COMPANY.tagline} The agency side, its case studies and a strategy call are at{' '}
                <a
                  href={COMPANY.site}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent underline-offset-4 hover:underline"
                >
                  wurxmedia.com
                </a>
                .
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="wx-neo-raised rounded-2xl p-7">
              <h2 className="font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
                Company details
              </h2>
              <dl className="mt-6 grid gap-5 text-sm">
                <div>
                  <dt className="text-faint">Registered name</dt>
                  <dd className="mt-1 font-medium">{COMPANY.legalName}</dd>
                </div>
                <div>
                  <dt className="text-faint">Address</dt>
                  <dd className="text-muted mt-1 leading-relaxed">{COMPANY.address}</dd>
                </div>
                <div>
                  <dt className="text-faint">Email</dt>
                  <dd className="mt-1">
                    <a
                      href={`mailto:${COMPANY.email}`}
                      className="text-accent inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      {COMPANY.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Phone</dt>
                  <dd className="mt-1">
                    <a
                      href={COMPANY.phoneHref}
                      className="text-accent inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      {COMPANY.phone}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Agency website</dt>
                  <dd className="mt-1">
                    <a
                      href={COMPANY.site}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      wurxmedia.com
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section className="border-line border-t">
        <Reveal>
          <Eyebrow>By the numbers</Eyebrow>
        </Reveal>
        <dl className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
          <ButtonLink to="/creators" size="lg">
            For creators
          </ButtonLink>
          <ButtonLink to="/contact" variant="secondary" size="lg">
            Contact us
          </ButtonLink>
        </div>
      </Section>
    </SitePage>
  );
}
