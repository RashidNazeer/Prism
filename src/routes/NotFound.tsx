import { Link } from 'react-router';
import { PrismMark } from '@/components/brand/PrismMark';

export function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="space-y-6">
        <PrismMark className="justify-center" />
        <p className="text-accent font-mono text-sm tracking-widest">404</p>
        <h1 className="font-display text-3xl">This page doesn&rsquo;t exist</h1>
        <p className="text-muted mx-auto max-w-sm">
          The link may be old, or the page may have moved.
        </p>
        <Link
          to="/"
          /* A real button, so it follows `Button`'s `primary` variant: the fill
             is #C3BEF0 as given and the label is ink. `--wx-accent-fill-hover`
             rather than `--wx-accent-hover`, which is the darkened ink and
             would flip the button to a dark slab on hover. */
          className="ease-brand inline-flex h-[44px] items-center rounded-full [background-color:var(--wx-accent-fill)] px-6 text-sm font-semibold [color:var(--wx-on-accent-fill)] transition-colors duration-200 hover:[background-color:var(--wx-accent-fill-hover)]"
        >
          Back to Prism
        </Link>
      </div>
    </main>
  );
}
