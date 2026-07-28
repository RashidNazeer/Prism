import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/Section';
import { ButtonLink } from '@/components/ui/Button';
import { NumbersPreview } from './NumbersPreview';

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

export function Hero() {
  return (
    <div id="top" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="wx-grid absolute inset-0" />
        <div className="wx-glow absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <Container className="relative">
        <div className="grid items-center gap-14 pt-32 pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-36 lg:pb-28">
          <motion.div variants={container} initial="hidden" animate="show">
            <motion.div variants={item}>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1/70 px-3.5 py-1.5 font-mono text-[11px] tracking-[0.18em] text-muted uppercase backdrop-blur-sm">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
                </span>
                Creator applications open
              </span>
            </motion.div>

            <motion.h1
              variants={item}
              className="mt-7 text-[clamp(2.75rem,6vw,4.5rem)] font-extrabold text-left"
            >
              Your numbers.
              <br />
              <span className="text-accent">Finally yours.</span>
            </motion.h1>

            <motion.p
              variants={item}
              className="mt-6 max-w-lg text-[17px] leading-relaxed text-muted text-pretty"
            >
              WurxMediaHub is the creator platform behind Wurx Media&rsquo;s TikTok Shop
              brands. One login, every brand you work with, and the real performance
              data behind your videos &mdash; no screenshots, no guessing, no waiting
              on a reply in the group chat.
            </motion.p>

            {/* Buttons go full width on phones so they line up; side by side
                from 400px up. */}
            <motion.div
              variants={item}
              className="mt-9 flex flex-col gap-3 min-[400px]:flex-row min-[400px]:items-center"
            >
              <ButtonLink to="/apply" size="lg" className="group">
                Apply to join
                <ArrowRight
                  size={17}
                  className="transition-transform duration-200 ease-brand group-hover:translate-x-0.5"
                  aria-hidden
                />
              </ButtonLink>
              <ButtonLink to="#how" variant="secondary" size="lg">
                See how it works
              </ButtonLink>
            </motion.div>

            <motion.p variants={item} className="mt-6 text-sm text-faint">
              Free to join. No follower minimum. Every application read by a human.
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
            className="lg:pl-4"
          >
            <NumbersPreview />
          </motion.div>
        </div>
      </Container>
    </div>
  );
}
