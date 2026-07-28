import { QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

/**
 * Application-wide providers.
 *
 * IMPORTANT (see CLAUDE.md "Auth rules"): nothing in this tree may ever take a
 * `key` derived from the session, the user id, or the access token. Supabase
 * refreshes the access token roughly every hour; if a provider is keyed on it,
 * that refresh remounts the entire React tree, wiping half-filled forms and
 * flashing the UI. Providers mount once, for the life of the tab.
 *
 * MotionConfig reducedMotion="user" makes every animation in the product honour
 * the operating system's "reduce motion" setting. The CSS media query in
 * global.css only covers CSS transitions; Motion animates in JavaScript and
 * would otherwise ignore it entirely.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        {/*
          LazyMotion + domAnimation ships only the animation and gesture
          features we actually use, roughly halving Motion's bundle. `strict`
          makes the full `motion.div` throw, so nothing can quietly pull the
          heavy build back in: use `m.div` everywhere instead.
        */}
        <LazyMotion features={domAnimation} strict>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  );
}
