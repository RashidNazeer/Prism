import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Link2,
  Plug,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { Button } from '@/components/ui/Button';
import {
  useMappableBrands,
  useTikTokAdAccounts,
  useTikTokAccounts,
  useTikTokActions,
  useTikTokConnections,
  useTikTokIdentities,
  type TikTokIdentity,
  type AccountMapRow,
  type ConnectionHealth,
  type AdAccount,
} from '@/lib/admin/useTikTok';
import { cn } from '@/lib/utils';

/**
 * Data → TikTok. The ad account connection, and which Wurx brand each TikTok
 * store belongs to.
 *
 * ADMIN ONLY, and creators are never told this exists. They read numbers; the
 * fact that the numbers come from a TikTok app is ours.
 *
 * MAPPING IS A SETTINGS JOB, NOT A WIZARD STEP, which was Rashid's own
 * correction on 2026-08-17: "some brands are not yet added so admin can add
 * later and then map". So an unmapped store is a perfectly normal state, it is
 * shown plainly rather than as an error, and the mapping can be changed or
 * cleared at any time.
 *
 * The screen draws no title and no description of itself: the top bar names the
 * section, and row one is the work. See CLAUDE.md, screen chrome.
 */

const TABS = [
  { key: 'accounts', label: 'Ad accounts' },
  { key: 'connection', label: 'Connection' },
  /* Creator identities live here rather than under People, because this is the
     screen about TikTok and the claim is a TikTok fact. It is also the only
     place staff can undo a bar, so it must be findable without being told. */
  { key: 'identities', label: 'Creator accounts' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function TikTokSettings() {
  const connections = useTikTokConnections();
  const adAccounts = useTikTokAdAccounts();
  const accounts = useTikTokAccounts();
  const brands = useMappableBrands();
  const identities = useTikTokIdentities();
  const { connect, recheck, disconnect, map, pull, release } = useTikTokActions();

  /*
   * CONNECTIONS, PLURAL, from 2026-08-20. Rashid: "each brand will have it’s
   * own Business center connection so there must be an option to connect
   * multiple ad accounts and link them properly with brand."
   *
   * The screen used to hold one, and worse, it rendered EITHER Connect OR
   * Re-check on that one, so once anything was connected the Connect button
   * was gone and a second Business Center could not be started at all. That
   * was a blocked path, not a cosmetic one.
   */
  const live = connections.data ?? [];
  const connected = live.length > 0;

  /*
   * The default tab is the job, not the summary. When there is a connection the
   * job is mapping stores to brands; when there is not, the only job available
   * is making one. Undefined until the query answers, so the screen does not
   * flash the wrong tab and move under the pointer.
   */
  const [tab, setTab] = useState<TabKey | null>(null);
  const activeTab: TabKey = tab ?? (connected ? 'accounts' : 'connection');

  const unmapped = useMemo(
    () => (accounts.data ?? []).filter((r) => !r.brand_id).length,
    [accounts.data]
  );

  const busy = connect.isPending || recheck.isPending || disconnect.isPending;

  const actionError =
    (connections.error as Error | null)?.message ??
    (connect.error as Error | null)?.message ??
    (recheck.error as Error | null)?.message ??
    (disconnect.error as Error | null)?.message ??
    (map.error as Error | null)?.message ??
    null;

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        action={
          /*
           * CONNECT IS ALWAYS THERE. It used to be replaced by Re-check the
           * moment anything was connected, which meant a second Business
           * Center could never be started: the OAuth flow has no other door.
           * Both buttons now, and the label says which one this is.
           */
          <div className="flex shrink-0 flex-wrap gap-2">
            {connected ? (
              <Button
                variant="secondary"
                onClick={() => recheck.mutate()}
                disabled={busy}
                className="h-10 shrink-0 rounded-md text-[0.875rem]"
              >
                <RefreshCw
                  size={15}
                  aria-hidden
                  className={cn(recheck.isPending && 'animate-spin')}
                />
                {recheck.isPending ? 'Checking' : 'Re-check'}
              </Button>
            ) : null}
            <Button
              onClick={() => connect.mutate()}
              disabled={busy}
              className="h-10 shrink-0 rounded-md text-[0.875rem]"
            >
              <Plug size={15} aria-hidden />
              {connect.isPending
                ? 'Opening TikTok'
                : connected
                  ? 'Connect another'
                  : 'Connect TikTok'}
            </Button>
          </div>
        }
      >
        <FilterTabs label="What to manage">
          {TABS.map((t) => (
            <FilterTab
              key={t.key}
              active={activeTab === t.key}
              count={
                t.key === 'accounts' && connected
                  ? (adAccounts.data?.length ?? 0)
                  : t.key === 'identities'
                    ? (identities.data?.filter((i) => !i.released_at).length ?? undefined)
                    : undefined
              }
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </FilterTab>
          ))}
        </FilterTabs>

        {connected && unmapped > 0 ? (
          <span className="text-warning wx-numeric text-[0.75rem] font-semibold">
            {unmapped} not mapped to a brand yet
          </span>
        ) : null}
      </FilterBar>

      {actionError ? (
        <p
          role="alert"
          className="bg-danger-soft text-danger rounded-lg p-3 text-[0.8125rem] leading-relaxed"
        >
          {actionError}
        </p>
      ) : null}

      {activeTab === 'accounts' ? (
        <AccountsTab
          accounts={adAccounts.data ?? []}
          rows={accounts.data ?? []}
          loading={accounts.isPending || adAccounts.isPending}
          connected={connected}
          brands={brands.data ?? []}
          onMap={(advertiserId, storeId, brandId) =>
            map.mutate({ advertiserId, storeId, brandId })
          }
          mappingStore={
            map.isPending && map.variables
              ? `${map.variables.advertiserId}:${map.variables.storeId}`
              : undefined
          }
        />
      ) : activeTab === 'identities' ? (
        <IdentitiesTab
          rows={identities.data ?? []}
          loading={identities.isPending}
          error={identities.error ? String((identities.error as Error).message) : null}
          onRelease={(identityId, reason) => release.mutate({ identityId, reason })}
          releasingId={release.isPending ? (release.variables?.identityId ?? null) : null}
          releaseError={release.error ? String((release.error as Error).message) : null}
        />
      ) : (
        <ConnectionTab
          connections={live}
          loading={connections.isPending}
          onDisconnect={(id) => disconnect.mutate(id)}
          disconnectingId={disconnect.isPending ? (disconnect.variables ?? null) : null}
          onPull={(days) => pull.mutate(days)}
          pulling={pull.isPending}
          pullResult={pull.data ?? null}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- accounts --- */

function AccountsTab({
  accounts,
  rows,
  loading,
  connected,
  brands,
  onMap,
  mappingStore,
}: {
  accounts: AdAccount[];
  rows: AccountMapRow[];
  loading: boolean;
  connected: boolean;
  brands: { id: string; name: string }[];
  onMap: (advertiserId: string, storeId: string, brandId: string | null) => void;
  mappingStore: string | undefined;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="wx-skeleton h-24 rounded-xl" />
        <div className="wx-skeleton h-24 rounded-xl" />
      </div>
    );
  }

  if (!connected) {
    return (
      <Empty
        title="No TikTok account is connected"
        body="Connect the TikTok Business account that runs the GMV Max ads, and the ad accounts it can reach will appear here ready to be matched to brands."
      />
    );
  }

  if (accounts.length === 0) {
    return (
      <Empty
        title="Connected, but no ad accounts came back"
        body="The connection is good and TikTok named no ad accounts on it. Press Re-check, or confirm the TikTok account you authorised has access to the ad accounts you expected."
      />
    );
  }

  /*
   * ONE SECTION PER AD ACCOUNT, WITH ITS STORES INSIDE, and the account is what
   * drives the list. Building this from the stores was the bug Rashid hit: he
   * connected, both accounts saved correctly, and the screen said zero, because
   * a join from stores has nothing to say about an account with no shop.
   *
   * The currency and timezone live on the account header, because every figure
   * we will ever show is denominated in them and they must stay attached to the
   * numbers rather than float off into a settings page nobody rereads.
   */
  const storesByAccount = new Map<string, AccountMapRow[]>();
  for (const r of rows) {
    const list = storesByAccount.get(r.advertiser_id) ?? [];
    list.push(r);
    storesByAccount.set(r.advertiser_id, list);
  }

  return (
    <div className="flex flex-col gap-4">
      {accounts.map((account) => {
        const stores = storesByAccount.get(account.advertiser_id) ?? [];
        return (
          <section key={account.advertiser_id} className="wx-neo-raised rounded-xl">
            <header className="border-line flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3">
              <h2 className="font-display text-[1rem] font-bold">
                {account.name ?? 'Unnamed ad account'}
              </h2>
              <span className="text-muted wx-numeric text-[0.75rem]">
                {account.currency ?? 'currency unknown'} ·{' '}
                {account.timezone ?? 'timezone unknown'}
              </span>
            </header>

            {stores.length === 0 ? (
              <p className="text-muted px-4 py-4 text-[0.8125rem] leading-relaxed">
                No TikTok Shop is attached to this ad account, so there is nothing to match to a
                brand and no spend to read from it yet.
              </p>
            ) : (
              <ul className="divide-line divide-y">
                {stores.map((s) => (
                  <li
                    key={`${s.advertiser_id}:${s.store_id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3"
                  >
                    <div className="min-w-[10rem] flex-1">
                      <p className="text-[0.875rem] font-medium">
                        {s.store_name ?? 'Unnamed store'}
                      </p>
                      {s.brand_id ? (
                        <p className="text-muted mt-0.5 flex items-center gap-1.5 text-[0.75rem]">
                          <Link2 size={12} aria-hidden />
                          Showing as {s.brand_name}
                        </p>
                      ) : (
                        <p className="text-warning mt-0.5 text-[0.75rem]">
                          Not matched to a brand yet
                        </p>
                      )}
                      {/*
                      TikTok's own flag. A store without it will never return a
                      single figure, and finding that out weeks later as an
                      empty report is worse than being told now.
                    */}
                      {s.is_gmv_max_available === false ? (
                        <p className="text-warning mt-0.5 flex items-center gap-1.5 text-[0.75rem]">
                          <AlertTriangle size={12} aria-hidden />
                          GMV Max is not switched on for this store
                        </p>
                      ) : null}
                    </div>

                    {/*
                    A plain select rather than a dialog. Mapping is something an
                    admin will do a handful of times and then change rarely, and
                    a two-click popup for one decision is worse than a control
                    that shows the current answer while it sits there.
                  */}
                    <label className="flex shrink-0 items-center gap-2">
                      <span className="text-faint text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
                        Brand
                      </span>
                      <select
                        value={s.brand_id ?? ''}
                        disabled={mappingStore === `${s.advertiser_id}:${s.store_id}`}
                        onChange={(e) =>
                          onMap(s.advertiser_id, s.store_id, e.target.value || null)
                        }
                        className="wx-neo-inset h-10 min-w-[11rem] rounded-md px-2 text-[0.8125rem]"
                      >
                        <option value="">Not matched</option>
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- connection --- */

/**
 * EVERY LIVE CONNECTION, one card each.
 *
 * It rendered a single connection until 2026-08-20, because until then a
 * project only ever had one: the callback revoked the others on the way in.
 * Under Rashid’s plan of one Business Center per brand there can be several at
 * once, each with its own token covering its own ad accounts, so “the
 * connection” is not a thing that exists any more.
 *
 * DISCONNECT IS PER CARD, and it always was in the database — the Edge
 * Function has taken a connectionId since it was written. What was missing was
 * a screen that could name more than one.
 *
 * The pull button stays outside the list. It is one job for the whole project:
 * the sync sweeps every mapped store across every connection in a single run,
 * so a button per connection would imply a per-connection pull that does not
 * exist.
 */
function ConnectionTab({
  connections,
  loading,
  onDisconnect,
  disconnectingId,
  onPull,
  pulling,
  pullResult,
}: {
  connections: ConnectionHealth[];
  loading: boolean;
  onDisconnect: (id: string) => void;
  disconnectingId: string | null;
  onPull: (days: number) => void;
  pulling: boolean;
  pullResult: {
    calls: number;
    rowsWritten: number;
    daysSkipped: number;
    failures: { store: string; date: string; reason: string }[];
  } | null;
}) {
  if (loading) return <div className="wx-skeleton h-40 rounded-xl" />;

  if (connections.length === 0) {
    return (
      <Empty
        title="Not connected"
        body="Press Connect TikTok. You will be sent to TikTok to authorise Wurx Ads Reporting, and brought straight back. Only an admin can do this, and creators never see it."
      />
    );
  }

  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'never';

  return (
    <div className="flex flex-col gap-4">
      {connections.map((health) => (
        <section key={health.id} className="wx-neo-raised flex flex-col gap-4 rounded-xl p-5">
          <div className="flex items-start gap-3">
            {health.last_error ? (
              <AlertTriangle size={20} aria-hidden className="text-warning mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={20} aria-hidden className="text-success mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="font-display text-[1.0625rem] font-bold">
                {health.last_error ? 'Connected, with a problem' : 'Connected'}
              </h2>
              <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
                Authorised {when(health.connected_at)}
                {health.connected_by_name || health.connected_by_email
                  ? ` by ${health.connected_by_name ?? health.connected_by_email}`
                  : ''}
                . TikTok granted {health.granted_advertiser_count} ad{' '}
                {health.granted_advertiser_count === 1 ? 'account' : 'accounts'}.
              </p>
            </div>
          </div>

          {/*
            LAST CHECKED IS SHOWN BECAUSE THERE IS NO REFRESH TOKEN. TikTok's
            ads API issues one long-lived credential and no way to renew it, so
            if it is revoked at their end nothing here would fail loudly, the
            numbers would simply stop moving. A visible date is what turns that
            into something somebody notices — and with several connections it
            is what says WHICH brand's figures have gone quiet.
          */}
          <dl className="border-line grid gap-x-6 gap-y-2 border-t pt-4 text-[0.8125rem] sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-faint text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
                Last checked
              </dt>
              <dd className="wx-numeric">{when(health.last_verified_at)}</dd>
            </div>
          </dl>

          {health.last_error ? (
            <p className="bg-warning-soft text-warning rounded-md p-3 text-[0.8125rem] leading-relaxed">
              {health.last_error}
            </p>
          ) : null}

          <div className="border-line flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="secondary"
              onClick={() => onDisconnect(health.id)}
              disabled={disconnectingId !== null}
              className="text-danger hover:text-danger h-10 rounded-md text-[0.875rem]"
            >
              <Unplug size={15} aria-hidden />
              {disconnectingId === health.id ? 'Disconnecting' : 'Disconnect'}
            </Button>
            <p className="text-muted self-center text-[0.75rem] leading-relaxed">
              {/*
                WHAT IT ACTUALLY COSTS, said plainly, because with one Business
                Center per brand this stops one brand's figures rather than all
                of them, and an admin should know which before clicking.
              */}
              Deletes this token only. Its brand matching is kept, so reconnecting does not mean
              doing it again. Until then, the brands on these ad accounts stop updating.
            </p>
          </div>
        </section>
      ))}

      <section className="wx-neo-raised flex flex-col gap-4 rounded-xl p-5">
        {/*
        THE NUMBERS ARRIVE ON THEIR OWN, once a night. This button exists for
        the first run and for testing, because waiting until 03:20 UTC to find
        out whether a new brand mapping works is not a way to work.

        A day already pulled is skipped without an API call, so pressing it
        twice costs nothing and it is safe to lean on.
      */}
        {/* No top border: this is the first thing in its own card now that the
          connections are listed above it, and the rule was drawing a line under
          nothing. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => onPull(30)}
            disabled={pulling}
            className="h-10 rounded-md text-[0.875rem]"
          >
            <Download size={15} aria-hidden />
            {pulling ? 'Pulling' : 'Pull the last 30 days'}
          </Button>
          <p className="text-muted text-[0.75rem] leading-relaxed">
            Runs every night at 03:20 UTC by itself. Complete days only, so today appears
            tomorrow.
          </p>
        </div>

        {pullResult ? (
          <p
            className={cn(
              'rounded-md p-3 text-[0.8125rem] leading-relaxed',
              pullResult.failures.length > 0 ? 'bg-warning-soft text-warning' : 'text-muted'
            )}
          >
            {pullResult.failures.length > 0
              ? `${pullResult.failures.length} day(s) could not be pulled: ${pullResult.failures[0]?.reason}`
              : `Pulled ${pullResult.rowsWritten} video-day${pullResult.rowsWritten === 1 ? '' : 's'} in ${pullResult.calls} call${pullResult.calls === 1 ? '' : 's'}${pullResult.daysSkipped > 0 ? `, skipping ${pullResult.daysSkipped} day(s) already stored` : ''}.`}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/* ---------------------------------------------------- creator accounts --- */

/**
 * WHICH TIKTOK ACCOUNTS HAVE ALREADY APPLIED, and the one button that undoes it.
 *
 * Rashid, 2026-09-28: "the same person should never be able to apply again" —
 * and then, when asked whether that should be for ever: "it should not be
 * permanent, we should let admin review the rejected again". Both halves are
 * here. The claim is permanent until a human decides otherwise, and the deciding
 * takes one click and a sentence.
 *
 * A RELEASED ROW IS KEPT, not deleted, so "this account applied in August and we
 * let them back in" stays readable a year later.
 *
 * The reason box is required by the DATABASE, not by this form. A release
 * without one is refused however it is called, which is what stops the reason
 * becoming optional the first time somebody is in a hurry.
 */
function IdentitiesTab({
  rows,
  loading,
  error,
  onRelease,
  releasingId,
  releaseError,
}: {
  rows: TikTokIdentity[];
  loading: boolean;
  error: string | null;
  onRelease: (identityId: string, reason: string) => void;
  releasingId: string | null;
  releaseError: string | null;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="wx-skeleton h-20 rounded-xl" />
        <div className="wx-skeleton h-20 rounded-xl" />
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="bg-danger-soft text-danger rounded-lg p-3 text-[0.8125rem]">
        {error}
      </p>
    );
  }
  if (!rows.length) {
    return (
      <Empty
        title="No TikTok account has applied yet"
        body="When a creator connects their TikTok account, it is recorded here so the same account cannot hold two applications. You can release one at any time to let it apply again."
      />
    );
  }

  const live = rows.filter((r) => !r.released_at);
  const released = rows.filter((r) => r.released_at);

  const Row = ({ r }: { r: TikTokIdentity }) => {
    const who = r.profile?.display_name || r.profile?.email || null;
    const isOpen = openFor === r.id;
    return (
      <li className="wx-neo-raised rounded-xl p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-bold">
              {r.handle ? `@${r.handle}` : who || 'A TikTok account'}
            </p>
            <p className="text-muted mt-0.5 truncate text-[0.8125rem]">
              {who ? who : 'the account that claimed it has been deleted'}
              {' · claimed '}
              {new Date(r.claimed_at).toLocaleDateString()}
              {r.source === 'backfill' ? ' · recorded when the rule was added' : ''}
            </p>
            {r.released_at ? (
              <p className="text-muted mt-1 text-[0.8125rem]">
                Released {new Date(r.released_at).toLocaleDateString()}
                {r.release_reason ? ` — ${r.release_reason}` : ''}
              </p>
            ) : null}
          </div>

          {r.released_at ? (
            <span className="text-muted wx-numeric text-[0.75rem] font-semibold">
              can apply again
            </span>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setOpenFor(isOpen ? null : r.id);
                setReason('');
              }}
            >
              {isOpen ? 'Cancel' : 'Let this account apply again'}
            </Button>
          )}
        </div>

        {isOpen ? (
          <div className="border-line mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor={`reason-${r.id}`}>
              Why are you releasing this TikTok account?
            </label>
            <input
              id={`reason-${r.id}`}
              className="wx-neo-inset min-w-0 flex-1 rounded-md px-3 py-2 text-[0.875rem]"
              placeholder="Why? e.g. rejected in August, invited back for Q4"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              onClick={() => onRelease(r.id, reason.trim())}
              disabled={!reason.trim() || releasingId === r.id}
            >
              {releasingId === r.id ? 'Releasing…' : 'Release'}
            </Button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {releaseError ? (
        <p role="alert" className="bg-danger-soft text-danger rounded-lg p-3 text-[0.8125rem]">
          {releaseError}
        </p>
      ) : null}

      <section>
        <h2 className="text-muted mb-2 text-[0.75rem] font-bold tracking-wide uppercase">
          Claimed · {live.length}
        </h2>
        {live.length ? (
          <ul className="flex flex-col gap-2">
            {live.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        ) : (
          <p className="text-muted text-[0.875rem]">No TikTok account is currently claimed.</p>
        )}
      </section>

      {released.length ? (
        <section>
          <h2 className="text-muted mb-2 text-[0.75rem] font-bold tracking-wide uppercase">
            Released · {released.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {released.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="wx-neo-raised rounded-xl p-8 text-center">
      <h2 className="font-display text-[1.0625rem] font-bold">{title}</h2>
      <p className="text-muted mx-auto mt-2 max-w-prose text-[0.875rem] leading-relaxed">
        {body}
      </p>
    </div>
  );
}
