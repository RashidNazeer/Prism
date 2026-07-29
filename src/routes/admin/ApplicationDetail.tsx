import { Link, useParams } from 'react-router';
import { ArrowLeft, ExternalLink, Star } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ReviewPanel } from '@/components/admin/ReviewPanel';
import { ButtonLink } from '@/components/ui/Button';
import {
  useApplicationDetail,
  useAuditLog,
  type ApplicationDetail as Detail,
} from '@/lib/admin/useApplicationDetail';

/**
 * One application, in full, with the decision controls.
 *
 * Reachable only behind the ops/admin guard, and every query underneath is
 * still filtered by row level security, so a tampered token lands on an empty
 * page rather than on someone else's application.
 */
export function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useApplicationDetail(id);
  const { data: history } = useAuditLog({ subjectId: id, limit: 20 });

  return (
    <AppShell>
      <Link
        to="/admin"
        className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-muted uppercase transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} aria-hidden />
        Back to queue
      </Link>

      {isLoading ? (
        <div className="mt-6 max-w-3xl space-y-4">
          <div className="h-10 w-64 animate-pulse rounded bg-surface-2" />
          <div className="h-48 animate-pulse rounded-2xl bg-surface-1" />
        </div>
      ) : isError ? (
        <Empty
          title="That application would not load"
          body={(error as Error)?.message ?? 'Something went wrong reaching the database.'}
        />
      ) : !data ? (
        <Empty
          title="No such application"
          body="It may have been removed along with the account. Nothing else is affected."
        />
      ) : (
        <Loaded application={data} history={history} />
      )}
    </AppShell>
  );
}

function Loaded({
  application,
  history,
}: {
  application: Detail;
  history: ReturnType<typeof useAuditLog>['data'];
}) {
  const niche =
    application.niche === 'Other' ? (application.niche_other ?? 'Other') : application.niche;
  const links = parseLinks(application.video_links);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold break-all">
          @{application.tiktok_handle}
        </h1>
        <StatusBadge status={application.status} />
        {application.worked_with_wurx ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-accent uppercase">
            <Star size={11} aria-hidden />
            Worked with Wurx
          </span>
        ) : null}
      </div>

      <div className="mt-8 grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        {/* ------------------------------------------------- what they sent */}
        <div className="grid gap-6">
          <section className="rounded-2xl border border-line bg-surface-1 p-6">
            <h2 className="text-lg font-bold">Application</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <Row label="Niche" value={niche} />
              <Row
                label="Worked with Wurx before"
                value={application.worked_with_wurx ? 'Yes' : 'No'}
              />
              <Row label="Applied" value={formatDateTime(application.created_at)} />
              <Row
                label="Last updated"
                value={formatDateTime(application.updated_at)}
              />
            </dl>

            <div className="mt-6 border-t border-line pt-5">
              <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                Videos
              </p>
              {links.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {links.map((link) => (
                    <li key={link}>
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex max-w-full items-center gap-2 text-[14px] text-accent underline-offset-4 hover:underline"
                      >
                        <span className="truncate">{link}</span>
                        <ExternalLink size={13} aria-hidden className="shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                // Anything that is not an http(s) URL is shown as plain text and
                // never as a link. A stored `javascript:` string must not become
                // something a reviewer can click.
                <p className="mt-3 text-[14px] leading-relaxed break-words whitespace-pre-wrap text-muted">
                  {application.video_links}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface-1 p-6">
            <h2 className="text-lg font-bold">Account</h2>
            {application.applicant ? (
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <Row label="Email" value={application.applicant.email} breakAll />
                <Row label="Name" value={application.applicant.display_name || 'Not set'} />
                <Row
                  label="Role"
                  value={application.applicant.role.replace('_', ' ')}
                  capitalize
                />
                <Row
                  label="Tier"
                  value={application.applicant.tier ?? 'Not assigned'}
                  capitalize
                />
                <Row
                  label="Account status"
                  value={application.applicant.is_active ? 'Active' : 'Suspended'}
                />
                <Row
                  label="Joined"
                  value={formatDateTime(application.applicant.created_at)}
                />
              </dl>
            ) : (
              <p className="mt-4 text-[14px] text-muted">
                This account has been deleted. The application is kept for the record.
              </p>
            )}
          </section>
        </div>

        {/* ------------------------------------------------------ decision -- */}
        <div className="grid gap-6">
          {application.status === 'pending' ? (
            <ReviewPanel application={application} />
          ) : (
            <section className="rounded-2xl border border-line bg-surface-1 p-6">
              <h2 className="text-lg font-bold">Decision</h2>
              <div className="mt-4">
                <StatusBadge status={application.status} />
              </div>
              <dl className="mt-5 grid gap-4 text-sm">
                <Row
                  label="Reviewed by"
                  value={application.reviewer?.email ?? 'A removed account'}
                  breakAll
                />
                <Row
                  label="Reviewed"
                  value={
                    application.reviewed_at
                      ? formatDateTime(application.reviewed_at)
                      : 'Unknown'
                  }
                />
              </dl>
              {application.review_note ? (
                <p className="mt-5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] leading-relaxed text-muted">
                  {application.review_note}
                </p>
              ) : null}
              <p className="mt-5 text-[13px] leading-relaxed text-faint">
                A decision is final from this screen. Changing it means editing the
                account directly, which is deliberate: it keeps the audit trail honest.
              </p>
            </section>
          )}

          {/* --------------------------------------------------- audit trail */}
          <section className="rounded-2xl border border-line bg-surface-1 p-6">
            <h2 className="text-sm font-semibold">History</h2>
            {history && history.length > 0 ? (
              <ul className="mt-4 grid gap-3 text-[13px]">
                {history.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-line pl-3">
                    <p className="font-medium">
                      {entry.action.replace('application.', '').replace('_', ' ')}
                      {typeof entry.detail.tier === 'string' ? (
                        <span className="text-accent capitalize"> as {entry.detail.tier}</span>
                      ) : null}
                    </p>
                    <p className="wx-numeric mt-0.5 text-faint">
                      {entry.actor_email ?? 'A removed account'} &middot;{' '}
                      {formatDateTime(entry.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-faint">
                Nothing yet. Every approval and rejection is recorded here, and the
                record cannot be edited from the browser by anyone, including an admin.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  breakAll,
  capitalize,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd
        className={[
          'mt-0.5 font-medium',
          breakAll ? 'break-all' : '',
          capitalize ? 'capitalize' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8 max-w-lg rounded-2xl border border-line bg-surface-1 p-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
      <ButtonLink to="/admin" variant="secondary" size="sm" className="mt-5">
        Back to queue
      </ButtonLink>
    </div>
  );
}

/**
 * Turn the free-text video field into links we are willing to render.
 *
 * Only http and https survive. The field is whatever an applicant typed, so
 * treating it as trusted markup is how a stored `javascript:` URL ends up one
 * click away from an admin session.
 */
function parseLinks(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      try {
        const url = new URL(s);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    })
    .slice(0, 20);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
