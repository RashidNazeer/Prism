import { Link } from 'react-router';
import { Section, Reveal } from '@/components/layout/Section';
import { SitePage } from '@/components/site/SitePage';
import { ButtonLink } from '@/components/ui/Button';
import { COMPANY } from '@/content/site-pages';

/**
 * How to reach a person. Every route here is one somebody actually answers:
 * the company email and phone from wurxmedia.com, and the application form.
 *
 * No contact FORM on purpose. A form that posts into a mailbox nobody has
 * confirmed is worse than an address a reviewer can see and test, and the
 * application already collects what we need from a creator.
 */
export function Contact() {
  return (
    <SitePage
      eyebrow="Contact"
      title="Talk to us"
      intro="Creators, brands and anyone reviewing the app: these reach the same team."
      documentTitle="Contact"
    >
      <Section>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Reveal>
            <div className="border-line bg-surface-1 h-full rounded-2xl border p-7">
              <h2 className="text-lg font-bold">Email</h2>
              <p className="text-muted mt-3 leading-relaxed">
                The fastest way to reach us, for creators and brands alike.
              </p>
              <a
                href={`mailto:${COMPANY.email}`}
                className="text-accent mt-4 inline-block font-medium underline-offset-4 hover:underline"
              >
                {COMPANY.email}
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="border-line bg-surface-1 h-full rounded-2xl border p-7">
              <h2 className="text-lg font-bold">Phone</h2>
              <p className="text-muted mt-3 leading-relaxed">
                Office hours, United States Mountain Time.
              </p>
              <a
                href={COMPANY.phoneHref}
                className="text-accent mt-4 inline-block font-medium underline-offset-4 hover:underline"
              >
                {COMPANY.phone}
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="border-line bg-surface-1 h-full rounded-2xl border p-7">
              <h2 className="text-lg font-bold">Post</h2>
              <p className="text-muted mt-3 leading-relaxed">{COMPANY.legalName}</p>
              <p className="text-muted mt-1 leading-relaxed">{COMPANY.address}</p>
            </div>
          </Reveal>
        </div>

        <Reveal>
          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-[-0.02em]">
                Who answers what
              </h2>
              <dl className="text-muted mt-6 grid gap-5 leading-relaxed">
                <div>
                  <dt className="text-text font-semibold">Creators</dt>
                  <dd className="mt-1">
                    Questions about an application, a deal, a payment or your figures. If you have
                    not applied yet, use the form rather than email — it reaches the people hiring
                    this month.
                  </dd>
                </div>
                <div>
                  <dt className="text-text font-semibold">Brands</dt>
                  <dd className="mt-1">
                    TikTok Shop growth, creator programmes and what a campaign with us looks like.
                    The agency side is at wurxmedia.com, and the same team answers both.
                  </dd>
                </div>
                <div>
                  <dt className="text-text font-semibold">Privacy and account deletion</dt>
                  <dd className="mt-1">
                    Ask us what we hold about you, correct it, or have it deleted. We answer these
                    ourselves rather than through a form, and the Privacy page explains what we
                    keep and for how long.
                  </dd>
                </div>
                <div>
                  <dt className="text-text font-semibold">App reviewers and partners</dt>
                  <dd className="mt-1">
                    Write to the same address and say what you need. It reaches a person, not a
                    ticket queue.
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-[-0.02em]">
                What to expect
              </h2>
              <p className="text-muted mt-6 leading-relaxed">
                We are a small team and we answer email ourselves, usually within one working day.
                Wurx Media works United States hours, so a message sent overnight is read the next
                morning Mountain Time.
              </p>
              <p className="text-muted mt-4 leading-relaxed">
                If your question is about a specific video, deal or payment, tell us the brand and
                the month. Our records are kept per brand and per month, so naming both gets you a
                precise answer instead of a request for more detail.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="border-line bg-surface-1 mt-12 rounded-2xl border p-7">
            <h2 className="text-lg font-bold">Want to create for our brands?</h2>
            <p className="text-muted mt-3 max-w-2xl leading-relaxed">
              Apply rather than email, and your application reaches the people hiring this month.
              It takes a minute and costs nothing.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink to="/apply" size="lg">
                Apply to join
              </ButtonLink>
              <ButtonLink to={COMPANY.site} external variant="secondary" size="lg">
                wurxmedia.com
              </ButtonLink>
            </div>
          </div>
        </Reveal>

        <p className="text-muted mt-8 leading-relaxed">
          To ask what we hold about you, or to have it deleted, see{' '}
          <Link to="/privacy" className="text-accent underline-offset-4 hover:underline">
            Privacy
          </Link>
          . To disconnect a TikTok account, see{' '}
          <Link to="/tiktok" className="text-accent underline-offset-4 hover:underline">
            Connecting TikTok
          </Link>
          .
        </p>
      </Section>
    </SitePage>
  );
}
