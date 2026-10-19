import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { m, useReducedMotion } from 'motion/react';
import { z } from 'zod';
import { Check, Link2, Loader2, LogOut, Unlink, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useTikTokAccount, useTikTokAction } from '@/lib/creator/useTikTokAccount';
import { OPEN_ACCOUNT_EVENT, type AccountMenuFocus } from '@/lib/account-menu';
import { cn } from '@/lib/utils';

/**
 * THE ACCOUNT MENU. It replaced the Profile page (Rashid, 2026-10-19: "delete
 * the profile and support page"), and it holds the only two things that page
 * had no other home for: connecting or disconnecting TikTok, and the display
 * name. Role, tier, application facts, text size and theme are not here; the
 * last two live in the top bar.
 *
 * CREATOR AND APPLICANT ONLY. `AppShell` is shared with staff and mounts this
 * behind the same role check as the notification bell, so the admin shell is
 * untouched.
 *
 * OPENED TWO WAYS, neither of which its callers need to know about: the
 * sidebar's user chip and `openAccountMenu()` (a window event, see
 * `@/lib/account-menu`). The menu is mounted in the shell rather than inside
 * the chip because on a phone the rail is a drawer that is not even in the
 * document until it is opened, and "Connect TikTok" on Home has to work then.
 *
 * ZERO BLURRED LAYERS. It is `wx-neo-raised-sm` (the shared glass material
 * without `backdrop-filter`) over an opaque `--wx-surface-1` backing, exactly
 * the recipe the notification panel uses, and it has no scrim. The top bar and
 * the phone bottom bar already spend the page's blur budget.
 *
 * PORTALLED TO <body>, and positioned from measurements. `position: fixed`
 * does not work inside the header, whose `backdrop-filter` makes it the
 * containing block for fixed descendants, and the drawer is transformed for the
 * same reason. Out on <body> fixed means the window, so the placement below is
 * clamped to the window with `clientWidth`/`clientHeight` (not `vw`, which
 * counts the desktop scrollbar) and can never leave the screen, which is what
 * the notification dropdown got wrong at 320px.
 */

const displayNameSchema = z.string().trim().max(60, 'Keep your name under 60 characters');

/**
 * WHAT A PERSON READS WHEN THE SERVER REFUSES. An Edge Function's refusal is
 * written for a log; this is written for the person holding the phone.
 * (Moved here from the old TikTok card on Profile.)
 */
function humanError(message: string): string {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('not allowed')) {
    return 'Available once your application is approved.';
  }
  if (lower.includes('not signed in') || lower.includes('session')) {
    return 'Session expired. Sign in again.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Could not reach the server. Try again.';
  }
  if (!message || /^[a-z_]+$/i.test(message)) {
    return 'Could not connect TikTok. Try again.';
  }
  return message;
}

export type TikTokLine =
  | { state: 'loading' }
  | { state: 'loadError' }
  | { state: 'off' }
  | { state: 'connected'; handle: string }
  /** The row is still theirs but TikTok refused us; the fix is to grant access again. */
  | { state: 'needsReconnect'; handle: string };

export interface AccountMenuPanelProps {
  email: string | undefined;
  /** The saved display name. */
  name: string;
  saving: boolean;
  saved: boolean;
  saveError?: string | undefined;
  onSaveName: (next: string) => void;
  tiktok: TikTokLine;
  tiktokBusy: boolean;
  tiktokError?: string | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
  onRetryTikTok: () => void;
  signingOut: boolean;
  onSignOut: () => void;
  onClose: () => void;
  focus?: AccountMenuFocus | undefined;
}

