import { Section, Reveal } from '@/components/layout/Section';
import { SitePage } from '@/components/site/SitePage';
import { ButtonLink } from '@/components/ui/Button';
import { FAQ } from '@/content/site-pages';

/**
 * The questions creators actually ask, answered in full on the page.
 *
 * NOT an accordion. Everything is open: a reviewer checking what we claim, and
 * a creator deciding whether to connect their account, should not have to click
 * nine times to read nine answers, and text inside a collapsed panel is text a
 * search engine and a reviewer may never see.
 */
export function Faq() {
  return (
    <SitePage
      eyebrow="FAQ"
      title="Questions creators ask"
      intro="If your question is not here, write to us and a person will answer."
      documentTitle="FAQ"
    >
      <Section>
        <dl className="grid max-w-4xl gap-5">
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 0.04}>
              <div className="border-line bg-surface-1 rounded-2xl border p-7">
                <dt className="text-lg font-bold">{item.q}</dt>
                <dd className="text-muted mt-3 leading-relaxed">{item.a}</dd>
              </div>
            </Reveal>
          ))}
        </dl>

        <Reveal>
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <ButtonLink to="/apply" size="lg">
              Apply to join
            </ButtonLink>
            {/* To the contact page rather than a mailto: `external` opens a new
                tab, and a blank tab beside a mail client reads as a broken
                link. The address itself is one click away there. */}
            <ButtonLink to="/contact" variant="secondary" size="lg">
              Ask us a question
            </ButtonLink>
          </div>
        </Reveal>
      </Section>
    </SitePage>
  );
}
