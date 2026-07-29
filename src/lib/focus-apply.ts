/**
 * Send someone to the application form and put the cursor in it.
 *
 * Scrolling alone is not enough: on a desktop the form is already on screen in
 * the hero, so "Apply" appeared to do nothing at all. Focusing the first field
 * gives the click a visible result wherever you are on the page.
 */
export function focusApplyForm() {
  const form = document.getElementById('apply-form');
  if (!form) return false;

  form.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const first = form.querySelector<HTMLInputElement>('input[name="tiktokHandle"]');
  if (!first) return true;

  // Wait for the smooth scroll to settle, otherwise focusing yanks the page.
  window.setTimeout(() => first.focus({ preventScroll: true }), 420);
  return true;
}
