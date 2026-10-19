import { useState } from 'react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { DataError } from '@/components/ui/DataState';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { CreatorSearch } from '@/components/creator/SearchField';
import { useBrandRates } from '@/components/creator/brand/useBrandRates';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  useCreatorBrands,
  useCreatorOfferCounts,
  type CreatorBrand,
} from '@/lib/creator/useCreatorBrands';
import { useCatalogueLive } from '@/lib/creator/useCatalogueLive';
import { useMyWork } from '@/lib/creator/useMyWork';
import { percent } from '@/lib/money';

/** Brands beyond which a search box earns its place. */
const SEARCH_AFTER = 8;

/**
 * THE MARKETPLACE: every brand she can read, as a grid of cards.
 *
 * Which brands arrive is decided by the database (`brands_select_creator`:
 * active brands, approved creators). This screen adds no filter of its own.
 *
 * ONE BLURRED PANEL, MANY FLAT CARDS. The panel is the only `backdrop-filter`
 * on the page body; each card is `wx-neo-raised-sm`, so N brands never mean N
 * blurred layers. No tabs, no filters, no section control: the card is the way in.
 */
export function Brands() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();

  // The profile row wins over the JWT claim: a token refreshes about hourly, so
  // somebody approved a minute ago still carries `applicant` in their claims.
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  // Admin edits to brands, offers and products land here without a reload.
  useCatalogueLive();

  const { data: brands, isLoading, isError, refetch } = useCreatorBrands();
  const rows = brands ?? [];
  const ids = rows.map((b) => b.id);
  const { data: counts } = useCreatorOfferCounts(ids);
  const { data: rates } = useBrandRates(ids);

  // Her own requests, already read for Home: which brands she works with, and
  // how many of each brand's offers she has already asked for.
  const { data: work } = useMyWork();
  const working = new Set<string>();
  const asked: Record<string, Set<string>> = {};
  for (const r of work ?? []) {
    if (r.status === 'approved') working.add(r.brand_id);
    (asked[r.brand_id] ??= new Set()).add(r.offer_id);
  }
  const taken: Record<string, number> = {};
  for (const [id, set] of Object.entries(asked)) taken[id] = set.size;

  if (!approved) return <LockedUntilApproved />;

  if (isLoading) {
    return (
      <div className="wx-neo-raised min-w-0 rounded-2xl p-3 sm:p-4" aria-busy="true">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="wx-skeleton aspect-[3/4] rounded-xl sm:aspect-[4/5]" />
          ))}
        </ul>
      </div>
    );
  }

  if (isError) {
    return (
      <DataError
        title="Brands would not load"
        body="Try again in a moment."
        onRetry={() => refetch()}
      />
    );
  }

  // Nothing to browse is nothing to draw.
  if (rows.length === 0) return null;

  return (
    <BrandGrid brands={rows} counts={counts} rates={rates} working={working} taken={taken} />
  );
}

/**
 * The grid itself, with its data handed in so `/dev/brand-hub` can draw the real thing.
 *
 * ORDER: brands with offers still open to her first (what she can act on),
 * then the ones she already works with, then the rest, each by name. "Open" is
 * the offers she can read minus the ones she has already asked for.
 */
