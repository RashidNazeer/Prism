import { Clock } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';

/**
 * Home for applicants and creators.
 *
 * Placeholder for Step 1. Step 3 turns the applicant view into a real
 * application status page, and Step 5 turns the creator view into the earnings
 * overview, My Brands and Discover.
 *
 * There is a text input on purpose: it is what the session-stability test types
 * into before forcing a token refresh, to prove a refresh does not wipe what
 * someone was in the middle of writing.
 */
export function Dashboard() {
  const { claims } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const isApplicant = claims?.role === 'applicant';

  return (
    <AppShell>
      <h1 className="mt-4 text-[clamp(1.875rem,4vw,2.75rem)] font-extrabold">
        {isApplicant ? 'Application received' : 'Your dashboard'}
      </h1>

      {isApplicant ? (
        <div className="mt-8 max-w-xl rounded-2xl border border-line bg-surface-1 p-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-warning uppercase">
            <Clock size={13} aria-hidden />
            Pending review
          </span>
          <p className="mt-5 leading-relaxed text-muted">
            A human reads every application. When the team makes a decision this page
            updates on its own, so there is no need to refresh or email anyone.
          </p>
        </div>
      ) : (
        <p className="mt-5 max-w-xl leading-relaxed text-muted">
          Your brands, your GMV and your commission will appear here. The data pipeline
          arrives in Step 7.
        </p>
      )}

      <section className="mt-10 max-w-xl rounded-2xl border border-line bg-surface-1 p-6">
        <h2 className="text-sm font-semibold">Your account</h2>
        {isLoading ? (
          <div className="mt-4 space-y-2.5">
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
          </div>
        ) : (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-faint">Name</dt>
              <dd className="mt-0.5 font-medium">{profile?.display_name ?? 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-faint">Email</dt>
              <dd className="mt-0.5 font-medium break-all">{profile?.email}</dd>
            </div>
            <div>
              <dt className="text-faint">Role</dt>
              <dd className="mt-0.5 font-medium capitalize">
                {profile?.role.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-faint">Tier</dt>
              <dd className="mt-0.5 font-medium capitalize">{profile?.tier ?? 'Not assigned'}</dd>
            </div>
          </dl>
        )}
      </section>

      {/* Scratch field used by the session-stability test. Harmless, and honest
          about why it is here. */}
      <section className="mt-6 max-w-xl rounded-2xl border border-line bg-surface-1 p-6">
        <label
          htmlFor="scratch-note"
          className="block font-mono text-[11px] tracking-[0.14em] text-muted uppercase"
        >
          Scratch note
        </label>
        <p className="mt-2 text-[13px] leading-relaxed text-faint">
          Anything typed here is never saved. It exists so we can prove that a
          background token refresh does not wipe what you were writing.
        </p>
        <textarea
          id="scratch-note"
          name="scratchNote"
          rows={3}
          className="mt-3 w-full resize-y rounded-xl border border-line-interactive bg-surface-3 px-4 py-3 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
          placeholder="Type something and leave the tab open..."
        />
      </section>
    </AppShell>
  );
}
