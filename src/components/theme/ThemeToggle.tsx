import { AnimatePresence, motion } from 'motion/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from './theme-context';
import { cn } from '@/lib/utils';

const ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<ThemeMode, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'Follows your system theme',
};

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, cycle } = useTheme();
  const Icon = ICONS[mode];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${LABELS[mode]}. Click to change.`}
      title={LABELS[mode]}
      className={cn(
        'relative grid size-10 place-items-center overflow-hidden rounded-full',
        'border border-line bg-surface-1/60 text-muted backdrop-blur-sm',
        'transition-colors duration-200 ease-brand',
        'hover:border-line-interactive hover:text-accent',
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={mode}
          initial={{ y: 14, opacity: 0, rotate: -30 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 30 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="absolute grid place-items-center"
        >
          <Icon size={17} strokeWidth={2} aria-hidden />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
