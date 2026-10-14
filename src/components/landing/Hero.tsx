import { m, useReducedMotion } from 'motion/react';
import {
  Container,
  LoadWords,
  ParallaxLayer,
  useSectionScroll,
} from '@/components/layout/Section';
import { ButtonLink } from '@/components/ui/Button';

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
      {/*
        THE BACKDROP IS NOT MOUNTED HERE ANY MORE. It is on the page root, in
        `src/routes/Landing.tsx`, and this is the bug that moved it.

        It was inside a `ParallaxLayer`, which carries a `transform`. A
        transformed ancestor is the containing block for every `position: fixed`
        descendant, so "fixed" stopped meaning the viewport and started meaning
        that layer — and this Hero is `relative overflow-hidden`, which then
        CLIPPED the backdrop to the hero's own box. The result was a hard
        horizontal seam partway down the landing page: background above it, bare
        `--wx-bg` below. Rashid: "you see this layer creating difference? It must
        not exist."

        It is the same family as the fence law in `docs/GLASS_PLAN.md` §1.2 — a
        `transform`, a `filter` or a `backdrop-filter` all do this — and the fix
        is the same shape: put the full-bleed layer somewhere with nothing above
        it, not inside the section it happens to start in.

        THE HANDOVER FADE WENT WITH IT. A `from-bg` gradient across the hero's
        last 48 was there to hand over to sections that "paint their own opaque
        grounds". They do not — every one of them is transparent — so with one
        continuous background that fade was simply a pale band washing the
        bottom of the hero. One ground, no handover.
      */}

      {/* THE SPECTRUM DISCS ARE GONE, 2026-10-15. Three soft radial washes --
          danger top-left, info mid, success bottom-right -- sat over the
          background at 12-14% alpha. Rashid circled all three: "hardly visible
          colours ... pinkish bluish etc I want them removed."

          He is right that they had stopped earning their place. They were
          designed to be the only light on a flat page; there is now a
          photograph AND a WebGL field under them, both carrying their own, and
          a 12% disc on top of that reads as a stain rather than as light.
          Removing them also returns three animated layers to the compositor. */}

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
                className="font-brand mt-6 text-left text-[clamp(2.75rem,6vw,4.5rem)]"
              >
                <LoadWords text="Your numbers." quiet={quiet ?? false} />
                <br />
                <LoadWords
                  text="Finally yours."
                  className="text-brand-blend"
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

          {/*
            THE MEDIA SLOT — empty on purpose, 2026-10-14.
            Rashid is supplying an animated video, one cut per theme, to sit
            here. The column is kept so dropping it in is a one-component
            change rather than a layout one.

            THE APPLY FORM USED TO LIVE HERE and has been removed, not moved:
            `/apply` already renders the same `ApplyForm`, and every call to
            action in the product — the dashboard, Contact, Creators, FAQ, How
            it works — already links to that ROUTE. Checked before deleting:
            nothing anywhere links to the old `#apply` anchor, so no navigation
            breaks. The form component itself is untouched and still used by
            the route.
          */}
        </div>
      </Container>
    </div>
  );
}
