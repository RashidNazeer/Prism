import { QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AuthProvider } from '@/lib/auth/AuthProvider';

/**
 * Application-wide providers.
 *
 * IMPORTANT (see CLAUDE.md "Auth rules"): nothing in this tree may ever take a
 * `key` derived from the session, the user id, or the access token. Supabase
 * refreshes the access token roughly every hour; if a provider is keyed on it,
 * that refresh remounts the entire React tree, wiping half-filled forms and
 * flashing the UI. Providers mount once, for the life of the tab.
 *
 * AuthProvider sits INSIDE QueryClientProvider on purpose: it clears the query
 * cache when the signed-in person changes, so one user can never see data
 * cached for another.
 *
 * MotionConfig reducedMotion="user" makes every animation honour the operating
 * system's "reduce motion" setting. The CSS media query in global.css only
 * covers CSS transitions; Motion animates in JavaScript and would ignore it.
 *
 * LazyMotion + domAnimation ships only the animation and gesture features we
 * use. `strict` makes the full `motion.div` throw, so nothing can quietly pull
 * the heavy build back in: use `m.div` instead.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>{children}</AuthProvider>
          </QueryClientProvider>
        </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  );
}
