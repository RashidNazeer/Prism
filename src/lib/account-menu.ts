/**
 * THE ONE WAY ANYTHING OPENS THE ACCOUNT MENU.
 *
 * The Profile page is being removed (Rashid, 2026-10-19: "delete the profile
 * and support page"), and what it held — connecting and disconnecting TikTok,
 * editing a display name — moves into a small menu on the sidebar's user chip.
 * Three places used to LINK to /app/profile to start the TikTok connection
 * (Home for applicants, Content, the OAuth return). A link to a page that no
 * longer exists is a dead end, so they call this instead.
 *
 * AN EVENT, NOT A URL PARAMETER. The menu is a piece of the shell and lives
 * on every screen; a window event reaches it from any page without that page
 * knowing the shell's internals, without adding a query string to the address
 * bar, and without a navigation that would unmount the screen she was on.
 *
 * Whoever builds the menu listens for `OPEN_ACCOUNT_EVENT`. Whoever wants it
 * open calls `openAccountMenu()`. Neither imports the other.
 */

export const OPEN_ACCOUNT_EVENT = 'wx:open-account';

/** Which part of the menu the caller cares about, so it can scroll to or highlight it. */
export type AccountMenuFocus = 'tiktok' | 'name';

export function openAccountMenu(focus?: AccountMenuFocus): void {
  window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_EVENT, { detail: { focus } }));
}
