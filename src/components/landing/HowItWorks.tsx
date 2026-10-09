import { m, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import {
  Section,
  Eyebrow,
  ParallaxLayer,
  Reveal,
  useSectionScroll,
} from '@/components/layout/Section';
import { TiltCard, TiltLift } from '@/components/ui/TiltCard';
import { STEPS } from '@/content/site';

/**
 * The thread through the three steps. A recessed track with a violet-to-cyan
 * fill that is drawn by scroll: it reaches the third card as you do. `scaleX`
 * from the left edge is a transform, so it stays on the compositor, and under
 * reduced motion it is simply drawn full, which is the still version of the same
 * information. Hidden below `md`, where the cards stack and a horizontal thread
 * would join nothing.
 */
function ProgressThread({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const quiet = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target,
    offset: ['start 0.8', 'end 0.55'],
  });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0.04, 1]);
  return (
    <div
      className="wx-neo-inset mt-14 hidden h-2 overflow-hidden rounded-full md:block"
      aria-hidden
    >
      <m.div
        className="h-full origin-left rounded-full bg-[image:var(--wx-accent-gradient)]"
        style={quiet ? undefined : { scaleX }}
      />
    </div>
  );
}

export function HowItWorks() {
  const { ref, progress } = useSectionScroll(['start end', 'end start']);
  const listRef = useRef<HTMLOListElement>(null);

  return (
    <Section id="how" className="overflow-x-clip">
      <div ref={ref as never} className="relative">
        {/* A far plane behind the heading: one soft violet disc, drifting up
            slower than the page. Accent only, never a surface. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <ParallaxLayer
            progress={progress}
            from={80}
            to={-80}
            className="absolute -top-24 -right-20 size-[28rem] bg-[radial-gradient(closest-side,var(--wx-accent-soft),transparent)]"
          />
        </div>

        <Reveal depth={{ rise: 36, tilt: 8, from: 0.98 }} className="relative">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-5 max-w-3xl text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold">
            Three steps from application to earning creator
          </h2>
        </Reveal>

        <ProgressThread target={listRef} />

        <ol ref={listRef} className="relative mt-6 grid gap-5 md:mt-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.n} className="h-full">
              {/* Each card arrives from a different distance, so the row builds
                  left to right instead of landing as one slab. */}
              <Reveal depth={{ rise: 48 + i * 36, tilt: 18, from: 0.9 }} className="h-full">
                {/* The step number lifts off its own card; the heading and body
                    do not. Long copy on a raised plane is harder to read, and
                    lifting everything would defeat the parallax, which only
                    works because the layers move at different rates. */}
                <TiltCard className="wx-neo-raised group ease-brand h-full rounded-2xl p-7 transition-colors duration-300">
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
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
