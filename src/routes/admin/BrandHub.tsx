import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  Gift,
  Info,
  LayoutDashboard,
  Megaphone,
  Pencil,
  Percent,
  Plus,
  Tag,
  Ticket,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { BrandAbout } from '@/components/admin/BrandAbout';
import { BrandDialog } from '@/components/admin/BrandDialog';
import { OfferDialog } from '@/components/admin/OfferDialog';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import { BudgetBar } from '@/components/admin/BudgetBar';
import {
  budgetOf,
  money,
  useBrand,
  useOffers,
  useProducts,
  type Brand,
  type Offer,
} from '@/lib/admin/useBrands';

/**
 * The Brand Hub.
 *
 * Everything that belongs to one brand lives behind these tabs.
 *
 * Two layout rules from CLAUDE.md are load bearing here. The brand's facts sit
 * under Overview rather than stacked above the work, and the hub OPENS on
 * Offers, because that is what somebody came to a brand to do. Landing on a
 * summary would push the offers below a screenful of things they already know.
 */
const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'offers', label: 'Offers', icon: Tag },
  { key: 'about', label: 'About', icon: Info },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone, soon: 'Next' },
  { key: 'contests', label: 'Contests', icon: Trophy, soon: 'Next' },
  { key: 'promotions', label: 'Promotions', icon: Gift, soon: 'Later' },
  { key: 'discounts', label: 'Discounts', icon: Percent, soon: 'Later' },
  { key: 'creators', label: 'Creators', icon: Users, soon: 'Later' },
] as const;

const BUILT = new Set(['overview', 'offers', 'about']);

