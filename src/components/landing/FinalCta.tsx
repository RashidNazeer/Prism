import { ArrowRight } from 'lucide-react';
import {
  ParallaxLayer,
  Reveal,
  ScrollWords,
  Section,
  useSectionScroll,
} from '@/components/layout/Section';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TiltCard } from '@/components/ui/TiltCard';
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
        <Reveal depth={{ rise: 120, tilt: 22, from: 0.8, settle: 0.7 }}>
          {/* `overflow-hidden` stays: the glow planes inside are wider than the
              card and would spill without it. It flattens `preserve-3d`, so the
              card tilts as a whole and nothing inside rises onto its own plane
              — which is right here, since the content is centred and the depth
              is coming from the glow moving behind it. */}
          <TiltCard className="wx-neo-raised relative overflow-hidden rounded-3xl px-7 py-16 text-center sm:px-14 sm:py-20">
            <div aria-hidden className="wx-glow pointer-events-none absolute inset-0" />
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <ParallaxLayer
                progress={progress}
                from={-160}
                to={120}
                rotateTo={45}
                className="absolute -top-24 -left-16 size-[22rem] bg-[radial-gradient(closest-side,var(--wx-accent-soft),transparent)]"
              />
              <ParallaxLayer
                progress={progress}
                from={160}
                to={-120}
                rotateTo={-45}
                className="absolute -right-16 -bottom-24 size-[22rem] bg-[radial-gradient(closest-side,var(--wx-success-soft),transparent)]"
              />
              <ParallaxLayer
                progress={progress}
                from={100}
                to={-200}
                scaleTo={1.4}
                className="absolute top-1/2 right-1/4 size-[14rem] bg-[radial-gradient(closest-side,var(--wx-danger-soft),transparent)]"
              />
            </div>
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-[clamp(1.875rem,4vw,3rem)] font-extrabold">
                <ScrollWords text="Find out what your videos are actually making." />
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
          </TiltCard>
        </Reveal>
      </div>
    </Section>
  );
}
