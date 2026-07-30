import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keep keyboard focus inside a modal surface, then give it back.
 *
 * Shared by the review dialog and the mobile menu drawer, because both cover
 * the page and both were letting Tab walk out into content the user cannot
 * see. Somebody navigating by keyboard would end up typing into a form hidden
 * behind a scrim with no way to tell.
 *
 * `initialSelector` picks what gets focus on open. It matters: a plain
 * "first focusable" lands on the close button, so a keyboard user opens a form
 * and is immediately parked on the exit.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active = true, initialSelector }: { active?: boolean; initialSelector?: string } = {}
) {
  // Where focus was before we took it, so it can be handed back. Read once, on
  // open, and never refreshed: re-reading later would hand focus to whatever
  // happened to be active mid-interaction.
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    returnTo.current = document.activeElement as HTMLElement | null;

    const preferred = initialSelector
      ? container.querySelector<HTMLElement>(initialSelector)
      : null;
    (preferred ?? container.querySelector<HTMLElement>(FOCUSABLE) ?? container).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Only take focus back if it is still inside the thing we are closing.
      // If something else has deliberately moved it, leave it alone.
      if (container.contains(document.activeElement)) returnTo.current?.focus?.();
    };
    // `initialSelector` is a constant string at every call site; including it
    // would only re-run this on a re-render and steal focus mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, containerRef]);
}
