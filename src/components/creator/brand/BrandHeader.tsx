import type { CSSProperties } from 'react';
import type { CreatorBrand } from '@/lib/creator/useCreatorBrands';
import { cn } from '@/lib/utils';

/**
 * The brand's mark: its logo, or a monogram on the brand's own colour.
 *
 * Never a generic placeholder glyph. The colour is darkened toward black so the
 * white letter holds contrast whatever the admin picked; with no colour at all
 * it falls back to a neutral well.
 */
export function BrandMark({ brand, className }: { brand: CreatorBrand; className?: string }) {
  const letter = brand.name.trim().charAt(0).toUpperCase() || '?';
  const tinted = !brand.logo_url && Boolean(brand.brand_color);
  const style: CSSProperties | undefined = tinted
    ? { backgroundColor: `color-mix(in srgb, ${brand.brand_color} 68%, black)` }
    : undefined;

  return (
    <span
      className={cn(
        'grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl',
        tinted ? '' : 'wx-neo-inset',
        className
      )}
      style={style}
    >
      {brand.logo_url ? (
        <img src={brand.logo_url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span
          aria-hidden
          className={cn(
            'font-display text-[1.5rem] leading-none font-bold',
            tinted ? 'text-white' : 'text-muted'
          )}
        >
          {letter}
        </span>
      )}
    </span>
  );
}
