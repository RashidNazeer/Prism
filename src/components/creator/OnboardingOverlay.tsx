import { useRef, type ReactNode } from 'react';
import { m } from 'motion/react';
import { useFocusTrap } from '@/lib/use-focus-trap';

/**
 * The frame both one-time moments sit in.
 *
 * Deliberately not dismissible by Escape, backdrop click or a close cross.
 * These appear exactly once in a creator's life and the button IS the
 * acknowledgement, so an accidental tap outside must not silently burn the only
 * time they will ever see it.
 *
 * It still scrolls inside itself and traps focus, for the same reasons every
 * other modal here does.
 */
export function OnboardingOverlay({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: 'button' });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <m.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-md"
      />

      <m.div
        ref={panelRef}
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface-1 shadow-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl"
      >
        {children}
      </m.div>
    </div>
  );
}

/** Children that arrive one after another rather than all at once. */
export function Stagger({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      {...(className ? { className } : {})}
    >
      {children}
    </m.div>
  );
}
