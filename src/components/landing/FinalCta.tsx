import { ArrowRight } from 'lucide-react';
import { ParallaxLayer, Reveal, Section, useSectionScroll } from '@/components/layout/Section';
import { Button, ButtonLink } from '@/components/ui/Button';
import { focusApplyForm } from '@/lib/focus-apply';

export function FinalCta() {
  const { ref, progress } = useSectionScroll(['start end', 'end end']);

  return (
    <Section className="overflow-x-clip">
      <div ref={ref as never}>
        {/* The card rises and un-tips as the page arrives at it. Inside, the
            spectrum light sits on two planes that move in OPPOSITE directions,
            which is the strongest depth cue on the page: the card is a window
            and the glow is behind it. */}
        <Reveal depth={{ rise: 64, tilt: 12, from: 0.92 }}>
          <div className="wx-neo-raised relative overflow-hidden rounded-3xl px-7 py-16 text-center sm:px-14 sm:py-20">
            <div aria-hidden className="wx-glow pointer-events-none absolute inset-0" />
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <ParallaxLayer
                progress={progress}
                from={-70}
                to={50}
                className="absolute -top-24 -left-16 size-[22rem] bg-[radial-gradient(closest-side,var(--wx-accent-soft),transparent)]"
              />
              <ParallaxLayer
                progress={progress}
                from={70}
                to={-50}
                className="absolute -right-16 -bottom-24 size-[22rem] bg-[radial-gradient(closest-side,var(--wx-success-soft),transparent)]"
              />
              <ParallaxLayer
                progress={progress}
                from={40}
                to={-90}
                className="absolute top-1/2 right-1/4 size-[14rem] bg-[radial-gradient(closest-side,var(--wx-danger-soft),transparent)]"
              />
            </div>
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-[clamp(1.875rem,4vw,3rem)] font-extrabold">
                Find out what your videos are actually making.
              </h2>
              <p className="text-muted mx-auto mt-6 max-w-lg text-lg leading-relaxed text-pretty">
                Applications take about three minutes. No follower minimum, and a human reads
                every one.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" className="group" onClick={() => focusApplyForm()}>
                  Apply to join
                  <ArrowRight
                    size={17}
                    className="ease-brand transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Button>
                <ButtonLink to="/login" variant="secondary" size="lg">
                  Sign in
                </ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
