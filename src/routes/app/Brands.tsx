import { Link } from 'react-router';
import { m } from 'motion/react';
import { ArrowRight, Tag } from 'lucide-react';
import { DataError, EmptyState } from '@/components/ui/DataState';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { BrandMark } from '@/components/creator/brand/BrandHeader';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useCreatorBrands, useCreatorOfferCounts } from '@/lib/creator/useCreatorBrands';
import { useCatalogueLive } from '@/lib/creator/useCatalogueLive';

/**
 * Every brand a creator can work with.
 *
 * The way in to each Brand Hub. What a creator sees here is decided by the
 * database, not by this screen: retired brands never arrive, and neither do
 * the client name or the budget, which live in a different table entirely.
 *
 * ONE PANEL, MANY CARDS (2026-10-16). Each card used to wear `wx-neo-raised`,
 * so six brands put six `backdrop-filter`s on one screen against a budget of
 * three. The panel is the single blurred surface now and the cards are the same
 * glass material with the blur left off — which is also why they read as one
 * set rather than six floating sheets.
 */
export function Brands() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();

  // The profile row wins over the JWT claim. A token refreshes about once an
  // hour, so somebody approved a minute ago is still carrying `applicant` in
  // their claims and would otherwise be locked out of the thing they were just
  // congratulated for.
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  // Admin edits to brands, offers and products land here without a reload.
  useCatalogueLive();

  const { data: brands, isLoading, isError, refetch } = useCreatorBrands();
  const rows = brands ?? [];
  const { data: counts } = useCreatorOfferCounts(rows.map((b) => b.id));

  if (!approved) return <LockedUntilApproved />;

  if (isLoading) {
    return (
      <div className="wx-neo-raised min-w-0 rounded-2xl p-4 sm:p-5" aria-busy="true">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-[11rem] rounded-xl" />
          ))}
        </ul>
      </div>
    );
  }

  if (isError) {
    return (
      <DataError
        title="Your brand hubs would not load"
        body="Something went wrong on our side, not yours. Try again in a moment."
        onRetry={() => refetch()}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="You are not in a brand hub yet"
        body="When a brand opens its hub to you, it appears here first, with what it sells and what it wants from you."
      />
    );
  }

  return (
    <section
      aria-label="Your brand hubs"
      className="wx-neo-raised min-w-0 rounded-2xl p-4 sm:p-5"
    >
      <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        {rows.length} {rows.length === 1 ? 'hub' : 'hubs'} open to you
      </p>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((brand, i) => (
          <m.li
            key={brand.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            // Staggered, but capped: the tenth card should not wait a second
            // to appear just because it is tenth.
            transition={{ duration: 0.32, ease: 'easeOut', delay: Math.min(i, 6) * 0.04 }}
            className="min-w-0"
          >
            <Link
              to={`/app/brands/${brand.slug}`}
              className="wx-neo-raised-sm wx-neo-press group flex h-full min-h-11 flex-col rounded-xl p-4 transition-colors duration-200"
            >
              <span className="flex items-center gap-3">
                <BrandMark brand={brand} className="size-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.0625rem] leading-tight font-bold">
                    {brand.name}
                  </span>
                  {brand.tagline ? (
                    <span className="text-muted mt-1 block truncate text-[0.8125rem]">
                      {brand.tagline}
                    </span>
                  ) : null}
                </span>
                <ArrowRight
                  size={16}
                  aria-hidden
                  className="text-faint shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>

              {brand.description ? (
                <span className="text-muted mt-3.5 line-clamp-3 text-[0.8125rem] leading-relaxed">
                  {brand.description}
                </span>
              ) : null}

              {(counts?.[brand.id] ?? 0) > 0 ? (
                <span className="mt-auto block pt-4">
                  <span className="wx-neo-inset text-muted inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem]">
                    <Tag size={12} aria-hidden />
                    <span className="wx-numeric">{counts?.[brand.id]}</span>
                    {counts?.[brand.id] === 1 ? 'offer' : 'offers'}
                  </span>
                </span>
              ) : null}
            </Link>
          </m.li>
        ))}
      </ul>
    </section>
  );
}
