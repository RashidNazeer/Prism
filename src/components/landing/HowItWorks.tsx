import { Section, Eyebrow, Reveal } from '@/components/layout/Section';
import { TiltCard, TiltLift } from '@/components/ui/TiltCard';
import { STEPS } from '@/content/site';

export function HowItWorks() {
  return (
    <Section id="how">
      <Reveal>
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-5 max-w-3xl text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold">
          Three steps from application to earning creator
        </h2>
      </Reveal>

      <ol className="mt-14 grid gap-5 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.n} delay={i * 0.08}>
            {/* The step number lifts off its own card; the heading and body do
                not. Long copy on a raised plane is harder to read, and lifting
                everything would defeat the parallax, which only works because
                the layers move at different rates. */}
            <TiltCard
              as="li"
              className="wx-neo-raised group ease-brand h-full rounded-2xl p-7 transition-colors duration-300"
            >
              <TiltLift depth={26}>
                <span
                  className="wx-numeric bg-accent font-display text-on-accent grid size-[44px] place-items-center rounded-xl text-sm font-bold"
                  aria-hidden
                >
                  {step.n}
                </span>
              </TiltLift>
              <h3 className="mt-6 text-xl font-bold">{step.title}</h3>
              <p className="text-muted mt-3 leading-relaxed">{step.body}</p>
            </TiltCard>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
