import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

/**
 * Application-wide providers.
 *
 * IMPORTANT (see CLAUDE.md "Auth rules"): nothing in this tree may ever take a
 * `key` derived from the session, the user id, or the access token. Supabase
 * refreshes the access token roughly every hour; if a provider is keyed on it,
 * that refresh remounts the entire React tree — wiping half-filled forms and
 * flashing the UI. Providers mount once, for the life of the tab.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
