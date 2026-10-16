import { BarChart3, FileText, Target, Trophy, Users, Wallet } from 'lucide-react';
import { Section, Eyebrow, Reveal } from '@/components/layout/Section';
import { SettleIn, SettleWords } from '@/components/landing/Settle';
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
  return (
    <Section id="platform" className="overflow-x-clip">
      {/* TWO EMPTY PARALLAX LAYERS REMOVED, 2026-10-16. 480x480 and 416x416 of
          transparent nothing — no background, no shadow, no children — left
          over from the spectrum discs deleted on 2026-10-15, still running a
          transform on every scroll frame off a `useSectionScroll`
          subscription. See the long note in `HowItWorks.tsx`. */}
      <div className="relative">

        <Reveal className="relative">
          <Eyebrow>The platform</Eyebrow>
        </Reveal>
        <h2 className="font-brand relative mt-5 max-w-4xl text-[clamp(2rem,4.5vw,3.25rem)]">
          <SettleWords text="Most agencies show you a screenshot. We give you the dashboard." />
        </h2>
        <SettleIn rise={3.125} tilt={10} from={0.97} className="relative">
          <p className="text-muted mt-6 max-w-xl text-lg leading-relaxed text-pretty">
            Every brand you work with gets its own hub, themed as itself, with your real
            performance inside. Transparency is not a feature here. It is the whole product.
          </p>
        </SettleIn>

        <ul className="relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = ICONS[f.icon];
            return (
              <li key={f.title} className="h-full">
                {/* Three different distances across a row, so each row of cards
                    arrives in a ripple. */}
                <SettleIn
                  rise={4.375 + (i % 3) * 3.125 + Math.floor(i / 3) * 1.25}
                  tilt={22}
                  from={0.86}
                  roll={((i % 3) - 1) * 4}
                  delay={(i % 3) * 0.08}
                  className="h-full"
                >
                  <TiltCard className="wx-neo-raised-sm ease-brand h-full rounded-2xl p-7">
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
                </SettleIn>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
