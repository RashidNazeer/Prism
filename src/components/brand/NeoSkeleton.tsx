import { cn } from '@/lib/utils';

/**
 * A loading placeholder that already wears the card it will become.
 *
 * WHY NOT A BARE `wx-skeleton` BLOCK. The loaded cards stand up off the page
 * (`wx-neo-raised`). A flat shimmering rectangle in their place is a visible seam:
 * the layout jumps from "painted rectangle" to "extruded card" the moment data
 * arrives. So the shell is the real material and only the contents shimmer.
 *
 * `className` carries the height and any width, exactly as it would on the card.
 */
export function NeoCardSkeleton({
  className,
  rounded = 'rounded-xl',
  as: Tag = 'div',
}: {
  className?: string;
  as?: 'div' | 'li';
  rounded?: 'rounded-xl' | 'rounded-2xl';
}) {
  return (
    <Tag
      aria-hidden
      className={cn('wx-neo-raised flex flex-col gap-3 p-4', rounded, className)}
    >
      <div className="wx-skeleton h-3 w-24 shrink-0" />
      <div className="wx-skeleton min-h-6 flex-1" />
    </Tag>
  );
}
