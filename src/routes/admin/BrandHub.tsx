import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  Gift,
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
import { BrandDialog } from '@/components/admin/BrandDialog';
import { OfferDialog } from '@/components/admin/OfferDialog';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import { money, useBrand, useOffers, type Offer } from '@/lib/admin/useBrands';

/**
 * The Brand Hub.
 *
 * Everything that belongs to one brand lives behind these tabs. Only Offers is
 * built; the rest are listed with the step that brings them, the same honesty
 * the sidebar uses, so the shape of the finished hub is visible from day one
 * without anybody landing on an empty screen.
 */
const SECTIONS = [
  { key: 'offers', label: 'Offers', icon: Tag },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone, soon: 'Next' },
  { key: 'contests', label: 'Contests', icon: Trophy, soon: 'Next' },
  { key: 'promotions', label: 'Promotions', icon: Gift, soon: 'Later' },
  { key: 'discounts', label: 'Discounts', icon: Percent, soon: 'Later' },
  { key: 'creators', label: 'Creators', icon: Users, soon: 'Later' },
] as const;

export function BrandHub() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const section = params.get('section') ?? 'offers';

  const { data: brand, isLoading, isError, error } = useBrand(id);
  const { data: offers, isLoading: offersLoading } = useOffers(id);

  const [editingBrand, setEditingBrand] = useState(false);
  const [offerDialog, setOfferDialog] = useState<{ offer?: Offer } | null>(null);

  const chosen = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];

  return (
    <AppShell>
      <Link
        to="/admin/brands"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-muted uppercase transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} aria-hidden />
        All brands
      </Link>

      {isLoading ? (
        <div className="mt-6 max-w-3xl space-y-4">
          <div className="h-10 w-64 animate-pulse rounded bg-surface-2" />
          <div className="h-24 animate-pulse rounded-2xl bg-surface-1" />
        </div>
      ) : isError || !brand ? (
        <div className="mt-8 max-w-lg rounded-2xl border border-line bg-surface-1 p-8 text-center">
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
      ) : (
        <>
          {/* ------------------------------------------------------- header */}
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[clamp(1.6rem,4vw,2.25rem)] font-extrabold break-words">
                  {brand.name}
                </h1>
                {!brand.is_active ? (
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
                    Retired
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 font-mono text-[12px] text-faint">/{brand.slug}</p>
            </div>
            <Button variant="secondary" onClick={() => setEditingBrand(true)} className="shrink-0">
              <Pencil size={15} aria-hidden />
              Edit brand
            </Button>
          </div>

          <dl className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            <Fact label="Store id" value={brand.store_id} mono />
            <Fact label="Client" value={brand.client_name || 'Not set'} />
            <Fact
              label="Budget allocated"
              value={money(brand.budget_allocated, brand.currency)}
              accent
            />
          </dl>

          {/* --------------------------------------------------------- tabs */}
          <div className="mt-8 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div
              role="tablist"
              aria-label="Brand hub sections"
              className="inline-flex min-w-full gap-1 border-b border-line pb-px sm:min-w-0"
            >
              {SECTIONS.map((s) => {
                const active = s.key === chosen.key;
                const built = !('soon' in s);
                return (
                  <button
                    key={s.key}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    disabled={!built}
                    onClick={() => {
                      const p = new URLSearchParams();
                      if (s.key !== 'offers') p.set('section', s.key);
                      setParams(p, { replace: true });
                    }}
                    className={cn(
                      'flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-[14px] font-medium transition-colors duration-200',
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

          {/* ------------------------------------------------------- offers */}
          <section className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Offers</h2>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">
                  What this brand pays creators for content.
                </p>
              </div>
              <Button size="sm" onClick={() => setOfferDialog({})}>
                <Plus size={15} aria-hidden />
                New offer
              </Button>
            </div>

            {offersLoading ? (
              <ul className="mt-5 grid gap-3 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="h-36 animate-pulse rounded-2xl bg-surface-1" />
                ))}
              </ul>
            ) : (offers ?? []).length === 0 ? (
              <div className="mt-5 rounded-2xl border border-line bg-surface-1 px-6 py-14 text-center">
                <Ticket size={26} aria-hidden className="mx-auto text-faint" />
                <p className="mt-4 font-semibold">No offers yet</p>
                <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
                  An offer is a deal: so many videos, for so much. Creators will browse
                  these and either take them or apply.
                </p>
                <Button className="mt-6" onClick={() => setOfferDialog({})}>
                  <Plus size={16} aria-hidden />
                  Create the first offer
                </Button>
              </div>
            ) : (
              <ul className="mt-5 grid gap-3 lg:grid-cols-2">
                {(offers ?? []).map((offer) => (
                  <li key={offer.id}>
                    <OfferCard offer={offer} onEdit={() => setOfferDialog({ offer })} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {editingBrand && brand ? (
        <BrandDialog brand={brand} onClose={() => setEditingBrand(false)} />
      ) : null}

      {offerDialog && brand ? (
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
    <div className="bg-surface-1 px-5 py-4">
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

function OfferCard({ offer, onEdit }: { offer: Offer; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const manage = useManageBrand();
  const perVideo = Number(offer.reward_amount) / offer.video_count;

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-surface-1 p-5',
        offer.status === 'active' ? 'border-line' : 'border-dashed border-line'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
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
      </div>

      <h3 className="mt-3 text-lg font-bold">{offer.title}</h3>
      {offer.description ? (
        <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-muted">
          {offer.description}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-line pt-4">
        <span>
          <span className="block font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
            Videos
          </span>
          <span className="wx-numeric mt-1 block text-lg font-bold">{offer.video_count}</span>
        </span>
        <span>
          <span className="block font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
            Reward
          </span>
          <span className="wx-numeric mt-1 block text-lg font-bold text-accent">
            {money(offer.reward_amount, offer.currency)}
          </span>
        </span>
        <span className="text-[12px] text-faint">
          {money(perVideo, offer.currency)} per video
        </span>
      </div>

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
              onClick={() =>
                manage.mutate({ action: 'offer.delete', offerId: offer.id })
              }
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
