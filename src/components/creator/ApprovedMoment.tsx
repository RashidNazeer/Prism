import { m } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { Confetti } from '@/components/creator/Confetti';
import { OnboardingOverlay, Stagger } from '@/components/creator/OnboardingOverlay';
import type { CreatorTier } from '@/lib/auth/auth-context';

const TIER_COPY: Record<CreatorTier, string> = {
  creator: 'You are starting on Creator. Every tracked sale moves you up.',
  rising: 'You are starting on Rising, which means your sales are already landing.',
  pro: 'You are starting on Pro. That is not where most people begin.',
  elite: 'You are starting on Elite, our top tier. Welcome properly.',
};

/**
 * Shown once, the moment a creator is approved.
 *
 * It can arrive while they are sitting on the pending screen, because the
 * application row is live: an admin clicks approve and this appears underneath
 * their hands. That is the moment the whole product is selling, so it gets the
 * confetti.
 */
export function ApprovedMoment({
  name,
  tier,
  note,
  onDone,
  busy,
}: {
  name: string;
  tier: CreatorTier | null;
  note: string | null;
  onDone: () => void;
  busy: boolean;
}) {
  return (
    <>
      <Confetti />
      <OnboardingOverlay label="You are approved">
        <div className="relative overflow-hidden px-7 pt-10 pb-8 text-center sm:px-9">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="wx-glow absolute inset-0" />
          </div>

          <div className="relative">
            {/* The tick lands with a spring, and a ring pushes out behind it. */}
            <Stagger>
              <span className="relative mx-auto grid size-20 place-items-center">
                <m.span
                  aria-hidden
                  initial={{ scale: 0.4, opacity: 0.55 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  transition={{ duration: 1.5, delay: 0.25, ease: 'easeOut' }}
                  className="bg-success absolute inset-0 rounded-full"
                />
                <m.span
                  initial={{ scale: 0.3, rotate: -25 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.15 }}
                  className="bg-success-soft text-success relative grid size-20 place-items-center rounded-full"
                >
                  <Check size={34} strokeWidth={2.6} aria-hidden />
                </m.span>
              </span>
            </Stagger>

            <Stagger delay={0.3}>
              <h2 className="mt-7 text-[clamp(1.7rem,6vw,2.25rem)] font-extrabold">
                You are in{name ? `, ${name}` : ''}
              </h2>
            </Stagger>

            <Stagger delay={0.4}>
              <p className="text-muted mt-3 leading-relaxed text-pretty">
                Your application was approved. You are officially a Wurx creator.
              </p>
            </Stagger>

            {tier ? (
              <Stagger delay={0.5}>
                <p className="bg-accent-soft text-accent mt-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
                  {tier} tier
                </p>
                <p className="text-muted mt-3 text-[0.875rem] leading-relaxed">
                  {TIER_COPY[tier]}
                </p>
              </Stagger>
            ) : null}

            {note ? (
              <Stagger delay={0.58}>
                <p className="wx-neo-inset text-muted mt-6 rounded-2xl px-5 py-4 text-left text-[0.875rem] leading-relaxed">
                  {note}
                </p>
              </Stagger>
            ) : null}
          </div>
        </div>

        <div className="px-7 pb-7 sm:px-9">
          <Stagger delay={0.68}>
            <m.button
              type="button"
              onClick={onDone}
              disabled={busy}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              className="wx-neo-raised-sm wx-neo-press group text-accent ease-brand hover:text-on-accent relative flex h-13 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl text-[0.9375rem] font-semibold transition-colors duration-300 disabled:opacity-60"
            >
              <span
                aria-hidden
                className="bg-accent ease-brand absolute inset-0 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
              />
              <span className="relative">{busy ? 'One moment...' : 'See my hub'}</span>
              <ArrowRight
                size={17}
                aria-hidden
                className="ease-brand relative transition-transform duration-300 group-hover:translate-x-1"
              />
            </m.button>
          </Stagger>
        </div>
      </OnboardingOverlay>
    </>
  );
}
