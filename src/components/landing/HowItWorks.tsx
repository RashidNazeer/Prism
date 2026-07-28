import { Section, Eyebrow, Reveal } from '@/components/layout/Section';
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
            <li className="group h-full rounded-2xl border border-line bg-surface-1 p-7 transition-colors duration-300 ease-brand hover:border-line-interactive">
              <span
                className="wx-numeric grid size-11 place-items-center rounded-xl bg-accent font-display text-sm font-bold text-on-accent"
                aria-hidden
              >
                {step.n}
              </span>
              <h3 className="mt-6 text-xl font-bold">{step.title}</h3>
              <p className="mt-3 leading-relaxed text-muted">{step.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
