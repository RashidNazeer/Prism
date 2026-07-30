import { Link } from 'react-router';
import { ArrowRight, Check, Clock, Star, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/auth/useProfile';
import { useApplicationCounts } from '@/lib/admin/useApplications';
import { describeAction, useAuditLog } from '@/lib/admin/useAuditLog';

/**
 * The admin landing screen.
 *
 * The numbers live here rather than on top of the queue, so the queue itself
 * opens straight onto the list. This screen is about "what needs me?"; that one
 * is about working through it.
 */
export function AdminDashboard() {
  const { data: profile } = useProfile();
  const {
    data: counts,
    isLoading: countsLoading,
    isError: countsFailed,
  } = useApplicationCounts();
  const { data: activity, isError: activityFailed } = useAuditLog({ limit: 5 });

  const name = profile?.display_name || profile?.email?.split('@')[0] || 'there';
  const pending = counts?.pending ?? 0;

  const tiles = [
    {
      key: 'pending' as const,
      label: 'Awaiting review',
      icon: Clock,
      tone: 'text-warning',
      to: '/admin/applications?status=pending',
    },
    {
      key: 'approved' as const,
      label: 'Approved',
      icon: Check,
      tone: 'text-success',
      to: '/admin/applications?status=approved',
    },
    {
      key: 'rejected' as const,
      label: 'Rejected',
      icon: X,
      tone: 'text-muted',
      to: '/admin/applications?status=rejected',
    },
    {
      key: 'pendingKnown' as const,
      label: 'Known, waiting',
      icon: Star,
      tone: 'text-accent',
      to: '/admin/applications?known=1',
    },
  ];

  return (
    <AppShell>
      <h1 className="text-[clamp(1.6rem,4vw,2.25rem)] font-extrabold">
        Welcome back, {name}
      </h1>
      {/* Never claim the queue is clear before the count has come back. An
          empty cache and an empty queue look identical from here, and "nothing
          is waiting on you" is the one sentence that must not be a guess. */}
      {countsLoading ? (
        <div className="mt-3 h-5 w-64 max-w-full animate-pulse rounded bg-surface-2" />
      ) : countsFailed ? (
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-danger">
          Those numbers would not load, so this page cannot tell you what is waiting.
          The queue itself still works.
        </p>
      ) : (
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
          {pending > 0 ? (
            <>
              <span className="wx-numeric font-semibold text-text">{pending}</span>{' '}
              {pending === 1 ? 'creator is' : 'creators are'} waiting on a decision.
            </>
          ) : (
            'Nothing is waiting on you. The queue is clear.'
          )}
        </p>
      )}

      {/* ------------------------------------------------------------- tiles */}
      {/* Two up even on the narrowest phone. Four stacked tiles is a lot of
          scrolling before you reach the thing you came for. */}
      <ul className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.key}>
            <Link
              to={t.to}
              className="group flex h-full flex-col justify-between rounded-2xl border border-line bg-surface-1 p-5 transition-colors duration-200 hover:border-accent"
            >
              <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                <t.icon size={13} aria-hidden className={t.tone} />
                {t.label}
              </span>
              {counts ? (
                <span className={cn('wx-numeric mt-4 text-3xl font-bold', t.tone)}>
                  {counts[t.key]}
                </span>
              ) : countsFailed ? (
                // A skeleton that never resolves reads as "still loading"
                // forever, so show the same "nothing here" marker the queue
                // uses rather than pretending a number is on its way.
                <span className="mt-4 block text-2xl font-bold text-faint">&middot;</span>
              ) : (
                <span className="mt-4 block h-9 w-12 animate-pulse rounded bg-surface-2" />
              )}
            </Link>
          </li>
        ))}
      </ul>

      {/* -------------------------------------------------------- next thing */}
      {pending > 0 ? (
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-accent bg-accent-soft p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Ready when you are</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              {counts && counts.pendingKnown > 0 ? (
                <>
                  <span className="wx-numeric">{counts.pendingKnown}</span> of them have
                  worked with Wurx before, so they are quick decisions.
                </>
              ) : (
                'Work through the queue and the decisions reach creators instantly.'
              )}
            </p>
          </div>
          <ButtonLink to="/admin/applications" className="group w-full shrink-0 sm:w-auto">
            Review applications
            <ArrowRight
              size={16}
              aria-hidden
              className="transition-transform duration-200 ease-brand group-hover:translate-x-0.5"
            />
          </ButtonLink>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- activity */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
            Recent activity
          </h2>
          <Link
            to="/admin/activity"
            className="text-[13px] text-muted underline-offset-4 hover:text-accent hover:underline"
          >
            See all
          </Link>
        </div>

        {activity && activity.length > 0 ? (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-1">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 text-[13px] sm:px-5"
              >
                <span className="font-medium break-all">
                  {entry.actor_email ?? 'A removed account'}
                </span>
                <span className="text-muted">{describeAction(entry.action)}</span>
                {typeof entry.detail.tiktok_handle === 'string' ? (
                  <span className="font-medium">@{entry.detail.tiktok_handle}</span>
                ) : null}
                <span className="wx-numeric ml-auto shrink-0 text-faint">
                  {new Date(entry.created_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-line bg-surface-1 px-5 py-8 text-center text-[14px] leading-relaxed text-muted">
            {activityFailed
              ? 'The activity log would not load. Nothing has been lost; try again in a moment.'
              : 'Nothing yet. Approvals and rejections show up here as they happen.'}
          </p>
        )}
      </section>
    </AppShell>
  );
}
