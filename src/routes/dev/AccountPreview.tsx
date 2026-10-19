import { useState } from 'react';
import {
  AccountMenuPanel,
  AccountPopover,
  type AccountMenuPanelProps,
  type TikTokLine,
} from '@/components/creator/account/AccountMenu';

/**
 * DEV-ONLY PREVIEW for the account menu (`/dev/account`).
 *
 * The real menu is a connected component (profile, TikTok and sign-out hooks),
 * but everything it draws is `AccountMenuPanel`, which takes plain props, so
 * this renders the real panel against fixtures and makes no Supabase call at
 * all. Each state is shown in both themes, in a frame the width of the real
 * popover. `?w=390` / `?w=1440` simply change how wide this page is; resize the
 * window to see the phone layout.
 *
 * "Open the real popover" mounts `AccountPopover`, the real placement code,
 * against a stand-in user chip carrying the `data-account-chip` hook: at 1024px
 * and up it sits above the chip, below that it is centred above the phone bar.
 * Try it at 320px.
 */

const noop = () => {};

const base: AccountMenuPanelProps = {
  email: 'rudely@wurxmedia.com',
  name: 'rudely',
  saving: false,
  saved: false,
  onSaveName: noop,
  tiktok: { state: 'off' },
  tiktokBusy: false,
  onConnect: noop,
  onDisconnect: noop,
  onRetryTikTok: noop,
  signingOut: false,
  onSignOut: noop,
  onClose: noop,
};

const CASES: { label: string; props: AccountMenuPanelProps }[] = [
  { label: 'TikTok not connected', props: base },
  {
    label: 'TikTok connected',
    props: { ...base, tiktok: { state: 'connected', handle: '@rudely.creates' } },
  },
  {
    label: 'TikTok errored (TikTok refused us)',
    props: { ...base, tiktok: { state: 'needsReconnect', handle: '@rudely.creates' } },
  },
  {
    label: 'TikTok could not be checked',
    props: { ...base, tiktok: { state: 'loadError' } },
  },
  {
    label: 'Connect refused by the server',
    props: {
      ...base,
      tiktokError: 'Available once your application is approved.',
    },
  },
  {
    label: 'Long email, long handle, name saved',
    props: {
      ...base,
      email: 'a.very.long.address.for.a.creator.who.signed.up.with.it@some-long-agency-domain.example.com',
      name: 'A creator with a rather long display name indeed',
      saved: true,
      tiktok: { state: 'connected', handle: '@a_really_quite_long_tiktok_handle_here_ok' },
    },
  },
  {
    label: 'Saving the name / TikTok busy',
    props: { ...base, saving: true, tiktokBusy: true },
  },
];

function Frame({ props }: { props: AccountMenuPanelProps }) {
  return (
    <div
      className="wx-app wx-neo-raised-sm text-text w-full max-w-[22rem] rounded-xl p-3"
      style={{ backgroundColor: 'var(--wx-surface-1)' }}
    >
      <AccountMenuPanel {...props} />
    </div>
  );
}

export function AccountPreview() {
  const [popover, setPopover] = useState(false);
  const [tiktok, setTiktok] = useState<TikTokLine>({ state: 'off' });

  return (
    <div className="wx-app text-text p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="wx-neo-raised-sm min-h-11 rounded-full px-4 text-[0.8125rem] font-semibold"
          onClick={() => setPopover((v) => !v)}
        >
          {popover ? 'Close' : 'Open'} the real popover
        </button>
        <button
          type="button"
          className="wx-neo-raised-sm min-h-11 rounded-full px-4 text-[0.8125rem] font-semibold"
          onClick={() =>
            setTiktok((t) =>
              t.state === 'off'
                ? { state: 'connected', handle: '@rudely.creates' }
                : t.state === 'connected'
                  ? { state: 'needsReconnect', handle: '@rudely.creates' }
                  : { state: 'off' }
            )
          }
        >
          Popover TikTok: {tiktok.state}
        </button>
      </div>

      {(['dark', 'light'] as const).map((theme) => (
        <section key={theme} data-theme={theme} className="bg-app mt-6 rounded-2xl p-4">
          <p className="text-faint text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            {theme}
          </p>
          <div className="mt-3 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {CASES.map((c) => (
              <div key={c.label} className="min-w-0">
                <p className="text-muted mb-2 text-[0.75rem] font-semibold">{c.label}</p>
                <Frame props={c.props} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* A stand-in for the rail's chip, bottom-left like the real one. */}
      <button
        type="button"
        data-account-chip
        className="wx-neo-inset fixed bottom-3 left-3 z-10 hidden min-h-11 items-center gap-2 rounded-xl px-3 text-[0.8125rem] font-semibold lg:flex"
        onClick={() => setPopover(true)}
      >
        rudely
      </button>

      {popover ? (
        <AccountPopover onClose={() => setPopover(false)}>
          <AccountMenuPanel
            {...base}
            tiktok={tiktok}
            onClose={() => setPopover(false)}
          />
        </AccountPopover>
      ) : null}
    </div>
  );
}
