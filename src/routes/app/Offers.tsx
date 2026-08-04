import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import { Check, Clock, Search, Store, Ticket, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ApplyDialog } from '@/components/creator/ApplyDialog';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { money } from '@/lib/money';
import {
  stateFor,
  useAllCreatorOffers,
  useAllMyRequests,
  type CreatorOfferRow,
  type CreatorOfferState,
} from '@/lib/creator/useAllOffers';
import {
  useApplyForOffer,
  type MyOfferApplication,
} from '@/lib/creator/useOfferApplications';

/**
 * Every offer open to this creator, across every brand.
 *
 * The brand hub answers "what is this brand offering me". This answers "what is
 * on the table anywhere", which is the question a creator actually opens the
 * app with. Before this, seeing everything meant remembering every brand and
 * visiting each hub in turn.
 *
 * Filtering happens in the browser rather than the database, and that is a
 * deliberate exception to the project's usual rule. The filters that matter
 * here are "am I in", "am I waiting", "have I not asked", and those live in a
 * different table from the offers themselves. Fetching the offers and their own
 * requests once, then sorting them out here, is one round trip instead of a
 * join a creator would feel on every tab.
 */
type Tab = 'all' | 'in' | 'waiting' | 'open';

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'in', label: 'You are in' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'open', label: 'Not asked yet' },
];

const MATCHES: Record<Tab, (s: CreatorOfferState) => boolean> = {
  all: () => true,
  in: (s) => s === 'in' || s === 'open',
  waiting: (s) => s === 'waiting',
  open: (s) => s === 'canApply' || s === 'declined',
};

export function Offers() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  const [tab, setTab] = useState<Tab>('all');
  const [brandId, setBrandId] = useState('');
  const [search, setSearch] = useState('');
  const [applyingTo, setApplyingTo] = useState<CreatorOfferRow | null>(null);

  const { data: offers, isLoading, isError, error } = useAllCreatorOffers();
  const { data: requests } = useAllMyRequests();

  /** The newest request per offer. A rejected creator can ask again, so an
   *  offer can carry several rows and only the newest describes today. */
  const latest = useMemo(() => {
    const map = new Map<string, MyOfferApplication>();
    for (const r of requests ?? []) if (!map.has(r.offer_id)) map.set(r.offer_id, r);
    return map;
  }, [requests]);

  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of offers ?? []) if (o.brand) seen.set(o.brand.id, o.brand.name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [offers]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, in: 0, waiting: 0, open: 0 };
    for (const o of offers ?? []) {
      const s = stateFor(o, latest.get(o.id));
      c.all += 1;
      (Object.keys(MATCHES) as Tab[]).forEach((t) => {
        if (t !== 'all' && MATCHES[t](s)) c[t] += 1;
      });
    }
    return c;
  }, [offers, latest]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (offers ?? []).filter((o) => {
      if (brandId && o.brand_id !== brandId) return false;
      if (!MATCHES[tab](stateFor(o, latest.get(o.id)))) return false;
      if (!needle) return true;
      return (
        o.title.toLowerCase().includes(needle) ||
        (o.brand?.name ?? '').toLowerCase().includes(needle) ||
        (o.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [offers, latest, tab, brandId, search]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-[clamp(1.4rem,3.5vw,1.9rem)] font-extrabold">Offers</h1>
        <p className="text-[14px] text-muted">
          Everything on the table, from every brand you work with.
        </p>
      </div>

      {!approved ? (
        <LockedUntilApproved className="mt-6" />
      ) : (
        <>
          {/* ------------------------------------------------------- tabs -- */}
          <div className="mt-5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div role="tablist" aria-label="Filter offers" className="flex min-w-max gap-2">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.value}
                  onClick={() => setTab(t.value)}
                  className={cn(
                    'shrink-0 rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors duration-200',
                    tab === t.value
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-line bg-surface-1 text-muted hover:border-accent hover:text-accent'
                  )}
                >
                  {t.label}
                  {counts[t.value] > 0 ? (
                    <span
                      className={cn(
                        'wx-numeric ml-1.5 text-[12px]',
                        tab === t.value ? 'text-on-accent/80' : 'text-faint'
                      )}
                    >
                      {counts[t.value]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {/* ---------------------------------------------------- filters -- */}
          <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className="relative min-w-0 flex-1 basis-52">
              <Search
                size={15}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
              />
              <input
                type="search"
                name="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search offers or brands"
                aria-label="Search offers or brands"
                className="h-9 w-full rounded-xl border border-line-interactive bg-surface-1 pr-3 pl-9 text-[13px] placeholder:text-faint hover:border-accent/60 focus:border-accent focus:outline-none"
              />
            </div>

            <label className="sr-only" htmlFor="brand-filter">
              Filter by brand
            </label>
            <Select
              id="brand-filter"
              name="brand"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="h-9 basis-44 text-[13px]"
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          {/* ------------------------------------------------------- list -- */}
          {isLoading ? (
            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="h-52 animate-pulse rounded-2xl bg-surface-1" />
              ))}
            </ul>
          ) : isError ? (
            <div className="mt-4 rounded-2xl border border-line bg-surface-1 px-6 py-14 text-center">
              <p className="font-semibold">That list would not load</p>
              <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
                {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
              </p>
            </div>
          ) : shown.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-line bg-surface-1 px-6 py-16 text-center">
              <Ticket size={26} aria-hidden className="mx-auto text-faint" />
              <p className="mt-4 font-semibold">
                {(offers ?? []).length === 0 ? 'No offers yet' : 'Nothing matches that'}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
                {(offers ?? []).length === 0
                  ? 'New offers land here as soon as a brand puts one up.'
                  : 'Try a different search, brand or tab.'}
              </p>
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((offer, i) => (
                <m.li
                  key={offer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04 }}
                >
                  <OfferCard
                    offer={offer}
                    request={latest.get(offer.id)}
                    onApply={() => setApplyingTo(offer)}
                  />
                </m.li>
              ))}
            </ul>
          )}
        </>
      )}

      {applyingTo ? (
        <ApplyDialog
          offer={applyingTo}
          brandName={applyingTo.brand?.name ?? 'this brand'}
          onClose={() => setApplyingTo(null)}
        />
      ) : null}
    </AppShell>
  );
}

