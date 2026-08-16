import { Suspense, useLayoutEffect } from 'react';
import { Outlet } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ScreenFallback } from '@/components/layout/ScreenFallback';
import { applyUiScale, clearUiScale, storedUiScale } from '@/lib/ui-scale';

/**
 * THE FRAME EVERY SIGNED-IN SCREEN SLOTS INTO, and the reason navigation is
 * instant since 2026-08-15.
 *
 * WHAT WAS WRONG, measured rather than guessed (`pnpm measure:nav`): clicking a
 * menu item took 291ms on the first visit to a section and 11ms after. The
 * whole difference was one file download, and the app refused to change the URL
 * until that download finished. So for a third of a second nothing moved at
 * all: the click had registered, the app was working, and none of it was
 * visible. That is why it read as hanging rather than loading. Rashid said a
 * laggy app is the one thing he cannot tolerate, and he was describing this.
 *
 * WHAT CHANGED IS THE ORDER. React Router's route-level `lazy` waits for the
 * module before it commits the navigation. `React.lazy` behind a Suspense
 * boundary does the opposite: the URL changes immediately, this component stays
 * mounted, and only the missing piece suspends. Click to URL goes from 291ms to
 * about 11ms even on a cold chunk.
 *
 * WHY THE SHELL HAD TO MOVE UP HERE FOR THAT TO WORK. Every screen used to
 * render its own `<AppShell>`, so the sidebar was part of the thing being
 * swapped and would have gone blank behind the fallback. Hoisting it means the
 * sidebar, the top bar and the page frame never unmount: the active menu item
 * lights up the instant you click, and only the content area shows a skeleton.
 *
 * The Suspense boundary sits INSIDE AppShell for exactly that reason. Putting it
 * outside would blank the whole page and we would be back where we started with
 * extra steps.
 */
export function ShellLayout() {
  /*
   * The text-size setting is the app's, not the whole site's. It goes on when
   * the shell mounts and comes off when it unmounts, so the public landing page
   * keeps the browser's own 16px and the proportions it was drawn at.
   *
   * `useLayoutEffect` rather than `useEffect`: this changes the size of
   * everything, and doing it after the first paint would show one frame at the
   * wrong scale on every sign-in.
   */
  useLayoutEffect(() => {
    applyUiScale(storedUiScale());
    return clearUiScale;
  }, []);

  return (
    <AppShell>
      <Suspense fallback={<ScreenFallback />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}
