import { BarChart3, FileText, Target, Trophy, Users, Wallet } from 'lucide-react';
import { Section, Eyebrow, Reveal } from '@/components/layout/Section';
import { FEATURES } from '@/content/site';

const ICONS = {
  chart: BarChart3,
  trophy: Trophy,
  target: Target,
  wallet: Wallet,
  file: FileText,
  users: Users,
};

export function Platform() {
  return (
    <Section id="platform" className="border-line border-t">
      <Reveal>
        <Eyebrow>The platform</Eyebrow>
        <h2 className="mt-5 max-w-4xl text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold">
          Most agencies show you a screenshot. We give you the dashboard.
        </h2>
        <p className="text-muted mt-6 max-w-xl text-lg leading-relaxed text-pretty">
          Every brand you work with gets its own hub, themed as itself, with your real
          performance inside. Transparency is not a feature here. It is the whole product.
        </p>
      </Reveal>

      <ul className="bg-line mt-14 grid gap-px overflow-hidden rounded-2xl shadow-md sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => {
          const Icon = ICONS[f.icon];
          return (
            <Reveal key={f.title} delay={(i % 3) * 0.06} className="bg-surface-1">
              <li className="group ease-brand hover:bg-surface-2 h-full p-7 transition-colors duration-300">
                <span className="bg-accent-soft text-accent grid size-10 place-items-center rounded-xl">
                  <Icon size={18} aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
                <p className="text-muted mt-2.5 text-[0.9375rem] leading-relaxed">{f.body}</p>
              </li>
            </Reveal>
          );
        })}
      </ul>
    </Section>
  );
}
