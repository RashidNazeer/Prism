import { cn } from '@/lib/utils';
import { brandLogo, isPosterLogo } from '@/lib/brand-logos';
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

/**
 * ONE BRAND, AS A POSTER. The logo is the card's background, and the name, the
 * lead figure and the cue sit on it.
 *
 * LEGIBILITY IS A GRADIENT, NOT A FILTER. A plain `linear-gradient` scrim runs
 * clear at the top to ~85% black from half way down, which is where all the
 * text lives, so white type holds 4.5:1 even over a white logo. No `backdrop-filter`; the only
 * `filter` is the static blur on each card's own background image.
 *
 * THE LOGO IS SHOWN WHOLE over an enlarged, blurred copy of itself, so no mark is
 * cropped or hard-edged. No logo: the brand colour with its first letter as a
 * faint watermark.
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
  const [wordmark, setWordmark] = useState(false);
  const poster = isPosterLogo(brand.slug, brand.logo_url);
  /* A poster picture is light, so its type is dark and it needs no black fade. */
  const sub = poster ? 'text-[#14151a]/70' : 'text-white/85';
  const line = brand.tagline ?? brand.description;
  /* `--brand-base` is unset for a brand with no colour; the card then uses a
     dark slate in dark mode and a mid slate in light mode (see the fallbacks). */
  const base = brand.brand_color
    ? `color-mix(in srgb, ${brand.brand_color} 62%, black)`
    : undefined;
  const logo = brandLogo(brand.slug, brand.logo_url);
  const letter = brand.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Link
      to={`/app/brands/${brand.slug}`}
      style={{ '--brand-base': base } as React.CSSProperties}
      className={cn(
        "wx-neo-raised-sm wx-neo-press group relative isolate block aspect-[3/4] overflow-hidden rounded-xl sm:aspect-[4/5]",
        "shadow-[0_14px_32px_-14px_rgba(0,0,0,0.6)]",
        poster ? "text-[#14151a]" : "text-white"
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 -z-20 bg-[var(--brand-base,#2b2e3a)] [[data-theme='light']_&]:bg-[var(--brand-base,#646a80)]"
      />

      {logo ? (
        <>
          {/* A near-square mark fills the card, as Penetrex and Swisse do. A wide
              wordmark cannot: cropped to a portrait it loses half its letters. It
              is shown whole instead, with its edges dissolved into an enlarged,
              blurred copy of itself so the card still reads as one picture. */}
          <img
            src={logo}
            alt=""
            aria-hidden={wordmark ? true : undefined}
            loading="lazy"
            decoding="async"
            onLoad={(e) => {
              const ratio = e.currentTarget.naturalWidth / Math.max(e.currentTarget.naturalHeight, 1);
              setWordmark(!poster && (ratio > 1.3 || ratio < 0.75));
            }}
            className={
              wordmark
                ? 'absolute inset-0 -z-10 size-full scale-150 object-cover blur-3xl'
                : 'absolute inset-0 -z-10 size-full object-cover object-[50%_30%]'
            }
          />
          {wordmark ? (
            <img
              src={logo}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-x-0 top-[6%] -z-10 h-[52%] w-full object-contain [mask-image:radial-gradient(ellipse_62%_62%_at_50%_50%,black_55%,transparent_100%)]"
            />
          ) : null}
        </>
      ) : (
        <span
          aria-hidden
          className="font-display absolute -top-[6%] -right-[4%] -z-10 text-[9rem] leading-none font-bold text-white/15 select-none"
        >
          {letter}
        </span>
      )}

      {poster ? (
        /* A soft shade, not a black band: enough depth under the type that the
           lower third reads as a surface, light enough to keep the picture. */
        <span
          aria-hidden
          className="absolute inset-0 -z-[5] bg-[linear-gradient(to_bottom,rgba(20,21,26,0)_0%,rgba(20,21,26,0)_50%,rgba(20,21,26,0.45)_100%)]"
        />
      ) : (
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 -z-[5]',
          poster
            ? 'bg-[linear-gradient(to_bottom,rgba(0,0,0,0)_0%,rgba(0,0,0,0)_62%,rgba(0,0,0,0.88)_82%,rgba(0,0,0,0.94)_100%)]'
            : "bg-[linear-gradient(to_bottom,rgba(0,0,0,0)_0%,rgba(0,0,0,0)_20%,rgba(0,0,0,0.85)_50%,rgba(0,0,0,0.93)_100%)] [[data-theme='light']_&]:bg-[linear-gradient(to_bottom,transparent_0%,transparent_22%,color-mix(in_srgb,var(--brand-base,#646a80)_50%,black)_100%)]"
        )}
      />
      )}

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
                className={cn("mt-1 line-clamp-1 text-[0.8125rem] leading-snug sm:line-clamp-2", sub)}
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
                    className={cn("block text-[0.6875rem] font-semibold tracking-[0.1em] uppercase", sub)}
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
                  className={cn("mt-1 text-[0.75rem]", sub, rate !== undefined ? "hidden sm:block" : "block")}
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
