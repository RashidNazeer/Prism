import { Suspense, useLayoutEffect } from 'react';
import { Outlet } from 'react-router';
import { applyUiScale, clearUiScale, storedUiScale } from '@/lib/ui-scale';

/**
 * The frame for a full-screen Brand World.
 *
 * It is deliberately almost nothing: the world draws its own rail, its own top
 * bar and its own background, because the whole point is that a creator has
 * left the Wurx chrome behind. What it MUST still do is apply the text-size
 * setting, which `ShellLayout` does for every other signed-in screen. Without
 * it, a creator who has scaled the app up would walk into a brand and find the
 * type jumping back to default, which reads as a different site rather than a
 * different room.
 *
 * `useLayoutEffect` for the same reason as the shell: this resizes everything,
 * and doing it after the first paint shows one frame at the wrong scale.
 */
export function WorldLayout() {
  useLayoutEffect(() => {
    applyUiScale(storedUiScale());
    return clearUiScale;
  }, []);

  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
