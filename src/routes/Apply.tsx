import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PrismMark } from '@/components/brand/PrismMark';
import { ButtonLink } from '@/components/ui/Button';
import { ApplyForm } from '@/components/landing/ApplyForm';
import { HaloBackdrop } from '@/components/auth/HaloBackdrop';
import { allowIndexing } from '@/lib/seo';

/**
 * Standalone application page.
 *
 * The same form also sits in the hero on the landing page; this route exists so
 * a direct link (DM, email, Discord) lands somewhere focused. Both render the
 * exact same <ApplyForm />, so there is only ever one form to maintain.
 */
export function Apply() {
  /* A public page of the website, and the one a creator searches for by name.
     Indexed on the live site only. */
  useEffect(() => allowIndexing(), []);

  return (
    <div className="relative min-h-dvh overflow-hidden px-5 py-14 sm:px-8">
      {/* The same backdrop as sign-in. This page was still wearing `wx-grid`
          and `wx-glow`, the two decorative layers of the old Wurx identity, so
          the one page a creator reaches from a DM looked like a different
          product from the one they sign in to. */}
      <HaloBackdrop className="pointer-events-none absolute inset-0" />

      <div className="relative mx-auto w-full max-w-lg">
        <div className="flex items-center justify-between gap-4">
          <PrismMark />
          <ButtonLink to="/" variant="ghost" size="sm" className="group">
            <ArrowLeft
              size={15}
              className="ease-brand transition-transform duration-200 group-hover:-translate-x-0.5"
              aria-hidden
            />
            Home
          </ButtonLink>
        </div>

        <h1 className="mt-10 text-[clamp(1.875rem,5vw,2.5rem)] font-extrabold">
          Join the Prism creator roster
        </h1>
        <p className="text-muted mt-4 leading-relaxed text-pretty">
          Tell us where to find you and what you make. Every application is read by a human, and
          there is no follower minimum.
        </p>

        <div className="mt-9">
          <ApplyForm />
        </div>
      </div>
    </div>
  );
}
