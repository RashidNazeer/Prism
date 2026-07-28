/**
 * Shown while a lazy route chunk is downloading.
 *
 * Deliberately a skeleton, not a spinner — a spinner says "something is
 * happening", a skeleton says "your content is arriving and it looks like
 * this". Every loading state in this product follows that rule.
 */
export function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6" role="status" aria-busy>
      <div className="w-full max-w-md space-y-4">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-surface-2" />
        <div className="h-9 w-3/4 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-surface-2" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
