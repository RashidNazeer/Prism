import { Link, useParams } from 'react-router';
import { ArrowLeft, ExternalLink, Star } from 'lucide-react';
import { CreatorFace } from '@/components/admin/CreatorFace';
import { useCreatorAvatars } from '@/lib/admin/useCreatorAvatars';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ReviewPanel } from '@/components/admin/ReviewPanel';
import { ButtonLink } from '@/components/ui/Button';
import {
  useApplicationDetail,
  type ApplicationDetail as Detail,
} from '@/lib/admin/useApplicationDetail';
import { useAuditLog } from '@/lib/admin/useAuditLog';

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
  // The kind is passed as well as the id. The index is (subject_type,
  // subject_id) and a btree cannot serve a predicate that skips its leading
  // column, so this was a sequential scan of a table that only ever grows.
  const { data: history } = useAuditLog({
    subjectId: id,
    subjectType: 'application',
    limit: 20,
  });

  return (
    <>
      {/*
        No margin above it. The screen used to open with a title row the top bar
        now draws, so this link is the first thing on the page and the shell's
        own padding is the only space it needs.
      */}
      <Link
        to="/admin/applications"
        className="text-muted hover:text-accent inline-flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors"
      >
        <ArrowLeft size={14} aria-hidden />
        Back to queue
      </Link>

      {isLoading ? (
        <div className="mt-6 max-w-3xl space-y-4">
          <div className="wx-skeleton h-10 w-64 rounded" />
          <div className="wx-skeleton h-48 rounded-xl" />
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
    </>
  );
}

function Loaded({
  application,
  history,
}: {
  application: Detail;
  history: ReturnType<typeof useAuditLog>['data'];
}) {
  // One person on this screen, so the hook takes one id. `applicant` is null
  // for an account that has since been deleted, which the page already handles.
  const faces = useCreatorAvatars([application.applicant?.id]);
  const niche =
    application.niche === 'Other' ? (application.niche_other ?? 'Other') : application.niche;
  const links = parseLinks(application.video_links);

  return (
    <>
      {/*
        AN `h2`, NOT AN `h1`, SINCE 2026-08-16. The shell's top bar is the page's
        `h1` and says "Applications"; this says which one is open. The handle is
        the only thing an admin identifies an application by, so it stays on the
        screen at the same size, it just stops claiming to be the page title.

        The section headings inside the cards below are left at `h2`. Demoting
        them to `h3` would be the tidier outline, but ReviewPanel draws its own
        "Decision" heading from another file, and a half-demoted page reads worse
        to a screen reader than a flat one.
      */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Sized to the heading. This is the screen where somebody decides
            whether to let a stranger in, so the face earns its place here more
            than anywhere else in the admin. */}
        <CreatorFace
          src={application.applicant ? faces[application.applicant.id] : undefined}
          handle={application.tiktok_handle}
          name={application.applicant?.display_name}
          size={48}
        />

        <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold break-all">
          @{application.tiktok_handle}
        </h2>
        <StatusBadge status={application.status} />
        {application.worked_with_wurx ? (
          <span className="bg-accent-soft text-accent inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
            <Star size={11} aria-hidden />
            Worked with Wurx
          </span>
        ) : null}
      </div>

      <div className="mt-8 grid max-w-5xl min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        {/* ------------------------------------------------- what they sent */}
        {/*
          `min-w-0` is load bearing, not tidiness.

          A grid item's min-width is `auto`, so a single unbreakable string
          inside it (a video link, a long email) makes the whole column wider
          than its container and the page scrolls sideways. This screen was
          529px wide in a 375px viewport, and nothing caught it because
          /admin/applications/:id had never been in the responsive suite. It is
          now, which is how this was found.
        */}
        <div className="grid min-w-0 gap-6">
          <section className="border-line bg-surface-1 min-w-0 rounded-xl border p-6 shadow-md">
            <h2 className="text-lg font-bold">Application</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <Row label="Niche" value={niche} />
              <Row
                label="Worked with Wurx before"
                value={application.worked_with_wurx ? 'Yes' : 'No'}
              />
              <Row label="Applied" value={formatDateTime(application.created_at)} />
              <Row label="Last updated" value={formatDateTime(application.updated_at)} />
            </dl>

            <div className="border-line mt-6 border-t pt-5">
              <p className="text-faint font-mono text-[0.6875rem] tracking-[0.14em] uppercase">
                Videos
              </p>
              {links.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {links.map((link) => (
                    /*
                      `min-w-0` three times, and every one is needed.

                      `truncate` cannot shrink a flex item on its own: a flex
                      or grid item's min-width is `auto`, so an unbreakable URL
                      sets the minimum for the span, the anchor and the list
                      item in turn, and the whole page ends up wider than the
                      phone. This screen was 504px in a 375px viewport and
                      nothing caught it, because /admin/applications/:id had
                      never been in the responsive suite until today.
                    */
                    <li key={link} className="min-w-0">
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-accent inline-flex max-w-full min-w-0 items-center gap-2 text-[0.875rem] underline-offset-4 hover:underline"
                      >
                        <span className="min-w-0 truncate">{link}</span>
                        <ExternalLink size={13} aria-hidden className="shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                // Anything that is not an http(s) URL is shown as plain text and
                // never as a link. A stored `javascript:` string must not become
                // something a reviewer can click.
                <p className="text-muted mt-3 text-[0.875rem] leading-relaxed break-words whitespace-pre-wrap">
                  {application.video_links}
                </p>
              )}
            </div>
          </section>

          <section className="border-line bg-surface-1 min-w-0 rounded-xl border p-6 shadow-md">
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
                <Row label="Joined" value={formatDateTime(application.applicant.created_at)} />
              </dl>
            ) : (
              <p className="text-muted mt-4 text-[0.875rem]">
                This account has been deleted. The application is kept for the record.
              </p>
            )}
          </section>
        </div>

        {/* ------------------------------------------------------ decision -- */}
        {/*
          `min-w-0` is load bearing, not tidiness.

          A grid item's min-width is `auto`, so a single unbreakable string
          inside it (a video link, a long email) makes the whole column wider
          than its container and the page scrolls sideways. This screen was
          529px wide in a 375px viewport, and nothing caught it because
          /admin/applications/:id had never been in the responsive suite. It is
          now, which is how this was found.
        */}
        <div className="grid min-w-0 gap-6">
          {application.status === 'pending' ? (
            <ReviewPanel application={application} />
          ) : (
            <section className="border-line bg-surface-1 min-w-0 rounded-xl border p-6 shadow-md">
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
                <p className="border-line bg-surface-2 text-muted mt-5 rounded-xl border px-4 py-3 text-[0.875rem] leading-relaxed">
                  {application.review_note}
                </p>
              ) : null}
              <p className="text-faint mt-5 text-[0.8125rem] leading-relaxed">
                A decision is final from this screen. Changing it means editing the account
                directly, which is deliberate: it keeps the audit trail honest.
              </p>
            </section>
          )}

          {/* --------------------------------------------------- audit trail */}
          <section className="border-line bg-surface-1 min-w-0 rounded-xl border p-6 shadow-md">
            <h2 className="text-sm font-semibold">History</h2>
            {history && history.length > 0 ? (
              <ul className="mt-4 grid gap-3 text-[0.8125rem]">
                {history.map((entry) => (
                  <li key={entry.id} className="border-line border-l-2 pl-3">
                    <p className="font-medium">
                      {entry.action.replace('application.', '').replace('_', ' ')}
                      {typeof entry.detail.tier === 'string' ? (
                        <span className="text-accent">
                          {' '}
                          as <span className="capitalize">{entry.detail.tier}</span>
                        </span>
                      ) : null}
                    </p>
                    <p className="wx-numeric text-faint mt-0.5">
                      {entry.actor_email ?? 'A removed account'} &middot;{' '}
                      {formatDateTime(entry.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-faint mt-3 text-[0.8125rem] leading-relaxed">
                Nothing yet. Every approval and rejection is recorded here, and the record
                cannot be edited from the browser by anyone, including an admin.
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
    // `min-w-0` because this is a grid item, and a grid item's min-width is
    // `auto`: without it one long value pushes the whole column wider than the
    // phone it is on. `break-words` for the same reason, on every value rather
    // than only the ones flagged `breakAll`.
    <div className="min-w-0">
      <dt className="text-faint">{label}</dt>
      <dd
        className={[
          'mt-0.5 font-medium break-words',
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
    <div className="border-line bg-surface-1 mt-8 max-w-lg rounded-xl border p-8 text-center shadow-md">
      <p className="font-semibold">{title}</p>
      <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">{body}</p>
      <ButtonLink to="/admin/applications" variant="secondary" size="sm" className="mt-5">
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
