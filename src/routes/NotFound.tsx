import { Link } from 'react-router';
import { WurxMark } from '@/components/brand/WurxMark';

export function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="space-y-6">
        <WurxMark className="justify-center" />
        <p className="font-mono text-sm tracking-widest text-accent">404</p>
        <h1 className="font-display text-3xl">This page doesn&rsquo;t exist</h1>
        <p className="mx-auto max-w-sm text-muted">
          The link may be old, or the page may have moved.
        </p>
        <Link
          to="/"
          className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-on-accent transition-colors duration-200 ease-brand hover:bg-accent-hover"
        >
          Back to WurxMediaHub
        </Link>
      </div>
    </main>
  );
}
