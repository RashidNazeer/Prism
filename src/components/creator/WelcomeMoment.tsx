import { m } from 'motion/react';
import { ArrowRight, BarChart3, Store, Trophy } from 'lucide-react';
import { PrismMark } from '@/components/brand/PrismMark';
import { OnboardingOverlay, Stagger } from '@/components/creator/OnboardingOverlay';

/**
 * Shown once, the first time a creator lands in the hub after applying.
 *
 * The copy deliberately does NOT repeat the landing page. That page's job was
 * to persuade a stranger to apply; this one's job is to explain what they now
 * have an account for, so it talks about the hub itself rather than about Wurx.
 */
const POINTS = [
  {
    icon: BarChart3,
    title: 'Your real numbers',
    body: 'GMV, commission and the ad spend behind your own videos. The same figures we see, not a summary.',
  },
  {
    icon: Store,
    title: 'Brand hubs',
    body: 'Each brand you work with gets its own space, with briefs, products and what is expected.',
  },
  {
    icon: Trophy,
    title: 'Leaderboards and offers',
    body: 'See where you stand, and get retainer offers as your numbers grow.',
  },
];

export function WelcomeMoment({
  name,
  onDone,
  busy,
}: {
  name: string;
  onDone: () => void;
  busy: boolean;
}) {
  return (
    <OnboardingOverlay label="Welcome to Wurx Media Hub">
      {/* Branded band. The grid and glow are the same motifs as the landing
          page, so this reads as the same product rather than a stock modal. */}
      <div className="border-line relative overflow-hidden border-b px-7 pt-9 pb-8 sm:px-9">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="wx-grid absolute inset-0 opacity-60" />
          <div className="wx-glow absolute inset-0" />
        </div>

        <div className="relative">
          <Stagger>
            <PrismMark height={30} />
          </Stagger>

          <Stagger delay={0.12}>
            <p className="bg-accent-soft text-accent mt-7 inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
              <m.span
                aria-hidden
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="bg-accent size-1.5 rounded-full"
              />
              You are on the list
            </p>
          </Stagger>

          <Stagger delay={0.2}>
            <h2 className="mt-4 text-[clamp(1.6rem,6vw,2.1rem)] font-extrabold">
              Welcome{name ? `, ${name}` : ''}
            </h2>
          </Stagger>

          <Stagger delay={0.28}>
            <p className="text-muted mt-3 leading-relaxed text-pretty">
              This is the Wurx Media Hub. It is where the guesswork stops: once you are
              approved, everything we know about your performance is here, in your own account.
            </p>
          </Stagger>
        </div>
      </div>

      {/* What they have actually joined. */}
      <div className="px-7 py-7 sm:px-9">
        <ul className="grid gap-5">
          {POINTS.map((p, i) => (
            <li key={p.title}>
              <Stagger delay={0.38 + i * 0.1}>
                <div className="flex gap-4">
                  <span className="bg-accent-soft text-accent grid size-10 shrink-0 place-items-center rounded-xl">
                    <p.icon size={18} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{p.title}</span>
                    <span className="text-muted mt-1 block text-[0.875rem] leading-relaxed">
                      {p.body}
                    </span>
                  </span>
                </div>
              </Stagger>
            </li>
          ))}
        </ul>

        <Stagger delay={0.72} className="mt-8">
          {/* Transparent, accent-edged, and it fills with the brand colour as you
              approach it. A solid button here would look like every other
              dialog; this is the one moment worth a flourish. */}
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
            <span className="relative">{busy ? 'One moment...' : "Let's go"}</span>
            <ArrowRight
              size={17}
              aria-hidden
              className="ease-brand relative transition-transform duration-300 group-hover:translate-x-1"
            />
          </m.button>
        </Stagger>
      </div>
    </OnboardingOverlay>
  );
}