export function BrandHub() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const requested = params.get('section') ?? 'offers';
  const section = BUILT.has(requested) ? requested : 'offers';

  const { data: brand, isLoading, isError, error } = useBrand(id);
  const { data: offers, isLoading: offersLoading } = useOffers(id);

  const [editingBrand, setEditingBrand] = useState(false);
  const [offerDialog, setOfferDialog] = useState<{ offer?: Offer } | null>(null);

  const go = (key: string) => {
    const p = new URLSearchParams();
    if (key !== 'offers') p.set('section', key);
    setParams(p, { replace: true });
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-3xl space-y-4">
          <div className="h-8 w-56 animate-pulse rounded bg-surface-2" />
          <div className="h-10 w-full animate-pulse rounded bg-surface-1" />
          <div className="h-36 animate-pulse rounded-2xl bg-surface-1" />
        </div>
      </AppShell>
    );
  }

  if (isError || !brand) {
    return (
      <AppShell>
        <div className="max-w-lg rounded-2xl border border-line bg-surface-1 p-8 text-center">
          <p className="font-semibold">
            {isError ? 'That brand would not load' : 'No such brand'}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            {(error as Error)?.message ??
              'It may have been removed. Nothing else is affected.'}
          </p>
          <ButtonLink to="/admin/brands" variant="secondary" size="sm" className="mt-5">
            Back to brands
          </ButtonLink>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* --------------------------------------------------------- header -- */}
      {/* One row: back, name, and the only action that belongs up here. The
          slug is gone; it is plumbing, and an admin has no use for a route. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to="/admin/brands"
          aria-label="Back to all brands"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors duration-200 hover:border-accent hover:text-accent"
        >
          <ArrowLeft size={15} aria-hidden />
        </Link>

        {brand.logo_url ? (
          <img
            src={brand.logo_url}
            alt=""
            className="size-8 shrink-0 rounded-full border border-line object-cover"
          />
        ) : null}

        <h1 className="min-w-0 text-[clamp(1.35rem,3vw,1.75rem)] font-extrabold break-words">
          {brand.name}
        </h1>

        {!brand.is_active ? (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
            Retired
          </span>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditingBrand(true)}
          className="ml-auto shrink-0"
        >
          <Pencil size={14} aria-hidden />
          Edit brand
        </Button>
      </div>

      {/* ----------------------------------------------------------- tabs -- */}
      <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Brand hub sections"
          className="inline-flex min-w-full gap-1 border-b border-line pb-px sm:min-w-0"
        >
          {SECTIONS.map((s) => {
            const active = s.key === section;
            const built = BUILT.has(s.key);
            return (
              <button
                key={s.key}
                role="tab"
                type="button"
                aria-selected={active}
                disabled={!built}
                onClick={() => go(s.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[14px] font-medium transition-colors duration-200',
                  active
                    ? 'border-accent text-accent'
                    : built
                      ? 'border-transparent text-muted hover:text-text'
                      : 'cursor-default border-transparent text-faint'
                )}
              >
                <s.icon size={15} aria-hidden />
                {s.label}
                {'soon' in s ? (
                  <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-faint uppercase">
                    {s.soon}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* -------------------------------------------------------- content -- */}
      {section === 'overview' ? (
        <Overview brand={brand} offers={offers ?? []} loading={offersLoading} />
      ) : section === 'about' ? (
        <BrandAbout brand={brand} />
      ) : (
        <Offers
          offers={offers ?? []}
          loading={offersLoading}
          onNew={() => setOfferDialog({})}
          onEdit={(offer) => setOfferDialog({ offer })}
        />
      )}

      {editingBrand ? (
        <BrandDialog brand={brand} onClose={() => setEditingBrand(false)} />
      ) : null}

      {offerDialog ? (
        <OfferDialog
          brandId={brand.id}
          brandName={brand.name}
          {...(offerDialog.offer ? { offer: offerDialog.offer } : {})}
          onClose={() => setOfferDialog(null)}
        />
      ) : null}
    </AppShell>
  );
}

/* -------------------------------------------------------------- overview -- */

/**
 * Everything true about the brand, in one place.
 *
 * This is where new facts go as the hub grows: creators working with it,
 * spend against budget, live campaigns. Keeping them here is what stops the
 * Offers tab turning back into a wall of things you already know.
 */
function Overview({
  brand,
  offers,
  loading,
}: {
  brand: Brand;
  offers: Offer[];
  loading: boolean;
}) {
  const { data: products } = useProducts(brand.id);
  const live = offers.filter((o) => o.status === 'active').length;
  const openToAll = offers.filter(
    (o) => o.status === 'active' && !o.needs_application
  ).length;

  const budget = budgetOf(brand);

  return (
    <div className="mt-6 grid max-w-4xl gap-6">
      {/* Budget first, because it is the only fact here that changes on its own
          and the only one with a consequence. Everything below is reference. */}
      <div className="rounded-2xl border border-line bg-surface-1 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <dt className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
            Budget committed to creators
          </dt>
          <dd className="wx-numeric text-[15px] font-semibold">
            {money(brand.budget_used, brand.currency)} of{' '}
            {money(brand.budget_allocated, brand.currency)}
          </dd>
        </div>
        <div className="mt-3">
          <BudgetBar brand={brand} size="lg" />
        </div>
        {budget.over ? (
          <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-danger">
            More has been promised than this brand was allocated. Nothing is blocked,
            but the next approval makes it worse.
          </p>
        ) : null}
      </div>

      {/* Separate bordered cards rather than the one-pixel-gap trick used
          elsewhere. That trick paints the gaps with the border colour, so a row
          that does not divide evenly leaves a visible empty block at the end.
          This grid grows as the hub gains facts, so it must not care. */}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Store id" value={brand.store_id} mono />
        <Fact label="Client" value={brand.client_name || 'Not set'} />
        <Fact
          label="Budget allocated"
          value={money(brand.budget_allocated, brand.currency)}
          accent
        />
        <Fact
          label="Still available"
          value={
            budget.left === null ? 'Not set' : money(budget.left, brand.currency)
          }
        />
        <Fact label="Currency" value={brand.currency} />
        <Fact
          label="Offers"
          value={loading ? '...' : `${live} live of ${offers.length}`}
        />
        <Fact
          label="Open without applying"
          value={loading ? '...' : String(openToAll)}
        />
        <Fact
          label="Products"
          value={
            products === undefined
              ? '...'
              : `${products.filter((p) => p.is_active).length} shown of ${products.length}`
          }
        />
        <Fact
          label="Added"
          value={new Date(brand.created_at).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        />
        <Fact label="Status" value={brand.is_active ? 'Active' : 'Retired'} />
      </dl>

      <p className="text-[13px] leading-relaxed text-faint">
        Creator numbers, spend against budget and live campaigns land here as
        those parts of the hub are built.
      </p>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 px-5 py-4">
      <dt className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1.5 font-semibold break-all',
          mono && 'font-mono text-[13px]',
          accent && 'wx-numeric text-accent'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ---------------------------------------------------------------- offers -- */

function Offers({
  offers,
  loading,
  onNew,
  onEdit,
}: {
  offers: Offer[];
  loading: boolean;
  onNew: () => void;
  onEdit: (offer: Offer) => void;
}) {
  return (
    <section className="mt-5">
      {/* No heading repeating the tab you just clicked. The action goes on the
          same line as the one line of explanation. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] leading-relaxed text-muted">
          What this brand pays creators for content.
        </p>
        <Button size="sm" onClick={onNew} className="shrink-0">
          <Plus size={15} aria-hidden />
          New offer
        </Button>
      </div>

      {loading ? (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-36 animate-pulse rounded-2xl bg-surface-1" />
          ))}
        </ul>
      ) : offers.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface-1 px-6 py-14 text-center">
          <Ticket size={26} aria-hidden className="mx-auto text-faint" />
          <p className="mt-4 font-semibold">No offers yet</p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
            An offer is a deal: so many videos, for so much. Creators will browse
            these and either take them or apply.
          </p>
          <Button className="mt-6" onClick={onNew}>
            <Plus size={16} aria-hidden />
            Create the first offer
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {offers.map((offer) => (
            <li key={offer.id}>
              <OfferCard offer={offer} onEdit={() => onEdit(offer)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OfferCard({ offer, onEdit }: { offer: Offer; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const manage = useManageBrand();

  // An offer need not have either. A boosted commission rate has no fixed
  // deliverable and no fixed fee, so the terms row is left out rather than
  // printing "0 videos" and "$NaN".
  const hasVideos = offer.video_count !== null;
  const hasReward = offer.reward_amount !== null;
  const perVideo =
    hasVideos && hasReward && offer.video_count! > 0
      ? Number(offer.reward_amount) / offer.video_count!
      : null;

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-surface-1 p-5',
        offer.status === 'active' ? 'border-line' : 'border-dashed border-line'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {offer.badge_title ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-accent uppercase">
            {offer.badge_title}
          </span>
        ) : null}
        {offer.status === 'inactive' ? (
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
            Inactive
          </span>
        ) : null}
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase',
            offer.needs_application
              ? 'bg-warning-soft text-warning'
              : 'bg-success-soft text-success'
          )}
        >
          {offer.needs_application ? 'Apply first' : 'Open to all'}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-bold">{offer.title}</h3>
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
                Reward
              </span>
              <span className="wx-numeric mt-1 block text-lg font-bold text-accent">
                {money(offer.reward_amount, offer.currency)}
              </span>
            </span>
          ) : null}
          {perVideo !== null ? (
            <span className="text-[12px] text-faint">
              {money(perVideo, offer.currency)} per video
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 border-t border-line pt-4 text-[12px] text-faint">
          No fixed deliverable or fee on this one.
        </p>
      )}

      {confirming ? (
        <div className="mt-4 rounded-xl border border-danger/40 bg-danger-soft p-4">
          <p className="text-[13px] leading-relaxed font-medium text-danger">
            Delete this offer? It is removed for good, though the audit log keeps a
            record of what it was.
          </p>
          {manage.error ? (
            <p role="alert" className="mt-2 text-[12px] text-danger">
              {(manage.error as Error).message}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={manage.isPending}
              onClick={() => manage.mutate({ action: 'offer.delete', offerId: offer.id })}
            >
              {manage.isPending ? 'Deleting...' : 'Yes, delete'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={manage.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil size={14} aria-hidden />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${offer.title}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={14} aria-hidden />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}
