import { Check, Clock, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useApplication, type ApplicationStatus } from '@/lib/auth/useApplication';

const STATUS_UI: Record<
  ApplicationStatus,
  { icon: typeof Clock; label: string; className: string; body: string }
> = {
  pending: {
    icon: Clock,
    label: 'Pending review',
    className: 'bg-warning-soft text-warning',
    body: 'A human reads every application. When the team makes a decision this page updates on its own, so there is no need to refresh or email anyone.',
  },
  approved: {
    icon: Check,
    label: 'Approved',
    className: 'bg-success-soft text-success',
    body: 'You are in. Your brand hubs and your numbers will appear here as they are switched on.',
  },
  rejected: {
    icon: X,
    label: 'Not this time',
    className: 'bg-danger-soft text-danger',
    body: 'We are not able to take you on right now. This is usually about fit rather than quality, and it is not permanent.',
  },
};

/**
 * Home for applicants and creators.
 *
 * The application status here is live: `useApplication` subscribes to this
 * user's own row, so an approval in the admin queue changes this screen while
 * they are looking at it.
 */
export function Dashboard() {
  const { claims } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: application, isLoading: appLoading } = useApplication();

  // Prefer the profile row over the JWT claim. A token only refreshes about
  // once an hour, so an applicant approved thirty seconds ago is still carrying
  // `applicant` in their claims. The realtime subscription refetches the
  // profile the moment a decision lands, which is what makes this whole screen
  // change while they are looking at it.
  const role = profile?.role ?? claims?.role;
  const isApplicant = role === 'applicant';
  const status = application?.status;
  const ui = status ? STATUS_UI[status] : null;

  return (
    <AppShell>
      <h1 className="mt-4 text-[clamp(1.875rem,4vw,2.75rem)] font-extrabold">
        {isApplicant ? 'Your application' : 'Your dashboard'}
      </h1>

      {/* ------------------------------------------------ application state */}
      {appLoading ? (
        <div className="mt-8 max-w-xl space-y-3 rounded-2xl border border-line bg-surface-1 p-6">
          <div className="h-6 w-32 animate-pulse rounded-full bg-surface-2" />
          <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
        </div>
      ) : application && ui ? (
        <div className="mt-8 max-w-xl rounded-2xl border border-line bg-surface-1 p-6">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] uppercase ${ui.className}`}
          >
            <ui.icon size={13} aria-hidden />
            {ui.label}
          </span>
          <p className="mt-5 leading-relaxed text-muted">{ui.body}</p>
          {application.review_note ? (
            <p className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] leading-relaxed text-muted">
              {application.review_note}
            </p>
          ) : null}

          <dl className="mt-6 grid gap-3 border-t border-line pt-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-faint">TikTok handle</dt>
              <dd className="mt-0.5 font-medium">@{application.tiktok_handle}</dd>
            </div>
            <div>
              <dt className="text-faint">Niche</dt>
              <dd className="mt-0.5 font-medium">
                {application.niche === 'Other'
                  ? (application.niche_other ?? 'Other')
                  : application.niche}
              </dd>
            </div>
            <div>
              <dt className="text-faint">Worked with Wurx before</dt>
              <dd className="mt-0.5 font-medium">
                {application.worked_with_wurx ? 'Yes' : 'No'}
              </dd>
            </div>
            <div>
              <dt className="text-faint">Applied</dt>
              <dd className="mt-0.5 font-medium">
                {new Date(application.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        // Account exists but the application insert did not land. Recoverable,
        // rather than leaving someone stuck with no way forward.
        <div className="mt-8 max-w-xl rounded-2xl border border-line bg-surface-1 p-6">
          <h2 className="text-lg font-bold">Finish your application</h2>
          <p className="mt-3 leading-relaxed text-muted">
            Your account is ready, but we do not have your application details yet. It
            takes about a minute.
          </p>
          <ButtonLink to="/apply" className="mt-5">
            Complete it now
          </ButtonLink>
        </div>
      )}

      {/* ------------------------------------------------------- account */}
      <section className="mt-8 max-w-xl rounded-2xl border border-line bg-surface-1 p-6">
        <h2 className="text-sm font-semibold">Your account</h2>
        {profileLoading ? (
          <div className="mt-4 space-y-2.5">
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
          </div>
        ) : (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
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
              <dd className="mt-0.5 font-medium capitalize">
                {profile?.tier ?? 'Not assigned'}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {/* Scratch field used by the session stability test. It is never saved;
          it exists to prove a background token refresh does not wipe what
          someone was in the middle of typing. */}
      <section className="mt-6 max-w-xl rounded-2xl border border-line bg-surface-1 p-6">
        <label
          htmlFor="scratch-note"
          className="block font-mono text-[11px] tracking-[0.14em] text-muted uppercase"
        >
          Scratch note
        </label>
        <p className="mt-2 text-[13px] leading-relaxed text-faint">
          Nothing typed here is saved. It exists so we can prove that a background
          token refresh does not wipe what you were writing.
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
