/**
 * What sits in the content area while a screen's code is still arriving.
 *
 * IT IS ONLY THE CONTENT AREA. The sidebar, the top bar and the page frame are
 * already on screen and stay there, because they live in the layout route above
 * this. That is the whole point of the change on 2026-08-15: the app moves the
 * instant you click, and only the part that genuinely is not ready yet looks
 * unready.
 *
 * A skeleton, not a spinner. A spinner says "something is happening"; a skeleton
 * says "your content is arriving and it looks roughly like this". Every loading
 * state in this product follows that rule, and this one matters more than most
 * because it is the one people see on every first visit to a section.
 *
 * DELIBERATELY GENERIC. It stands in for fifteen different screens, so it draws
 * the shape they share rather than pretending to be any one of them. A skeleton
 * that mimics the wrong screen is worse than one that mimics none.
 *
 * RESHAPED 2026-08-16, when the title row and the description row came off every
 * screen. It used to open with two heading bars, which now describe nothing: a
 * screen's first row is its filter bar. A skeleton that promises a heading and
 * then delivers a filter row makes the page look like it jumped.
 */
export function ScreenFallback() {
  return (
    <div role="status" aria-busy className="flex flex-col gap-4">
      <div className="wx-skeleton h-14 w-full rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="wx-skeleton h-[190px] rounded-xl" />
        <div className="wx-skeleton h-[190px] rounded-xl" />
        <div className="wx-skeleton h-[190px] rounded-xl" />
      </div>
      <span className="sr-only">Loading this section</span>
    </div>
  );
}
