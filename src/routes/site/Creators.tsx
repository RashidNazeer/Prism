import { Link } from 'react-router';
import { Section, Reveal, Eyebrow } from '@/components/layout/Section';
import { SitePage, SiteCard } from '@/components/site/SitePage';
import { ButtonLink } from '@/components/ui/Button';
import {
  CREATOR_INTRO,
  CREATOR_POINTS,
  CREATOR_PROMISES,
  CREATOR_WORKING,
} from '@/content/site-pages';

/**
 * For creators: what the hub gives somebody who posts for one of our brands.
 *
 * This is the page a creator reads before deciding whether to hand over a
 * TikTok connection, so the promises section is as prominent as the features
 * and says what we will NOT do. Every line of it is enforced somewhere in the
 * product: the Display API scopes we hold are read-only, and the connection is
 * removable from the creator's own profile page.
 */
export function Creators() {
  return (
    <SitePage
      eyebrow="For creators"
      title="Your numbers. Finally yours."
      intro={CREATOR_INTRO}
      documentTitle="For creators"
    >
      <Section>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {CREATOR_POINTS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06}>
              <SiteCard title={p.title}>{p.body}</SiteCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-line border-t">
        <Reveal>
          <Eyebrow>Working with us</Eyebrow>
          <h2 className="font-display mt-5 max-w-3xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-extrabold tracking-[-0.02em]">
            What a collaboration actually looks like
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {CREATOR_WORKING.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06}>
              <SiteCard title={p.title}>{p.body}</SiteCard>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-line border-t">
        <Reveal>
          <Eyebrow>What we will never do</Eyebrow>
          <h2 className="font-display mt-5 max-w-3xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-extrabold tracking-[-0.02em]">
            Your account stays yours
          </h2>
        </Reveal>
        <ul className="mt-10 grid max-w-4xl gap-4">
          {CREATOR_PROMISES.map((line, i) => (
            <Reveal key={line} delay={i * 0.05}>
              <li className="wx-neo-raised text-muted flex gap-4 rounded-xl p-5 leading-relaxed">
                <span className="bg-accent mt-2 size-1.5 shrink-0 rounded-full" aria-hidden />
                <span>{line}</span>
              </li>
            </Reveal>
          ))}
        </ul>
        <p className="text-muted mt-8 leading-relaxed">
          The TikTok connection is explained in full on our{' '}
          <Link to="/tiktok" className="text-accent underline-offset-4 hover:underline">
            Connecting TikTok
          </Link>{' '}
          page, and what we hold about you is on{' '}
          <Link to="/privacy" className="text-accent underline-offset-4 hover:underline">
            Privacy
          </Link>
          .
        </p>
      </Section>

      <Section className="border-line border-t">
        <Reveal>
          <h2 className="font-display max-w-3xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-extrabold tracking-[-0.02em]">
            Applying takes a minute, and costs nothing
          </h2>
          <p className="text-muted mt-5 max-w-2xl leading-relaxed">
            Tell us your TikTok handle and how to reach you. We read every application.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/apply" size="lg">
              Apply to join
            </ButtonLink>
            <ButtonLink to="/how-it-works" variant="secondary" size="lg">
              See how it works
            </ButtonLink>
          </div>
        </Reveal>
      </Section>
    </SitePage>
  );
}
