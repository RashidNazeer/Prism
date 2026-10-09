import { m, useReducedMotion } from 'motion/react';
import {
  Container,
  LoadWords,
  ParallaxLayer,
  useSectionScroll,
} from '@/components/layout/Section';
import { HaloBackdrop } from '@/components/auth/HaloBackdrop';
import { ButtonLink } from '@/components/ui/Button';
import { ApplyForm } from './ApplyForm';

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

/**
 * What a creator actually sees on the other side of the login.
 *
 * ONE ROW, ONE BASELINE. These each had their own travel (-16, -44, -28), so
 * they drifted past one another — which reads as depth on a backdrop but as a
 * misalignment on a row of labels, because three chips of the same kind sitting
 * at three different heights look broken rather than deliberate. Rashid asked
 * for them aligned, and he is right: depth belongs on the planes BEHIND the
 * copy, not on a row the eye reads as a set.
 *
 * They still travel as a group, so the plane still moves against the backdrop
 * and the copy. They just stay level with each other while doing it.
 */
const FLOAT_TRAVEL = -84;

const headline = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.1 } },
};

const FLOATS = [
  { label: 'Your GMV', dot: 'bg-accent' },
  { label: 'Commission earned', dot: 'bg-info' },
  { label: 'Ad spend behind your videos', dot: 'bg-success' },
] as const;

export function Hero() {
  const { ref, progress } = useSectionScroll(['start start', 'end start']);
  const quiet = useReducedMotion();

  return (
    <div id="top" ref={ref as never} className="relative overflow-hidden">
      {/* The product's own backdrop, not the old Wurx grid-and-glow pair that
          was here. The landing page is the first thing anyone sees, and it was
          the last place still drawing the previous identity.

          BEHIND THE HERO, NOT THE WHOLE PAGE. The sections below it paint their
          own opaque grounds, so a full-page backdrop would be bought and then
          covered; this is the screenful that is actually open. The fade at the
          bottom hands over to them without a seam.

          THE FARTHEST PLANE. It travels down at a fraction of the scroll, so it
          lags the page: the slowest layer, which is what reads as far away. */}
      <ParallaxLayer progress={progress} from={0} to={260} className="absolute inset-0">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <HaloBackdrop className="absolute inset-0" />
        </div>
      </ParallaxLayer>
      <div
        aria-hidden
        className="from-bg pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t to-transparent"
      />

      {/* A MIDDLE PLANE of spectrum light, accents only. Soft radial discs rather
          than blurred shapes: a gradient is painted once and then only moved,
          where a `filter: blur` layer is expensive to keep composited on the
          mid-range Android most of this audience holds. They rise at three
          different rates, so they pass the copy and each other. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <ParallaxLayer
          progress={progress}
          from={0}
          to={-240}
          rotateTo={40}
          className="absolute -top-10 -left-24 size-[26rem] bg-[radial-gradient(closest-side,var(--wx-danger-soft),transparent)]"
        />
        <ParallaxLayer
          progress={progress}
          from={0}
          to={-420}
          scaleTo={1.5}
          className="absolute top-1/3 left-[38%] size-[20rem] bg-[radial-gradient(closest-side,var(--wx-info-soft),transparent)]"
        />
        <ParallaxLayer
          progress={progress}
          from={0}
          to={-110}
          scaleTo={0.8}
          className="absolute right-[-8rem] bottom-0 size-[24rem] bg-[radial-gradient(closest-side,var(--wx-success-soft),transparent)]"
        />
      </div>

      <Container className="relative">
        {/* pt-24 clears the 64px fixed header with a little breathing room and
            no more, the previous pt-36 left a dead band under the nav. */}
        <div className="grid items-start gap-12 pt-24 pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-28 lg:pb-24">
          <ParallaxLayer progress={progress} from={0} to={-96} className="lg:pt-6">
            <m.div variants={container} initial="hidden" animate="show">
              <m.div variants={item}>
                {/* No `backdrop-blur-sm`. A backdrop filter re-blurs everything
                    behind the element every frame, and what is behind this one
                    is a continuously animating background — so it was paying
                    for a blur nobody could see. `wx-neo-raised-sm` already
                    gives it an opaque surface, which is the only reason the
                    blur was there. */}
                <span className="wx-neo-raised-sm text-muted inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
                  <span className="relative flex size-1.5">
                    <span className="bg-accent absolute inline-flex size-full animate-ping rounded-full opacity-70" />
                    <span className="bg-accent relative inline-flex size-1.5 rounded-full" />
                  </span>
                  Creator applications open
                </span>
              </m.div>

              {/* The headline assembles word by word, each on its own offset and
                  rolled a few degrees, and the stagger inherits from the
                  container above. */}
              <m.h1
                variants={headline}
                className="font-brand mt-6 text-left text-[clamp(2.75rem,6vw,4.5rem)] font-normal"
              >
                <LoadWords text="Your numbers." quiet={quiet ?? false} />
                <br />
                <LoadWords
                  text="Finally yours."
                  className="text-accent"
                  quiet={quiet ?? false}
                />
              </m.h1>

              <m.p
                variants={item}
                className="text-muted mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-pretty"
              >
                {/* The old product name was still here, in the first paragraph
                    of the landing page. "Wurx Media" stays: the kit itself says
                    "Creator community by Wurx Media", so that is the company,
                    not the retired identity. */}
                Prism is the creator platform behind Wurx Media&rsquo;s TikTok Shop brands. One
                login, every brand you work with, and the real performance data behind your
                videos. No screenshots, no guessing, no waiting on a reply in the group chat.
              </m.p>

              <m.div variants={item} className="mt-8">
                <ButtonLink to="#how" variant="secondary" size="xl">
                  See how it works
                </ButtonLink>
              </m.div>

              {/* THE NEAREST PLANE. The parallax is on the ROW, not on each
                  chip, so the three stay level with one another while the whole
                  set drifts against the copy behind it. `items-center` keeps
                  them on one baseline even when the longest wraps. */}
              <ParallaxLayer progress={progress} from={0} to={FLOAT_TRAVEL} className="block">
                <m.ul
                  variants={item}
                  className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-3"
                  aria-label="What you see inside"
                >
                  {FLOATS.map((f) => (
                    <li key={f.label} className="flex">
                      <span className="wx-neo-raised-sm text-text inline-flex min-h-11 items-center gap-2.5 rounded-full px-4 text-[0.8125rem] font-semibold">
                        <span className={`${f.dot} size-2 shrink-0 rounded-full`} aria-hidden />
                        {f.label}
                      </span>
                    </li>
                  ))}
                </m.ul>
              </ParallaxLayer>
            </m.div>
          </ParallaxLayer>

          <m.div
            id="apply"
            className="scroll-mt-24"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.2, ease: EASE }}
          >
            <ApplyForm />
          </m.div>
        </div>
      </Container>
    </div>
  );
}
