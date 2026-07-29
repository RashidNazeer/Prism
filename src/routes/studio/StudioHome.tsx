import { AppShell } from '@/components/layout/AppShell';

/**
 * Home for creative strategists. Placeholder for Step 1.
 * Creative Studio itself is Phase 2: submit, feedback, approve or retake.
 */
export function StudioHome() {
  return (
    <AppShell>
      <h1 className="mt-4 text-[clamp(1.875rem,4vw,2.75rem)] font-extrabold">Creative Studio</h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted">
        Briefs for your assigned brands, submitted content, and the approve or retake
        queue will live here. Briefs arrive with Brand Hubs in Step 6, the review
        queue in Phase 2.
      </p>
    </AppShell>
  );
}
