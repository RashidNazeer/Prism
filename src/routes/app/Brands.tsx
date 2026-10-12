import { Link } from 'react-router';
import { m } from 'motion/react';
import { Store, Tag } from 'lucide-react';
import { DataError, EmptyState } from '@/components/ui/DataState';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
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

  return (
    <>
      {!approved ? (
        <LockedUntilApproved className="mt-6" />
      ) : isLoading ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-40 rounded-xl" />
          ))}
        </ul>
      ) : isError ? (
        <DataError
          className="mt-6"
          title="Your brand hubs would not load"
          body="Something went wrong on our side, not yours. Try again in a moment."
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="You are not in a brand hub yet"
          body="When a brand opens its hub to you, it appears here first, with what it sells and what it wants from you."
        />
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((brand, i) => (
            <m.li
              key={brand.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              // Staggered, but capped: the tenth card should not wait a second
              // to appear just because it is tenth.
              transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.04 }}
            >
              <Link
                to={`/app/brands/${brand.slug}`}
                className="wx-neo-raised flex h-full flex-col rounded-xl p-5 transition-colors duration-200"
              >
                <div className="flex items-center gap-3">
                  <span className="wx-neo-inset grid size-11 shrink-0 place-items-center overflow-hidden rounded-full">
                    {brand.logo_url ? (
                      <img src={brand.logo_url} alt="" className="size-full object-cover" />
                    ) : (
                      <Store size={17} aria-hidden className="text-faint" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold">{brand.name}</span>
                    {brand.tagline ? (
                      <span className="text-muted mt-0.5 block truncate text-[0.8125rem]">
                        {brand.tagline}
                      </span>
                    ) : null}
                  </span>
                </div>
                {brand.description ? (
                  <p className="text-muted mt-4 line-clamp-3 text-[0.875rem] leading-relaxed">
                    {brand.description}
                  </p>
                ) : null}
                {(counts?.[brand.id] ?? 0) > 0 ? (
                  <div className="mt-auto pt-5">
                    <span className="bg-surface-2 text-muted inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem]">
                      <Tag size={12} aria-hidden />
                      <span className="wx-numeric">{counts?.[brand.id]}</span>
                      {counts?.[brand.id] === 1 ? 'offer' : 'offers'}
                    </span>
                  </div>
                ) : null}{' '}
              </Link>
            </m.li>
          ))}
        </ul>
      )}
    </>
  );
}