export function BrandGrid({
  brands,
  counts,
  rates,
  working,
  taken,
}: {
  brands: CreatorBrand[];
  counts: Record<string, number> | undefined;
  rates?: Record<string, number>;
  working?: Set<string>;
  taken?: Record<string, number>;
}) {
  const [query, setQuery] = useState('');
  const searchable = brands.length > SEARCH_AFTER;
  const needle = searchable ? query.trim().toLowerCase() : '';

  const openOf = (id: string) => Math.max(0, (counts?.[id] ?? 0) - (taken?.[id] ?? 0));
  const rank = (b: CreatorBrand) => (openOf(b.id) > 0 ? 0 : working?.has(b.id) ? 1 : 2);

  const shown = brands
    .filter(
      (b) =>
        !needle ||
        b.name.toLowerCase().includes(needle) ||
        (b.tagline ?? '').toLowerCase().includes(needle)
    )
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return (
    <section aria-label="Brands" className="wx-neo-raised min-w-0 rounded-2xl p-3 sm:p-4">
      {searchable ? (
        <div className="mb-3 flex">
          <CreatorSearch
            value={query}
            onChange={setQuery}
            placeholder="Search brands"
            label="Search brands"
          />
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {shown.map((brand, i) => (
          <m.li
            key={brand.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            // Capped: the tenth card should not wait a second just for being tenth.
            transition={{ duration: 0.32, ease: 'easeOut', delay: Math.min(i, 6) * 0.04 }}
            className="min-w-0"
          >
            <BrandCard
              brand={brand}
              open={openOf(brand.id)}
              rate={rates?.[brand.id]}
              isIn={working?.has(brand.id) ?? false}
            />
          </m.li>
        ))}
      </ul>
    </section>
  );
}

/** Below this many pixels across, a logo is a mark to place, not a picture to stretch. */
const SHARP_ENOUGH = 240;

/**
 * ONE BRAND, AS A POSTER. The logo is the card's background, and the name, the
 * lead figure and the cue sit on it.
 *
 * LEGIBILITY IS A GRADIENT, NOT A FILTER. A plain `linear-gradient` scrim runs
 * clear at the top to ~85% black from half way down, which is where all the
 * text lives, so white type holds 4.5:1 even over a white logo. No `filter`, no
 * `backdrop-filter`: a grid of image cards must not become a grid of blurs.
 *
 * A LOGO IS STRETCHED ONLY IF IT CAN TAKE IT. Big enough, it covers the card.
 * Smaller than `SHARP_ENOUGH` once loaded, it is placed large and cropped off the
 * top-right corner on the brand colour instead of being pixel-stretched. No
 * logo: the brand colour with its first letter as a faint watermark.
 */
function BrandCard({
  brand,
  open,
  rate,
  isIn,
}: {
  brand: CreatorBrand;
  open: number;
  rate: number | undefined;
  isIn: boolean;
}) {
  const [small, setSmall] = useState(false);
  const line = brand.tagline ?? brand.description;
  const base = brand.brand_color
    ? `color-mix(in srgb, ${brand.brand_color} 62%, black)`
    : '#2b2e3a';
  const letter = brand.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Link
      to={`/app/brands/${brand.slug}`}
      className="wx-neo-raised-sm wx-neo-press group relative isolate block aspect-[3/4] overflow-hidden sm:aspect-[3/4] rounded-xl sm:aspect-[4/5] text-white"
    >
      <span aria-hidden className="absolute inset-0 -z-20" style={{ backgroundColor: base }} />

      {brand.logo_url ? (
        <img
          src={brand.logo_url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={(e) => setSmall(e.currentTarget.naturalWidth < SHARP_ENOUGH)}
          className={
            small
              ? 'absolute -top-[8%] -right-[12%] -z-10 size-[72%] rounded-3xl object-contain'
              : 'absolute inset-0 -z-10 size-full object-cover object-[50%_30%]'
          }
        />
      ) : (
        <span
          aria-hidden
          className="font-display absolute -top-[6%] -right-[4%] -z-10 text-[9rem] leading-none font-bold text-white/15 select-none"
        >
          {letter}
        </span>
      )}

      <span
        aria-hidden
        className="absolute inset-0 -z-[5]"
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0.93) 100%)',
        }}
      />

      <span className="absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
        <span className="flex min-h-6 justify-start">
          {isIn ? (
            <span
              data-t
              className="rounded-full bg-black/70 px-2.5 py-1 text-[0.6875rem] leading-none font-semibold tracking-[0.08em] text-white uppercase"
            >
              Working with
            </span>
          ) : null}
        </span>

        <span className="flex min-w-0 flex-col gap-2.5">
          <span className="min-w-0">
            <span data-t className="block truncate text-[1.0625rem] leading-tight font-bold">
              {brand.name}
            </span>
            {line ? (
              <span
                data-t
                className="mt-1 line-clamp-1 text-[0.8125rem] leading-snug text-white/85 sm:line-clamp-2"
              >
                {line}
              </span>
            ) : null}
          </span>

          <span className="flex items-end justify-between gap-2">
            <span className="min-w-0">
              {rate !== undefined ? (
                <>
                  <span
                    data-t
                    className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-white/85 uppercase"
                  >
                    Up to
                  </span>
                  <span
                    data-t
                    className="font-display wx-numeric block text-[1.625rem] leading-none font-bold"
                  >
                    {percent(rate)}
                  </span>
                </>
              ) : open > 0 ? (
                <span
                  data-t
                  className="font-display wx-numeric block text-[1.625rem] leading-none font-bold"
                >
                  {open}
                </span>
              ) : null}
              {open > 0 ? (
                <span
                  data-t
                  className={`mt-1 text-[0.75rem] text-white/85 ${rate !== undefined ? "hidden sm:block" : "block"}`}
                >
                  {rate !== undefined ? `${open} ` : ''}
                  {open === 1 ? 'open offer' : 'open offers'}
                </span>
              ) : null}
            </span>
            <span
              data-t
              className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[0.8125rem] font-semibold"
            >
              View
              <ArrowRight
                size={15}
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}
