import { motion } from 'motion/react';
import { BarChart3, Trophy, Wallet } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Children fade up one after another rather than all at once. */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

const PILLARS = [
  {
    icon: BarChart3,
    title: 'Real numbers',
    body: 'Your GMV, orders and views per brand — the same figures we see.',
  },
  {
    icon: Wallet,
    title: 'Real money',
    body: 'Commission earned and the ad spend sitting behind your videos.',
  },
  {
    icon: Trophy,
    title: 'Real competition',
    body: 'Live leaderboards, sprints and contests across every brand hub.',
  },
];

export function ComingSoon() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      {/* Layered background: technical grid, brand glow, and a fade so the grid
          dissolves rather than stopping in a hard line. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="wx-grid absolute inset-0" />
        <div className="wx-glow absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6">
        <header className="flex items-center justify-between py-7">
          <WurxMark />
          <ThemeToggle />
        </header>

        <motion.main
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-1 flex-col justify-center py-12"
        >
          <motion.div variants={item}>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1/70 px-3.5 py-1.5 font-mono text-[11px] tracking-[0.18em] text-muted uppercase backdrop-blur-sm">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
              </span>
              In development
            </span>
          </motion.div>

          <motion.h1
            variants={item}
            className="mt-7 font-display text-[clamp(2.5rem,8vw,5rem)] leading-[0.95] tracking-[-0.02em] text-balance"
          >
            Your numbers.
            <br />
            <span className="text-accent">Finally yours.</span>
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-7 max-w-xl text-lg leading-relaxed text-muted text-pretty"
          >
            WurxMediaHub is the creator platform behind Wurx Media&rsquo;s TikTok Shop
            brands. One login, every brand you work with, and the real performance
            data behind your videos — no screenshots, no guessing, no waiting on a
            reply in the group chat.
          </motion.p>

          <motion.ul variants={item} className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="bg-surface-1 p-5">
                <Icon size={18} className="text-accent" aria-hidden />
                <h2 className="mt-3.5 text-sm font-semibold">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-faint">{body}</p>
              </li>
            ))}
          </motion.ul>

          <motion.p variants={item} className="mt-10 text-sm text-faint">
            Creator applications open soon.{' '}
            <a
              href="https://wurxmedia.com"
              className="font-medium text-accent underline-offset-4 transition-colors duration-200 ease-brand hover:text-accent-hover hover:underline"
            >
              wurxmedia.com
            </a>
          </motion.p>
        </motion.main>

        <footer className="flex flex-col gap-1.5 border-t border-line py-7 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Wurx Media. All rights reserved.</p>
          <p className="font-mono tracking-wider">WURXMEDIAHUB &middot; V0</p>
        </footer>
      </div>
    </div>
  );
}
