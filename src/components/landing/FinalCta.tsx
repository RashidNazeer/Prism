import { ArrowRight } from 'lucide-react';
import { Section, Reveal } from '@/components/layout/Section';
import { Button, ButtonLink } from '@/components/ui/Button';
import { focusApplyForm } from '@/lib/focus-apply';

export function FinalCta() {
  return (
    <Section className="border-line border-t">
      <Reveal>
        <div className="wx-neo-raised relative overflow-hidden rounded-3xl px-7 py-16 text-center sm:px-14 sm:py-20">
          <div aria-hidden className="wx-glow pointer-events-none absolute inset-0" />
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
    </Section>
  );
}
