import { BarChart3, FileText, Target, Trophy, Users, Wallet } from 'lucide-react';
import {
  Section,
  Eyebrow,
  ParallaxLayer,
  Reveal,
  ScrollWords,
  useSectionScroll,
} from '@/components/layout/Section';
import { TiltCard, TiltLift } from '@/components/ui/TiltCard';
import { FEATURES } from '@/content/site';

const ICONS = {
  chart: BarChart3,
  trophy: Trophy,
  target: Target,
  wallet: Wallet,
  file: FileText,
  users: Users,
};

/** The spectrum, in the kit's order, one per card. Accents on the icon only. */
const TONES = [
  'text-danger',
  'text-accent',
  'text-info',
  'text-success',
  'text-danger',
  'text-accent',
] as const;

export function Platform() {
  const { ref, progress } = useSectionScroll(['start end', 'end start']);

  return (
    <Section id="platform" className="overflow-x-clip">
      <div ref={ref as never} className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <ParallaxLayer
            progress={progress}
            from={260}
            to={-260}
            scaleTo={1.3}
            rotateTo={-50}
            className="absolute -top-20 -left-32 size-[30rem] bg-[radial-gradient(closest-side,var(--wx-info-soft),transparent)]"
          />
          <ParallaxLayer
            progress={progress}
            from={-140}
            to={300}
            rotateTo={70}
            className="absolute right-[-10rem] bottom-0 size-[26rem] bg-[radial-gradient(closest-side,var(--wx-danger-soft),transparent)]"
          />
        </div>

        <Reveal className="relative">
          <Eyebrow>The platform</Eyebrow>
        </Reveal>
        <h2 className="relative mt-5 max-w-4xl text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold">
          <ScrollWords text="Most agencies show you a screenshot. We give you the dashboard." />
        </h2>
        <Reveal depth={{ rise: 50, tilt: 10, from: 0.97 }} className="relative">
          <p className="text-muted mt-6 max-w-xl text-lg leading-relaxed text-pretty">
            Every brand you work with gets its own hub, themed as itself, with your real
            performance inside. Transparency is not a feature here. It is the whole product.
          </p>
        </Reveal>

        <ul className="relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = ICONS[f.icon];
            return (
              <li key={f.title} className="h-full">
                {/* Three different distances across a row, so each row of cards
                    arrives in a ripple. */}
                <Reveal
                  depth={{
                    rise: 70 + (i % 3) * 50 + Math.floor(i / 3) * 20,
                    tilt: 22,
                    from: 0.86,
                    roll: ((i % 3) - 1) * 4,
                    settle: 0.68,
                  }}
                  className="h-full"
                >
                  <TiltCard className="wx-neo-raised ease-brand h-full rounded-2xl p-7">
                    <TiltLift depth={22}>
                      <span
                        className={`wx-neo-raised-sm ${TONES[i % TONES.length]} grid size-11 place-items-center rounded-xl`}
                      >
                        <Icon size={19} aria-hidden />
                      </span>
                    </TiltLift>
                    <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
                    <p className="text-muted mt-2.5 text-[0.9375rem] leading-relaxed">
                      {f.body}
                    </p>
                  </TiltCard>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
