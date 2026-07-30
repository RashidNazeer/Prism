import { Link, useParams, useSearchParams } from 'react-router';
import { m } from 'motion/react';
import {
  ArrowLeft,
  Package,
  Store,
  Ticket,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
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
          <div className="h-32 animate-pulse rounded-2xl bg-surface-1" />
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
      <Link
        to="/app/brands"
        className="inline-flex items-center gap-2 text-[13px] text-muted transition-colors duration-200 hover:text-accent"
      >
        <ArrowLeft size={15} aria-hidden />
        All brand hubs
      </Link>

      <Header brand={brand} />

      {/* ------------------------------------------------------------ tabs -- */}
      <div className="mt-5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Brand hub sections"
          className="flex min-w-max gap-2"
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
                title={
                  built || !('soon' in s)
                    ? undefined
                    : `${s.label} arrives with ${s.soon}`
                }
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
        <Offers offers={offers ?? []} loading={offersLoading} brandName={brand.name} />
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

function Header({ brand }: { brand: CreatorBrand }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-surface-1 p-6 sm:p-7"
    >
      {/* A single gold hairline along the top. The hub belongs to the brand,
          but it is still ours, and this is the one place that says so. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent to-transparent"
      />

      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2">
          {brand.logo_url ? (
            <img src={brand.logo_url} alt="" className="size-full object-cover" />
          ) : (
            <Store size={24} aria-hidden className="text-faint" />
          )}
        </span>

        <div className="min-w-0">
          <span className="inline-block rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
            Brand hub
          </span>
          <h1 className="mt-2 text-[clamp(1.5rem,4.5vw,2.25rem)] leading-tight font-extrabold break-words">
            {brand.name}
          </h1>
          {brand.tagline ? (
            <p className="mt-1 text-[15px] text-muted">{brand.tagline}</p>
          ) : null}
        </div>
      </div>
    </m.div>
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
  loading,
  brandName,
}: {
  offers: CreatorOffer[];
  loading: boolean;
  brandName: string;
}) {
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
            <OfferCard offer={offer} />
          </m.li>
        ))}
      </ul>

      <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-faint">
        Taking an offer from this screen is the next thing being built, along with
        proposing your own. Until then your manager sets these up with you.
      </p>
    </>
  );
}

function OfferCard({ offer }: { offer: CreatorOffer }) {
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
    <div className="flex h-full flex-col rounded-2xl border border-line bg-surface-1 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {offer.badge_title ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-accent uppercase">
            {offer.badge_title}
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
          {offer.needs_application ? 'Apply to join' : 'Yours to take'}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-bold">{offer.title}</h3>
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
      ) : (
        <p className="mt-4 border-t border-line pt-4 text-[12px] text-faint">
          No fixed deliverable or fee on this one.
        </p>
      )}

      {/* The button is here, and it is honest. A control that looks live and
          does nothing is worse than one that says it is not ready. */}
      <div className="mt-auto pt-5">
        <Button size="sm" disabled className="w-full sm:w-auto">
          {offer.needs_application ? 'Apply' : 'Take this offer'}
        </Button>
        <p className="mt-2 text-[12px] text-faint">Opens next</p>
      </div>
    </div>
  );
}