/* ----------------------------------------------------------------- card -- */

function OfferCard({
  offer,
  request,
  onApply,
}: {
  offer: CreatorOfferRow;
  request: MyOfferApplication | undefined;
  onApply: () => void;
}) {
  const state = stateFor(offer, request);
  const hasVideos = offer.video_count !== null;
  const hasReward = offer.reward_amount !== null;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-surface-1 p-5">
      {/* The brand, first. On this screen it is the thing that tells a creator
          what they are looking at; inside a hub it would be noise. */}
      <Link
        to={`/app/brands/${offer.brand?.slug ?? ''}`}
        className="flex items-center gap-2.5 text-muted transition-colors hover:text-accent"
      >
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2">
          {offer.brand?.logo_url ? (
            <img src={offer.brand.logo_url} alt="" className="size-full object-cover" />
          ) : (
            <Store size={13} aria-hidden className="text-faint" />
          )}
        </span>
        <span className="truncate text-[13px] font-medium">{offer.brand?.name}</span>
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {offer.badge_title ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-accent uppercase">
            {offer.badge_title}
          </span>
        ) : null}
      </div>

      <h3 className="mt-1 text-lg font-bold">{offer.title}</h3>
      {offer.description ? (
        <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-muted">
          {offer.description}
        </p>
      ) : null}

      {hasVideos || hasReward ? (
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-line pt-4">
          {hasVideos ? (
            <span>
              <span className="block font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                Videos
              </span>
              <span className="wx-numeric mt-1 block text-lg font-bold">
                {offer.video_count}
              </span>
            </span>
          ) : null}
          {hasReward ? (
            <span>
              <span className="block font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                You get
              </span>
              <span className="wx-numeric mt-1 block text-lg font-bold text-accent">
                {money(offer.reward_amount, offer.currency)}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto pt-5">
        <Action state={state} request={request} onApply={onApply} />
      </div>
    </div>
  );
}

function Action({
  state,
  request,
  onApply,
}: {
  state: CreatorOfferState;
  request: MyOfferApplication | undefined;
  onApply: () => void;
}) {
  const withdraw = useApplyForOffer();

  if (state === 'open') {
    return (
      <Note tone="success" icon={<Check size={15} aria-hidden />}>
        <span className="font-semibold">You are already on this one</span>
      </Note>
    );
  }

  if (state === 'in') {
    return (
      <Note tone="success" icon={<Check size={15} aria-hidden />}>
        <span className="font-semibold">You are in</span>
        {request?.decision_note ? (
          <span className="mt-0.5 block text-[13px] text-muted">{request.decision_note}</span>
        ) : null}
      </Note>
    );
  }

  if (state === 'waiting') {
    return (
      <div>
        <Note tone="pending" icon={<Clock size={15} aria-hidden />}>
          <span className="font-semibold">With the team</span>
        </Note>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={withdraw.isPending}
          onClick={() =>
            request &&
            withdraw.mutate({ action: 'application.withdraw', applicationId: request.id })
          }
        >
          {withdraw.isPending ? 'Withdrawing...' : 'Withdraw'}
        </Button>
      </div>
    );
  }

  if (state === 'declined') {
    return (
      <div>
        <Note tone="danger" icon={<X size={15} aria-hidden />}>
          <span className="font-semibold">Not this time</span>
          {request?.decision_note ? (
            <span className="mt-0.5 block text-[13px] text-muted">{request.decision_note}</span>
          ) : null}
        </Note>
        <Button variant="secondary" size="sm" className="mt-2" onClick={onApply}>
          Ask again
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" className="w-full sm:w-auto" onClick={onApply}>
      Apply for this
    </Button>
  );
}

function Note({
  tone,
  icon,
  children,
}: {
  tone: 'success' | 'pending' | 'danger';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[14px]',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'pending' && 'bg-warning-soft text-warning',
        tone === 'danger' && 'bg-danger-soft text-danger'
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