/** The menu's content. Pure props, so the preview can render every state. */
export function AccountMenuPanel(p: AccountMenuPanelProps) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const tiktokBtnRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* null means "not touched", so a background refetch can never overwrite what
     she is in the middle of typing. */
  const [draft, setDraft] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const value = draft ?? p.name;
  const unchanged = value.trim() === p.name;

  useEffect(() => {
    // Phone: never auto-focus the text field (it throws the keyboard up). Only a
    // caller that asked for the name specifically gets it.
    if (p.focus === 'name') nameRef.current?.focus();
    else if (p.focus === 'tiktok') tiktokBtnRef.current?.focus();
    else rootRef.current?.focus();
  }, [p.focus]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(value);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    p.onSaveName(parsed.data);
    setDraft(null);
  };

  const t = p.tiktok;
  const connected = t.state === 'connected' || t.state === 'needsReconnect';
  const busyIcon = <Loader2 size={16} aria-hidden className="animate-spin" />;

  return (
    <div ref={rootRef} tabIndex={-1} aria-labelledby={titleId} className="outline-none">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[0.9375rem] font-bold">
            Your account
          </h2>
          {p.email ? (
            <p className="text-faint truncate text-[0.75rem]" title={p.email}>
              {p.email}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={p.onClose}
          className="text-muted hover:text-text -mt-1 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-full transition-colors"
        >
          <X size={16} aria-hidden />
          <span className="sr-only">Close</span>
        </button>
      </header>

      {/* ------------------------------------------------------- name -- */}
      <form onSubmit={onSubmit} noValidate className="mt-2">
        <Field label="Display name" error={fieldError ?? p.saveError}>
          {({ id, describedBy, invalid }) => (
            <Input
              ref={nameRef}
              id={id}
              name="displayName"
              autoComplete="name"
              maxLength={60}
              placeholder="Your name"
              value={value}
              disabled={p.saving}
              onChange={(e) => {
                setDraft(e.target.value);
                setFieldError(undefined);
              }}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <div className="mt-2 flex min-h-11 items-center gap-3">
          <Button type="submit" size="md" disabled={p.saving || unchanged}>
            {p.saving ? 'Saving...' : 'Save'}
          </Button>
          {p.saved ? (
            <span
              role="status"
              className="text-success inline-flex items-center gap-1.5 text-[0.8125rem]"
            >
              <Check size={15} aria-hidden />
              Saved
            </span>
          ) : null}
        </div>
      </form>

      {/* ----------------------------------------------------- tiktok -- */}
      <section aria-label="TikTok" className="wx-neo-inset mt-3 rounded-xl px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              'block size-2 shrink-0 rounded-full',
              t.state === 'connected'
                ? 'bg-success'
                : t.state === 'needsReconnect' || t.state === 'loadError'
                  ? 'bg-danger'
                  : 'bg-line'
            )}
          />
          <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
            <span className="font-semibold">TikTok</span>{' '}
            <span className="text-muted [overflow-wrap:anywhere]">
              {t.state === 'loading'
                ? 'checking...'
                : t.state === 'loadError'
                  ? 'could not be checked'
                  : t.state === 'off'
                    ? 'not connected'
                    : t.state === 'needsReconnect'
                      ? `needs reconnecting (${t.handle})`
                      : `connected as ${t.handle}`}
            </span>
          </p>
        </div>


        {confirming && connected ? (
          <div className="bg-danger-soft mt-3 rounded-lg p-3">
            <p className="text-danger text-[0.75rem] leading-relaxed font-medium">
              Disconnect TikTok and delete its figures?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="md"
                disabled={p.tiktokBusy}
                onClick={() => {
                  setConfirming(false);
                  p.onDisconnect();
                }}
              >
                Yes, disconnect
              </Button>
              <Button variant="ghost" size="md" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : t.state === 'loading' ? null : (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            {t.state === 'loadError' ? (
              <Button ref={tiktokBtnRef} variant="secondary" size="md" onClick={p.onRetryTikTok}>
                Try again
              </Button>
            ) : t.state === 'connected' ? (
              <Button
                ref={tiktokBtnRef}
                variant="secondary"
                size="md"
                disabled={p.tiktokBusy}
                onClick={() => setConfirming(true)}
              >
                {p.tiktokBusy ? busyIcon : <Unlink size={16} aria-hidden />}
                Disconnect
              </Button>
            ) : (
              <>
                <Button ref={tiktokBtnRef} size="md" disabled={p.tiktokBusy} onClick={p.onConnect}>
                  {p.tiktokBusy ? busyIcon : <Link2 size={16} aria-hidden />}
                  {p.tiktokBusy
                    ? 'Opening TikTok...'
                    : t.state === 'needsReconnect'
                      ? 'Reconnect'
                      : 'Connect TikTok'}
                </Button>
                {/* An errored link still has to be removable. A quiet text
                    action, so the card keeps exactly one button. */}
                {t.state === 'needsReconnect' ? (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="text-muted hover:text-danger min-h-11 px-1 text-[0.8125rem] font-semibold underline-offset-2 hover:underline"
                  >
                    Disconnect
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}
        {p.tiktokError ? (
          <p role="alert" className="text-danger mt-2 text-[0.75rem] leading-relaxed">
            {p.tiktokError}
          </p>
        ) : null}
      </section>

      {/* --------------------------------------------------- sign out -- */}
      <button
        type="button"
        disabled={p.signingOut}
        onClick={p.onSignOut}
        className="text-muted hover:text-danger mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-[0.8125rem] font-semibold transition-colors disabled:opacity-50"
      >
        <LogOut size={15} aria-hidden />
        {p.signingOut ? 'Signing out...' : 'Sign out'}
      </button>
    </div>
  );
}

type Place = { left: number; bottom: number; width: number; maxHeight: number };

/**
 * The popover shell: measures, clamps, closes on Escape and on pointer-away.
 * Exported so the preview shows the real placement logic.
 */
export function AccountPopover({
  anchorSelector = '[data-account-chip]',
  onClose,
  children,
}: {
  anchorSelector?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (ref.current?.contains(t as Node)) return;
      // The chip opens it by itself; closing here would just reopen on its click.
      if (t?.closest?.(anchorSelector)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchorSelector]);

  useLayoutEffect(() => {
    const measure = () => {
      const doc = document.documentElement;
      const rem = parseFloat(getComputedStyle(doc).fontSize) || 16;
      const gutter = 0.75 * rem;
      const vw = doc.clientWidth;
      const vh = doc.clientHeight;
      const wide = window.matchMedia('(min-width: 1024px)').matches;
      const width = Math.min((wide ? 20 : 22) * rem, vw - 2 * gutter);

      // The chip lives in the rail at lg and up. Below that the rail is a
      // drawer that is about to close, so there is nothing to anchor to.
      const chip = wide
        ? Array.from(document.querySelectorAll<HTMLElement>(anchorSelector)).find(
            (el) => el.getClientRects().length > 0
          )
        : undefined;

      if (chip) {
        const r = chip.getBoundingClientRect();
        const left = Math.min(Math.max(r.left, gutter), vw - gutter - width);
        const bottom = Math.max(gutter, vh - r.top + 0.5 * rem);
        setPlace({ left, bottom, width, maxHeight: Math.max(14 * rem, vh - bottom - gutter) });
      } else {
        // Centred, standing clear of the phone bottom bar (5.5rem is the
        // clearance AppShell already reserves for it).
        const clear = wide ? gutter : 5.5 * rem + gutter;
        setPlace({
          left: Math.max(gutter, (vw - width) / 2),
          bottom: clear,
          width,
          maxHeight: Math.max(14 * rem, vh - clear - gutter),
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [anchorSelector]);

  return createPortal(
    <m.div
      ref={ref}
      role="dialog"
      aria-label="Your account"
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="wx-app wx-neo-raised-sm text-text fixed z-[70] overflow-y-auto overscroll-contain rounded-xl p-3"
      style={{
        backgroundColor: 'var(--wx-surface-1)',
        // Invisible until measured, so it never flashes at the wrong place.
        ...(place
          ? {
              left: `${place.left}px`,
              bottom: `${place.bottom}px`,
              width: `${place.width}px`,
              maxHeight: `${place.maxHeight}px`,
            }
          : { left: 0, bottom: 0, visibility: 'hidden' as const, width: '20rem' }),
      }}
    >
      {children}
    </m.div>,
    document.body
  );
}

/**
 * Mounted once in the shell, for creators and applicants only. Listens for
 * `OPEN_ACCOUNT_EVENT` and renders nothing at all until it fires.
 */
export function AccountMenu({
  signingOut,
  onSignOut,
}: {
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<AccountMenuFocus | undefined>();
  const returnTo = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const onOpen = (e: Event) => {
      const f = (e as CustomEvent<{ focus?: AccountMenuFocus }>).detail?.focus;
      returnTo.current = document.activeElement as HTMLElement | null;
      setFocus(f);
      setOpen(true);
    };
    window.addEventListener(OPEN_ACCOUNT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ACCOUNT_EVENT, onOpen);
  }, []);

  // Going somewhere else closes it, the same as the drawer.
  useEffect(() => setOpen(false), [pathname]);

  const close = () => {
    setOpen(false);
    returnTo.current?.focus?.();
  };

  return open ? (
    <AccountMenuConnected
      focus={focus}
      signingOut={signingOut}
      onSignOut={onSignOut}
      onClose={close}
    />
  ) : null;
}

/** Only mounted while open, so no query runs for a menu nobody opened. */
function AccountMenuConnected({
  focus,
  signingOut,
  onSignOut,
  onClose,
}: {
  focus: AccountMenuFocus | undefined;
  signingOut: boolean;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const accountQuery = useTikTokAccount();
  const act = useTikTokAction();
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await getSupabase()
        .from('profiles')
        .update({ display_name: next || null })
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  const account = accountQuery.data;
  const handle = account?.username
    ? `@${account.username}`
    : (account?.display_name ?? 'your account');
  const tiktok: TikTokLine = accountQuery.isError
    ? { state: 'loadError' }
    : accountQuery.isLoading
      ? { state: 'loading' }
      : !account
        ? { state: 'off' }
        : account.last_error
          ? { state: 'needsReconnect', handle }
          : { state: 'connected', handle };

  // The existing user-initiated connect path: the Edge Function builds the URL
  // because it holds the client key. No new call.
  const connect = async () => {
    const r = await act.mutateAsync('connect.start').catch(() => null);
    if (r?.url) window.location.href = r.url;
  };

  return (
    <AccountPopover onClose={onClose}>
      <AccountMenuPanel
        email={profile?.email}
        name={profile?.display_name ?? ''}
        saving={save.isPending}
        saved={saved}
        saveError={save.error ? (save.error as Error).message : undefined}
        onSaveName={(n) => save.mutate(n)}
        tiktok={tiktok}
        tiktokBusy={act.isPending}
        tiktokError={act.error ? humanError((act.error as Error).message) : undefined}
        onConnect={() => void connect()}
        onDisconnect={() => act.mutate('disconnect')}
        onRetryTikTok={() => void accountQuery.refetch()}
        signingOut={signingOut}
        onSignOut={onSignOut}
        onClose={onClose}
        focus={focus}
      />
    </AccountPopover>
  );
}
