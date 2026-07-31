import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { m } from 'motion/react';
import { ArrowLeft, Check, Clock, Package, Store, Ticket, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ApplyDialog } from '@/components/creator/ApplyDialog';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  useCreatorBrand,
  useCreatorOffers,
  useCreatorProducts,
  type CreatorBrand,
  type CreatorOffer,
  type CreatorProduct,
} from '@/lib/creator/useCreatorBrands';
import {
  useApplyForOffer,
  useMyOfferApplications,
  type MyOfferApplication,
} from '@/lib/creator/useOfferApplications';
import { money, percent } from '@/lib/admin/useBrands';

/**
 * A Brand Hub, as a creator sees it.
 *
 * Two sections are real: what the brand is and what it sells, and the offers on
 * the table. The rest are listed and plainly marked, the same honesty the
 * sidebar uses, because a creator should be able to see the shape of what is
 * coming without being able to click into an empty room.
 *
 * It opens on Overview rather than Offers, which is the opposite of the admin
 * hub. An admin arrives at a brand to do a job. A creator arrives to decide
 * whether they want to work with it at all, and that decision is made on the
 * brand and its products.
 */
const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'offers', label: 'Offers' },
  { key: 'numbers', label: 'My numbers', soon: 'Step 8' },
  { key: 'leaderboards', label: 'Leaderboards', soon: 'Step 9' },
  { key: 'briefs', label: 'Campaigns & briefs', soon: 'Next' },
  { key: 'contests', label: 'Contests', soon: 'Next' },
  { key: 'studio', label: 'Creative studio', soon: 'Later' },
] as const;

const BUILT = new Set(['overview', 'offers']);

