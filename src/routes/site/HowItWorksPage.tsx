import { Section, Reveal, Eyebrow } from '@/components/layout/Section';
import { SitePage } from '@/components/site/SitePage';
import { ButtonLink } from '@/components/ui/Button';
import { CREATOR_JOURNEY } from '@/content/site-pages';

/**
 * How it works, end to end, for a creator.
 *
 * The home page carries a three-step version aimed at persuading somebody to
 * apply. This is the full sequence including what happens after the videos go
 * out, which is the part creators actually ask about.
 */
export function HowItWorksPage() {
  return (
    <SitePage
      eyebrow="How it works"
      title="From application to paid, step by step"
      intro="Five steps, no invitation needed and nothing to pay. Here is exactly what happens, and what you can see at each point."
      documentTitle="How it works"
    >
      <Section>
        <ol className="grid gap-5 lg:grid-cols-2">
          {CREATOR_JOURNEY.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.06}>
              <li className="wx-neo-raised ease-brand h-full rounded-2xl p-7 transition-colors duration-300">
                <span
                  className="wx-numeric bg-accent font-display text-on-accent grid size-[44px] place-items-center rounded-xl text-sm font-bold"
                  aria-hidden
                >
                  {step.n}
                </span>
                <h2 className="mt-6 text-xl font-bold">{step.title}</h2>
                <p className="text-muted mt-3 leading-relaxed">{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section className="border-line border-t">
        <Reveal>
          <Eyebrow>Where the figures come from</Eyebrow>
          <h2 className="font-display mt-5 max-w-3xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-extrabold tracking-[-0.02em]">
            The same numbers we work from
          </h2>
          <div className="text-muted mt-6 grid max-w-4xl gap-4 leading-relaxed">
            <p>
              Revenue and items sold come from the brand&rsquo;s own TikTok Shop reporting,
              matched to the videos you posted for that brand. Ad spend comes from the
              brand&rsquo;s TikTok ad account, for the videos it was spent on.
            </p>
            <p>
              Nothing is re-typed by hand on the way to your screen, and there is no separate
              set of figures for staff. When a number is missing, the hub shows a dash rather
              than a zero, because &ldquo;we cannot answer that yet&rdquo; and &ldquo;nothing
              was earned&rdquo; are different statements.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/apply" size="lg">
              Apply to join
            </ButtonLink>
            <ButtonLink to="/faq" variant="secondary" size="lg">
              Read the FAQ
            </ButtonLink>
          </div>
        </Reveal>
      </Section>
    </SitePage>
  );
}
