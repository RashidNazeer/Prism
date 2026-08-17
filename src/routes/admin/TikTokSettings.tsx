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
  useTikTokConnection,
  type AccountMapRow,
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
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function TikTokSettings() {
  const connection = useTikTokConnection();
  const adAccounts = useTikTokAdAccounts();
  const accounts = useTikTokAccounts();
  const brands = useMappableBrands();
  const { connect, recheck, disconnect, map, pull } = useTikTokActions();

  const connected = Boolean(connection.data && !connection.data.revoked_at);

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
    (connect.error as Error | null)?.message ??
    (recheck.error as Error | null)?.message ??
    (disconnect.error as Error | null)?.message ??
    (map.error as Error | null)?.message ??
    null;

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        action={
          connected ? (
            <Button
              variant="secondary"
              onClick={() => recheck.mutate()}
              disabled={busy}
              className="h-10 shrink-0 rounded-md text-[0.875rem]"
            >
              <RefreshCw size={15} aria-hidden className={cn(recheck.isPending && 'animate-spin')} />
              {recheck.isPending ? 'Checking' : 'Re-check'}
            </Button>
          ) : (
            <Button
              onClick={() => connect.mutate()}
              disabled={busy}
              className="h-10 shrink-0 rounded-md text-[0.875rem]"
            >
              <Plug size={15} aria-hidden />
              {connect.isPending ? 'Opening TikTok' : 'Connect TikTok'}
            </Button>
          )
        }
      >
        <FilterTabs label="What to manage">
          {TABS.map((t) => (
            <FilterTab
              key={t.key}
              active={activeTab === t.key}
              count={
                t.key === 'accounts' && connected ? (adAccounts.data?.length ?? 0) : undefined
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
          className="border-danger/40 bg-danger-soft text-danger rounded-lg border p-3 text-[0.8125rem] leading-relaxed"
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
          onMap={(advertiserId, storeId, brandId) => map.mutate({ advertiserId, storeId, brandId })}
          mappingStore={
            map.isPending && map.variables
              ? `${map.variables.advertiserId}:${map.variables.storeId}`
              : undefined
          }
        />
      ) : (
        <ConnectionTab
          health={connection.data ?? null}
          loading={connection.isPending}
          onDisconnect={(id) => disconnect.mutate(id)}
          disconnecting={disconnect.isPending}
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
          <section
            key={account.advertiser_id}
            className="border-line bg-surface-1 rounded-xl border"
          >
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
                      onChange={(e) => onMap(s.advertiser_id, s.store_id, e.target.value || null)}
                      className="border-line bg-surface-2 h-10 min-w-[11rem] rounded-md border px-2 text-[0.8125rem]"
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

function ConnectionTab({
  health,
  loading,
  onDisconnect,
  disconnecting,
  onPull,
  pulling,
  pullResult,
}: {
  health: {
    id: string;
    connected_at: string;
    last_verified_at: string | null;
    last_error: string | null;
    connected_by_name: string | null;
    connected_by_email: string | null;
    granted_advertiser_count: number;
  } | null;
  loading: boolean;
  onDisconnect: (id: string) => void;
  disconnecting: boolean;
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

  if (!health) {
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
    <section className="border-line bg-surface-1 flex flex-col gap-4 rounded-xl border p-5">
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
        LAST CHECKED IS SHOWN BECAUSE THERE IS NO REFRESH TOKEN. TikTok's ads
        API issues one long-lived credential and no way to renew it, so if it is
        revoked at their end nothing here would fail loudly, the numbers would
        simply stop moving. A visible date is what turns that into something
        somebody notices.
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
        <p className="border-warning/40 bg-warning-soft text-warning rounded-md border p-3 text-[0.8125rem] leading-relaxed">
          {health.last_error}
        </p>
      ) : null}

      {/*
        THE NUMBERS ARRIVE ON THEIR OWN, once a night. This button exists for
        the first run and for testing, because waiting until 03:20 UTC to find
        out whether a new brand mapping works is not a way to work.

        A day already pulled is skipped without an API call, so pressing it
        twice costs nothing and it is safe to lean on.
      */}
      <div className="border-line flex flex-wrap items-center gap-2 border-t pt-4">
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
          Runs every night at 03:20 UTC by itself. Complete days only, so today appears tomorrow.
        </p>
      </div>

      {pullResult ? (
        <p
          className={cn(
            'rounded-md border p-3 text-[0.8125rem] leading-relaxed',
            pullResult.failures.length > 0
              ? 'border-warning/40 bg-warning-soft text-warning'
              : 'border-line text-muted'
          )}
        >
          {pullResult.failures.length > 0
            ? `${pullResult.failures.length} day(s) could not be pulled: ${pullResult.failures[0]?.reason}`
            : `Pulled ${pullResult.rowsWritten} video-day${pullResult.rowsWritten === 1 ? '' : 's'} in ${pullResult.calls} call${pullResult.calls === 1 ? '' : 's'}${pullResult.daysSkipped > 0 ? `, skipping ${pullResult.daysSkipped} day(s) already stored` : ''}.`}
        </p>
      ) : null}

      <div className="border-line flex flex-wrap gap-2 border-t pt-4">
        <Button
          variant="secondary"
          onClick={() => onDisconnect(health.id)}
          disabled={disconnecting}
          className="text-danger hover:border-danger hover:text-danger h-10 rounded-md text-[0.875rem]"
        >
          <Unplug size={15} aria-hidden />
          {disconnecting ? 'Disconnecting' : 'Disconnect'}
        </Button>
        <p className="text-muted self-center text-[0.75rem] leading-relaxed">
          Disconnecting deletes the token. The brand matching is kept, so reconnecting does not
          mean doing it again.
        </p>
      </div>
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-line bg-surface-1 rounded-xl border p-8 text-center">
      <h2 className="font-display text-[1.0625rem] font-bold">{title}</h2>
      <p className="text-muted mx-auto mt-2 max-w-prose text-[0.875rem] leading-relaxed">{body}</p>
    </div>
  );
}