export function BrandHub() {
  const { slug } = useParams<{ slug: string }>();
  const [params, setParams] = useSearchParams();
  const requested = params.get('section') ?? 'overview';
  const section = BUILT.has(requested) ? requested : 'overview';

  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  const { data: brand, isLoading, isError } = useCreatorBrand(slug);
  const { data: offers, isLoading: offersLoading } = useCreatorOffers(brand?.id);
  const { data: products, isLoading: productsLoading } = useCreatorProducts(brand?.id);
  const { data: mine } = useMyOfferApplications(brand?.id);

  const go = (key: string) => {
    const p = new URLSearchParams();
    if (key !== 'overview') p.set('section', key);
    setParams(p, { replace: true });
  };

  if (!approved) {
    return (
      <AppShell>
        <LockedUntilApproved />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-3xl space-y-4">
          <div className="h-10 w-64 animate-pulse rounded bg-surface-2" />
          <div className="h-10 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface-1" />
        </div>
      </AppShell>
    );
  }

  if (isError || !brand) {
    return (
      <AppShell>
        <div className="max-w-lg rounded-2xl border border-line bg-surface-1 p-8 text-center">
          <p className="font-semibold">That brand hub is not open</p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            It may have been retired, or it may not be one of yours. Nothing else is
            affected.
          </p>
          <ButtonLink to="/app/brands" variant="secondary" size="sm" className="mt-5">
            Back to brand hubs
          </ButtonLink>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Header brand={brand} />

      {/* ------------------------------------------------------------ tabs -- */}
      <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="Brand hub sections" className="flex min-w-max gap-2">
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
                title={built || !('soon' in s) ? undefined : `${s.label} arrives with ${s.soon}`}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors duration-200',
                  active
                    ? 'border-accent bg-accent text-on-accent'
                    : built
                      ? 'border-line bg-surface-1 text-muted hover:border-accent hover:text-accent'
                      : 'cursor-default border-dashed border-line bg-transparent text-faint'
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {section === 'offers' ? (
        <Offers
          offers={offers ?? []}
          mine={mine ?? []}
          loading={offersLoading}
          brandName={brand.name}
        />
      ) : (
        <Overview
          brand={brand}
          products={products ?? []}
          loading={productsLoading}
          offerCount={offers?.length ?? 0}
          onSeeOffers={() => go('offers')}
        />
      )}
    </AppShell>
  );
}

/* --------------------------------------------------------------- header -- */

/**
 * One compact row: back, mark, name, tagline.
 *
 * This used to be a tall card with the name set large, which said nothing the
 * Overview tab does not say better and pushed the actual content off the first
 * screen. All a creator needs up here is which hub they are standing in.
 */
function Header({ brand }: { brand: CreatorBrand }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        to="/app/brands"
        aria-label="Back to all brand hubs"
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors duration-200 hover:border-accent hover:text-accent"
      >
        <ArrowLeft size={15} aria-hidden />
      </Link>

      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2">
        {brand.logo_url ? (
          <img src={brand.logo_url} alt="" className="size-full object-cover" />
        ) : (
          <Store size={16} aria-hidden className="text-faint" />
        )}
      </span>

      <div className="min-w-0">
        <h1 className="truncate text-[clamp(1.15rem,2.6vw,1.4rem)] font-extrabold">
          {brand.name}
        </h1>
        {brand.tagline ? (
          <p className="truncate text-[13px] text-muted">{brand.tagline}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- overview -- */

function Overview({
  brand,
  products,
  loading,
  offerCount,
  onSeeOffers,
}: {
  brand: CreatorBrand;
  products: CreatorProduct[];
  loading: boolean;
  offerCount: number;
  onSeeOffers: () => void;
}) {
  return (
    <div className="mt-6 grid max-w-5xl gap-8">
      <section>
        <SectionHeading>Meet the brand</SectionHeading>
        {brand.description ? (
          <p className="mt-3 max-w-3xl leading-relaxed whitespace-pre-line text-muted">
            {brand.description}
          </p>
        ) : (
          <p className="mt-3 text-[14px] leading-relaxed text-faint">
            This brand has not written its introduction yet.
          </p>
        )}

        {offerCount > 0 ? (
          <Button variant="secondary" size="sm" className="mt-5" onClick={onSeeOffers}>
            See {offerCount} {offerCount === 1 ? 'offer' : 'offers'}
          </Button>
        ) : null}
      </section>

      <section>
        <SectionHeading>What they sell</SectionHeading>

        {loading ? (
          <ul className="mt-3 grid gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="h-16 animate-pulse rounded-xl bg-surface-1" />
            ))}
          </ul>
        ) : products.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-line bg-surface-1 px-6 py-12 text-center">
            <Package size={24} aria-hidden className="mx-auto text-faint" />
            <p className="mt-4 font-semibold">Products are on their way</p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
              The brand has not listed its products here yet. They appear with the
              commission you earn on each one.
            </p>
          </div>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-2xl border border-line">
            {products.map((product, i) => (
              <li
                key={product.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface-1 px-4 py-3.5',
                  i > 0 && 'border-t border-line'
                )}
              >
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="size-full object-cover" />
                  ) : (
                    <Package size={16} aria-hidden className="text-faint" />
                  )}
                </span>

                <span className="min-w-0 flex-1 basis-40">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold break-words">{product.name}</span>
                    {product.badge_title ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-accent uppercase">
                        {product.badge_title}
                      </span>
                    ) : null}
                  </span>
                  {product.price !== null ? (
                    <span className="wx-numeric mt-0.5 block text-[13px] text-muted">
                      {money(product.price, product.currency)}
                    </span>
                  ) : null}
                </span>

                {/* The number they actually came for. */}
                {percent(product.commission_rate) ? (
                  <span className="shrink-0 text-right">
                    <span className="wx-numeric block text-lg font-bold text-accent">
                      {percent(product.commission_rate)}
                    </span>
                    <span className="block font-mono text-[9px] tracking-[0.14em] text-faint uppercase">
                      Your cut
                    </span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
        {children}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

/* --------------------------------------------------------------- offers -- */

function Offers({
  offers,
  mine,
  loading,
  brandName,
}: {
  offers: CreatorOffer[];
  mine: MyOfferApplication[];
  loading: boolean;
  brandName: string;
}) {
  const [applyingTo, setApplyingTo] = useState<CreatorOffer | null>(null);

  if (loading) {
    return (
      <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="h-52 animate-pulse rounded-2xl bg-surface-1" />
        ))}
      </ul>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="mt-6 max-w-2xl rounded-2xl border border-line bg-surface-1 px-6 py-14 text-center">
        <Ticket size={26} aria-hidden className="mx-auto text-faint" />
        <p className="mt-4 font-semibold">No offers open right now</p>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
          {brandName} has nothing on the table at the moment. New offers land here as
          soon as they go live.
        </p>
      </div>
    );
  }

  /*
   * The newest request per offer wins.
   *
   * A creator can be rejected and ask again, so an offer can carry several
   * rows. `mine` arrives newest first, so the first match is the one that
   * describes where they stand today.
   */
  const latestFor = (offerId: string) => mine.find((a) => a.offer_id === offerId) ?? null;

  return (
    <>
      <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {offers.map((offer, i) => (
          <m.li
            key={offer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
          >
            <OfferCard
              offer={offer}
              application={latestFor(offer.id)}
              onApply={() => setApplyingTo(offer)}
            />
          </m.li>
        ))}
      </ul>

      {applyingTo ? (
        <ApplyDialog
          offer={applyingTo}
          brandName={brandName}
          onClose={() => setApplyingTo(null)}
        />
      ) : null}
    </>
  );
}

function OfferCard({
  offer,
  application,
  onApply,
}: {
  offer: CreatorOffer;
  application: MyOfferApplication | null;
  onApply: () => void;
}) {
  // An offer need not have either. A boosted commission rate has no fixed
  // deliverable and no fixed fee, so the terms row is simply left out. It used
  // to say "no fixed deliverable or fee on this one", which spent a line
  // telling a creator about the absence of something they never asked about.
  const hasVideos = offer.video_count !== null;
  const hasReward = offer.reward_amount !== null;
  const perVideo =
    hasVideos && hasReward && offer.video_count! > 0
      ? Number(offer.reward_amount) / offer.video_count!
      : null;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-surface-1 p-5">
      {offer.badge_title ? (
        <span className="mb-3 self-start rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-accent uppercase">
          {offer.badge_title}
        </span>
      ) : null}

      <h3 className="text-lg font-bold">{offer.title}</h3>
      {offer.description ? (
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{offer.description}</p>
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
          {perVideo !== null ? (
            <span className="text-[12px] text-faint">
              {money(perVideo, offer.currency)} per video
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto pt-5">
        <OfferAction offer={offer} application={application} onApply={onApply} />
      </div>
    </div>
  );
}

/**
 * The bottom of every offer card, and the only thing that differs between them.
 *
 * There is no status chip at the top any more. It said the same thing twice,
 * and the second time was the one that mattered.
 */
function OfferAction({
  offer,
  application,
  onApply,
}: {
  offer: CreatorOffer;
  application: MyOfferApplication | null;
  onApply: () => void;
}) {
  const withdraw = useApplyForOffer();

  // Already theirs. Nothing to ask for, so nothing to click.
  if (!offer.needs_application) {
    return (
      <Note tone="success" icon={<Check size={15} aria-hidden />}>
        <span className="font-semibold">You are already on this one</span>
        <span className="block text-[13px] text-muted">
          No application needed. Start posting whenever you are ready.
        </span>
      </Note>
    );
  }

  if (application?.status === 'approved') {
    return (
      <Note tone="success" icon={<Check size={15} aria-hidden />}>
        <span className="font-semibold">You are in</span>
        <Terms application={application} />
        {application.decision_note ? (
          <span className="mt-1 block text-[13px] text-muted">
            {application.decision_note}
          </span>
        ) : null}
      </Note>
    );
  }

  if (application?.status === 'pending') {
    return (
      <div>
        <Note tone="pending" icon={<Clock size={15} aria-hidden />}>
          <span className="font-semibold">With the team</span>
          <Terms application={application} />
        </Note>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={withdraw.isPending}
          onClick={() =>
            withdraw.mutate({
              action: 'application.withdraw',
              applicationId: application.id,
            })
          }
        >
          {withdraw.isPending ? 'Withdrawing...' : 'Withdraw'}
        </Button>
        {withdraw.error ? (
          <p role="alert" className="mt-2 text-[12px] text-danger">
            {(withdraw.error as Error).message}
          </p>
        ) : null}
      </div>
    );
  }

  if (application?.status === 'rejected') {
    return (
      <div>
        <Note tone="danger" icon={<X size={15} aria-hidden />}>
          <span className="font-semibold">Not this time</span>
          {application.decision_note ? (
            <span className="mt-0.5 block text-[13px] text-muted">
              {application.decision_note}
            </span>
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

/**
 * Only ever shown on a request made while creators could counter an offer.
 *
 * Everything since is the offer exactly as written, and the card already prints
 * those numbers a few lines above. Repeating them under "With the team" would
 * be a second copy of a fact nobody is unsure about.
 */
function Terms({ application }: { application: MyOfferApplication }) {
  if (application.proposed_video_count === null || application.proposed_amount === null) {
    return null;
  }
  return (
    <span className="block text-[13px] text-muted">
      You asked for {application.proposed_video_count}{' '}
      {application.proposed_video_count === 1 ? 'video' : 'videos'} at{' '}
      {money(application.proposed_amount, application.currency)}.
    </span>
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
