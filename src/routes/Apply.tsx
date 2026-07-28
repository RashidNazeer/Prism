import { ArrowLeft } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { ButtonLink } from '@/components/ui/Button';
import { Eyebrow } from '@/components/layout/Section';

/**
 * Placeholder. The real application form is roadmap Step 3 (TikTok handles,
 * niche, brands worked with, best videos, payment handle, email — stored with
 * status "pending"). This exists so every "Apply" call to action on the landing
 * page leads somewhere designed rather than to a dead link.
 */
export function Apply() {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="wx-grid absolute inset-0" />
        <div className="wx-glow absolute inset-0" />
      </div>

      <div className="relative w-full max-w-lg text-center">
        <WurxMark className="justify-center" />
        <div className="mt-10 flex justify-center">
          <Eyebrow>Applications</Eyebrow>
        </div>
        <h1 className="mt-5 text-[clamp(2rem,5vw,3rem)] font-extrabold">
          Almost ready for you
        </h1>
        <p className="mx-auto mt-5 max-w-md leading-relaxed text-muted text-pretty">
          The creator application opens in a few days. When it does, it takes about
          three minutes &mdash; your handles, your niche, and a couple of your best
          videos.
        </p>
        <div className="mt-9 flex justify-center">
          <ButtonLink to="/" variant="secondary" className="group">
            <ArrowLeft
              size={16}
              className="transition-transform duration-200 ease-brand group-hover:-translate-x-0.5"
              aria-hidden
            />
            Back to home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
