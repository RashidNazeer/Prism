import { Link } from 'react-router';
import { m } from 'motion/react';
import { Store, Tag } from 'lucide-react';
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

  const { data: brands, isLoading, isError, error } = useCreatorBrands();
  const rows = brands ?? [];
  const { data: counts } = useCreatorOfferCounts(rows.map((b) => b.id));

  return (
    <>
      <h1 className="font-brand text-[clamp(1.625rem,4.4vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.02em]">
        Brand hubs
      </h1>
      <p className="text-muted mt-2 max-w-2xl text-[0.9375rem] leading-relaxed">
        The brands you can work with. Open one to see what it sells, what it pays, and the
        offers you can take.
      </p>

      {!approved ? (
        <LockedUntilApproved className="mt-6" />
      ) : isLoading ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-40 rounded-xl" />
          ))}
        </ul>
      ) : isError ? (
        <div className="wx-neo-raised mt-6 rounded-xl px-6 py-14 text-center">
          <p className="font-semibold">That list would not load</p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
            {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="wx-neo-raised mt-6 rounded-xl px-6 py-16 text-center">
          <Store size={26} aria-hidden className="text-faint mx-auto" />
          <p className="mt-4 font-semibold">No brands open yet</p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
            Nothing is live for you right now. This fills up as brands come on board, and you
            will find them here first.
          </p>
        </div>
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
                className="wx-neo-raised hover:border-accent flex h-full flex-col rounded-xl p-5 transition-colors duration-200"
              >
                <div className="flex items-center gap-3">
                  <span className="wx-neo-inset grid size-[44px] shrink-0 place-items-center overflow-hidden rounded-full">
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

                <div className="mt-auto pt-5">
                  <span className="bg-surface-2 text-muted inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem]">
                    <Tag size={12} aria-hidden />
                    <span className="wx-numeric">{counts?.[brand.id] ?? 0}</span>
                    {(counts?.[brand.id] ?? 0) === 1 ? 'offer' : 'offers'}
                  </span>
                </div>
              </Link>
            </m.li>
          ))}
        </ul>
      )}
    </>
  );
}
