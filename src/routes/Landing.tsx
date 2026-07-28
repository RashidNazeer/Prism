import { SiteNav } from '@/components/landing/SiteNav';
import { Hero } from '@/components/landing/Hero';
import { TrustedBy } from '@/components/landing/TrustedBy';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Platform } from '@/components/landing/Platform';
import { FinalCta } from '@/components/landing/FinalCta';
import { SiteFooter } from '@/components/landing/SiteFooter';

/** The public marketing page. Roadmap Step 2. */
export function Landing() {
  return (
    <div className="min-h-dvh bg-bg">
      <SiteNav />
      <main>
        <Hero />
        <TrustedBy />
        <HowItWorks />
        <Platform />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
