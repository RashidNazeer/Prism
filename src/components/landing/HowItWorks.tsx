import { m, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useRef } from 'react';
import { Section, Eyebrow, Reveal } from '@/components/layout/Section';
import { SettleIn, SettleWords } from '@/components/landing/Settle';
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
/** Where each node sits along the thread (the centre of each card column) and the
 *  progress at which the fill reaches it. */
const NODES = [1 / 6, 3 / 6, 5 / 6] as const;

function ThreadNode({ at, progress }: { at: number; progress: MotionValue<number> }) {
  /* The fill is `0.04 + 0.96 * progress`, so invert that for when it arrives. */
  const arrive = Math.max((at - 0.04) / 0.96, 0.05);
  const scale = useTransform(progress, [arrive - 0.07, arrive, arrive + 0.05], [0.4, 1.45, 1]);
  const opacity = useTransform(progress, [arrive - 0.07, arrive], [0.25, 1]);
  return (
    <m.span
      className="bg-accent absolute top-1/2 -mt-2.5 -ml-2.5 size-5 rounded-full"
      style={{ left: `${at * 100}%`, scale, opacity }}
    />
  );
}

function ProgressThread({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const quiet = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target,
    offset: ['start 0.85', 'end 0.5'],
  });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0.04, 1]);
  return (
    <div className="relative mt-14 hidden md:block" aria-hidden>
      <div className="wx-neo-inset h-2 overflow-hidden rounded-full">
        <m.div
          /* A PROGRESS FILL, so it is his colours at full strength: sky into
             periwinkle. The nodes riding on top stay on the accent INK
             (`ThreadNode`) — a peri dot on a peri track is not a dot. */
          className="h-full origin-left rounded-full [background-image:linear-gradient(90deg,var(--wx-brand-sky)_0%,var(--wx-brand-peri)_100%)]"
          style={quiet ? undefined : { scaleX }}
        />
      </div>
      {quiet
        ? null
        : NODES.map((at) => <ThreadNode key={at} at={at} progress={scrollYProgress} />)}
    </div>
  );
}

export function HowItWorks() {
  const listRef = useRef<HTMLOListElement>(null);

  return (
    <Section id="how" className="overflow-x-clip">
      <div className="relative">
        {/*
          THE FAR PLANE IS GONE, 2026-10-16, and it had already stopped
          existing — this only deletes the box it left behind.

          It was "one soft violet disc, drifting up slower than the page". The
          spectrum discs were removed on 2026-10-15 ("hardly visible colours
          ... I want them removed"), which took the disc's background class
          with it and left an EMPTY `size-[28rem]` div behind, still animating.
          Read off the rendered page at 1440: background-color
          `rgba(0,0,0,0)`, background-image `none`, no shadow, no border, no
          children, no text — 480x480 of nothing, on a transform that ran on
          every scroll frame, with a `useScroll` subscription measuring the
          section to feed it.

          Six of these were left across this section, `Platform` and
          `FinalCta`. Rashid: "take really long to load and gitters."

          The `useSectionScroll` hook went with it, because this layer was its
          only reader. `ProgressThread` below keeps its own, which drives
          something you can actually see.
        */}
        <Reveal className="relative">
          <Eyebrow>How it works</Eyebrow>
        </Reveal>
        <h2 className="font-brand relative mt-5 max-w-3xl text-[clamp(2rem,4.5vw,3.25rem)]">
          <SettleWords text="Three steps from application to earning creator" />
        </h2>

        <ProgressThread target={listRef} />

        <ol ref={listRef} className="relative mt-6 grid gap-5 md:mt-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.n} className="h-full">
              {/* Each card arrives from a different distance, so the row builds
                  left to right instead of landing as one slab. */}
              <SettleIn
                rise={5.625 + i * 3.75}
                tilt={26}
                from={0.84}
                roll={(i - 1) * 5}
                delay={i * 0.09}
                className="h-full"
              >
                {/* The step number lifts off its own card; the heading and body
                    do not. Long copy on a raised plane is harder to read, and
                    lifting everything would defeat the parallax, which only
                    works because the layers move at different rates. */}
                <TiltCard className="wx-neo-raised-sm group ease-brand h-full rounded-2xl p-7 transition-colors duration-300">
                  <TiltLift depth={26}>
                    <span
                      /* A 44px numbered tile is a FILL carrying a glyph: his
                         colour, ink numeral. */
                      className="wx-numeric font-display grid size-[44px] place-items-center rounded-xl [background-color:var(--wx-accent-fill)] text-sm font-bold [color:var(--wx-on-accent-fill)]"
                      aria-hidden
                    >
                      {step.n}
                    </span>
                  </TiltLift>
                  <h3 className="mt-6 text-xl font-bold">{step.title}</h3>
                  <p className="text-muted mt-3 leading-relaxed">{step.body}</p>
                </TiltCard>
              </SettleIn>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
