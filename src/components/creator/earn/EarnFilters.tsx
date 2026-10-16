import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ROW ONE OF BOTH EARN SCREENS, AND IT IS NOW A SEARCH BOX. §8.1 and §8.2.
 *
 * IT USED TO BE THREE CONTROLS: a status chip row with counts, this search box,
 * and a brand dropdown. Rashid, 2026-10-16: "the tabs that are loaded with
 * buttons and toggles or sub tabs make them simpler to use and ditch the
 * buttons where you can for easier usability." The chips and the dropdown both
 * went, and the components that drew them were deleted from the bottom of this
 * file rather than left exported for somebody to re-add:
 *
 *   THE CHIPS asked a creator to choose one status before she could see
 *   anything, and both screens then grouped the results by status underneath
 *   anyway. The groups carry the counts the chips carried — a count is
 *   information and was worth keeping; the tap was not.
 *
 *   THE BRAND DROPDOWN duplicated the box below exactly. The search has always
 *   matched a brand's name as well as the row's own, so the select was a second
 *   way to ask one question, and the one that had to be opened to find out what
 *   was in it.
 *
 * NOT `FilterBar`, and that has not changed. `FilterBar` is itself a
 * `wx-neo-raised` panel, and this row lives INSIDE the one blurred panel these
 * screens are allowed, so using it would nest a blur in a blur — which is not
 * more glass, it is two blurs of the same gradient at twice the cost.
 *
 * EVERY SIZE IS IN `rem`, and anything in here is 2.75rem below `sm` and on any
 * coarse pointer, which is the floor §2 sets. Above that, on a mouse, it
 * tightens to 2.25rem so the row does not eat the top of the page.
 *
 * IT WRAPS RATHER THAN SCROLLS. A row that scrolls sideways hides a control
 * behind an edge, and on a phone nobody finds it. This was a real bug: the old
 * contest and offer tab strips bled `-mx-4` against a `px-3` gutter and put 4px
 * of horizontal scroll on the whole page at 375.
 */
export function EarnFilters({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        /* NO WELL AROUND THE CONTROLS. This used to be `wx-neo-inset` with
           padding, so a search field — which carries its own inset well —
           sat in a second well, inside the page's panel. Three nested
           surfaces for one row of controls, which is the "double layering"
           Rashid pointed at. The row is now plain; every control inside it
           keeps its own material and the nesting stops at one. */
        'flex flex-wrap items-center gap-2',
        className
      )}
    >
      {children}
    </div>
  );
}

/*
 * `EarnSearch` MOVED OUT, 2026-10-17, to
 * `src/components/creator/SearchField.tsx` as `CreatorSearch`.
 *
 * Leaderboards and My content each had their own hand-rolled copy of this
 * field and the three had drifted apart in height, radius, type size, icon
 * offset and focus treatment. Rashid asked for all three to read as one
 * family, which is only possible if there is one of them. It is NOT re-exported
 * from here: a second name for one component is how a third copy starts.
 */

/*
 * `EarnChips`, `EarnChip` AND `EarnBrandFilter` WERE DELETED HERE, 2026-10-16.
 *
 * The chip row and the brand dropdown are gone from both Earn screens, and
 * these were the last three things in this file nobody rendered. They are not
 * kept "in case": a status chip row and a brand select sitting exported and
 * documented in the file the two screens already import from is an invitation
 * to put them back, and the whole point of the pass that removed them is that
 * the grouping does their work without being asked.
 *
 * Offers and Contests both group by status now, with the counts on the group
 * headings, and the search box above already matches a brand's name — which is
 * what made the dropdown a duplicate rather than a shortcut. If a filter is
 * ever genuinely needed again, the thing to read first is the reasoning in the
 * header of `src/routes/app/Offers.tsx`.
 */
