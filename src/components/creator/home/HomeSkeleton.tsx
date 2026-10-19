/**
 * SKELETONS IN THE FINAL SHAPE, NOT SPINNERS.
 *
 * §5.2 asks for this by name, and the reason is layout rather than taste:
 * every placeholder below occupies exactly the box its real widget will, so
 * when the figures land nothing jumps. A spinner reserves nothing, so the page
 * assembles itself under her thumb.
 *
 * THE SHIMMER IS AN OPACITY ANIMATION, not a moving gradient. §4.3 allows only
 * `transform` and `opacity` to animate, and a sweeping background on a dozen
 * blocks is a repaint of the whole screen every frame. `animate-pulse` is
 * Tailwind's opacity keyframe, which composites.
 */
function Block({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-surface-2 motion-safe:animate-pulse rounded-md ${className}`}
      aria-hidden
    />
  );
}

export function HomeSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading your numbers">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Block className="h-4 w-24" />
          <Block className="h-10 w-48" />
        </div>
        <Block className="h-11 w-56" />
      </header>

      <section className="wx-neo-raised-sm rounded-xl p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="wx-neo-raised-sm min-h-[9rem] rounded-lg p-4">
              <Block className="h-3 w-20" />
              <Block className="mt-3 h-7 w-24" />
              <Block className="mt-4 h-14 w-full" />
            </div>
          ))}
        </div>
      </section>

      <section className="wx-neo-raised-sm rounded-xl p-4">
        <Block className="h-4 w-24" />
        <Block className="mt-3 h-[13.75rem] w-full" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="wx-neo-raised-sm rounded-xl p-4">
          <Block className="h-4 w-20" />
          <Block className="mt-3 h-36 w-full" />
        </div>
        <div className="wx-neo-raised-sm rounded-xl p-4">
          <Block className="h-4 w-24" />
          <Block className="mt-3 h-28 w-full" />
        </div>
      </section>
    </div>
  );
}
