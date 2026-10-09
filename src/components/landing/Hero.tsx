import { m } from 'motion/react';
import { Container, ParallaxLayer, useSectionScroll } from '@/components/layout/Section';
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
 * What a creator actually sees on the other side of the login. Each one floats
 * at its own height above the page, which is the point: they drift against each
 * other as you scroll, and that relative drift is what reads as depth.
 * `from`/`to` are px of travel across the hero's time on screen.
 */
const FLOATS = [
  { label: 'Your GMV', dot: 'bg-accent', to: -16 },
  { label: 'Commission earned', dot: 'bg-info', to: -44 },
  { label: 'Ad spend behind your videos', dot: 'bg-success', to: -28 },
] as const;

export function Hero() {
  const { ref, progress } = useSectionScroll(['start start', 'end start']);

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
      <ParallaxLayer progress={progress} from={0} to={140} className="absolute inset-0">
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
          to={-120}
          className="absolute -top-10 -left-24 size-[26rem] bg-[radial-gradient(closest-side,var(--wx-danger-soft),transparent)]"
        />
        <ParallaxLayer
          progress={progress}
          from={0}
          to={-220}
          scaleTo={1.15}
          className="absolute top-1/3 left-[38%] size-[20rem] bg-[radial-gradient(closest-side,var(--wx-info-soft),transparent)]"
        />
        <ParallaxLayer
          progress={progress}
          from={0}
          to={-60}
          className="absolute right-[-8rem] bottom-0 size-[24rem] bg-[radial-gradient(closest-side,var(--wx-success-soft),transparent)]"
        />
      </div>

      <Container className="relative">
        {/* pt-24 clears the 64px fixed header with a little breathing room and
            no more, the previous pt-36 left a dead band under the nav. */}
        <div className="grid items-start gap-12 pt-24 pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-28 lg:pb-24">
          <ParallaxLayer progress={progress} from={0} to={-48} className="lg:pt-6">
            <m.div variants={container} initial="hidden" animate="show">
              <m.div variants={item}>
                <span className="wx-neo-raised-sm text-muted inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[0.6875rem] tracking-[0.18em] uppercase backdrop-blur-sm">
                  <span className="relative flex size-1.5">
                    <span className="bg-accent absolute inline-flex size-full animate-ping rounded-full opacity-70" />
                    <span className="bg-accent relative inline-flex size-1.5 rounded-full" />
                  </span>
                  Creator applications open
                </span>
              </m.div>

              <m.h1
                variants={item}
                className="mt-6 text-left text-[clamp(2.75rem,6vw,4.5rem)] font-extrabold"
              >
                Your numbers.
                <br />
                <span className="text-accent">Finally yours.</span>
              </m.h1>

              <m.p
                variants={item}
                className="text-muted mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-pretty"
              >
                WurxMediaHub is the creator platform behind Wurx Media&rsquo;s TikTok Shop
                brands. One login, every brand you work with, and the real performance data
                behind your videos. No screenshots, no guessing, no waiting on a reply in the
                group chat.
              </m.p>

              <m.div variants={item} className="mt-8">
                <ButtonLink to="#how" variant="secondary" size="xl">
                  See how it works
                </ButtonLink>
              </m.div>

              {/* THE NEAREST PLANE. Three chips, each at its own travel, so they
                  slide past the copy and past one another. It is also the first
                  thing on the page to say what is behind the login. */}
              <m.ul
                variants={item}
                className="mt-10 flex flex-wrap gap-x-3 gap-y-4"
                aria-label="What you see inside"
              >
                {FLOATS.map((f) => (
                  <li key={f.label}>
                    <ParallaxLayer progress={progress} from={0} to={f.to} className="block">
                      <span className="wx-neo-raised-sm text-text inline-flex items-center gap-2.5 rounded-full px-4 py-2.5 text-[0.8125rem] font-semibold">
                        <span className={`${f.dot} size-2 rounded-full`} aria-hidden />
                        {f.label}
                      </span>
                    </ParallaxLayer>
                  </li>
                ))}
              </m.ul>
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
