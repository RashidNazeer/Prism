import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, History, ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  AUDIT_PAGE_SIZE,
  describeAction,
  linkForSubject,
  useAuditPage,
  type AuditEntry,
} from '@/lib/admin/useAuditLog';

/**
 * Everything privileged that has happened, newest first.
 *
 * Read only, and not because the UI says so. `audit_log` has no insert, update
 * or delete grant to `authenticated`, so an admin sitting in the browser
 * console cannot rewrite this page's contents either.
 */
export function Activity() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const { data, isLoading, isError, error, isPlaceholderData } = useAuditPage(page);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const rows = data?.rows ?? [];

  const goTo = (next: number) => {
    const p = new URLSearchParams();
    if (next > 1) p.set('page', String(next));
    setParams(p, { replace: true });
  };

  return (
    <AppShell>
      <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold">Activity</h1>
      <p className="text-muted mt-2 max-w-2xl text-[15px] leading-relaxed">
        Every approval, rejection and blocked attempt, with who did it and when. Nobody can edit
        or delete this from the browser, including an admin. That is the point of keeping it.
      </p>

      <div
        className={cn(
          'border-line bg-surface-1 mt-8 overflow-hidden rounded-[20px] border shadow-md transition-opacity duration-200',
          isPlaceholderData && 'opacity-60'
        )}
      >
        {isLoading ? (
          <ul className="divide-line divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="wx-skeleton h-4 w-56 rounded" />
                <div className="wx-skeleton ml-auto h-4 w-28 rounded" />
              </li>
            ))}
          </ul>
        ) : isError ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold">The log would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
              {(error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <History size={26} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">Nothing has happened yet</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[14px] leading-relaxed">
              The first approval or rejection will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((entry) => (
              <li key={entry.id}>
                <Row entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {total > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="wx-numeric text-muted text-[13px]">
            {(page - 1) * AUDIT_PAGE_SIZE + 1} to {Math.min(page * AUDIT_PAGE_SIZE, total)} of{' '}
            {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => goTo(page - 1)}
            >
              <ChevronLeft size={15} aria-hidden />
              Previous
            </Button>
            <span className="wx-numeric text-muted px-1 font-mono text-[12px]">
              {page} / {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= pages}
              onClick={() => goTo(page + 1)}
            >
              Next
              <ChevronRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Row({ entry }: { entry: AuditEntry }) {
  const denied = entry.action === 'application.review_denied';
  const handle =
    typeof entry.detail.tiktok_handle === 'string' ? entry.detail.tiktok_handle : null;
  const tier = typeof entry.detail.tier === 'string' ? entry.detail.tier : null;
  const note = typeof entry.detail.note === 'string' ? entry.detail.note : null;

  const body = (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-5 py-4">
      {denied ? (
        <ShieldAlert size={15} aria-hidden className="text-danger mt-0.5 shrink-0" />
      ) : null}
      <span className="font-medium break-all">{entry.actor_email ?? 'A removed account'}</span>
      <span className={denied ? 'text-danger' : 'text-muted'}>
        {describeAction(entry.action)}
      </span>
      {handle ? <span className="font-medium">@{handle}</span> : null}
      {tier ? (
        <span className="text-accent">
          as <span className="capitalize">{tier}</span>
        </span>
      ) : null}
      <span className="wx-numeric text-faint ml-auto shrink-0 text-[13px]">
        {new Date(entry.created_at).toLocaleString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
      {note ? (
        <p className="text-muted w-full text-[13px] leading-relaxed">&ldquo;{note}&rdquo;</p>
      ) : null}
    </div>
  );

  /*
   * Link to the record this was ACTUALLY about.
   *
   * Every row used to point at `/admin/applications/<subject_id>` whatever the
   * subject was, so a brand edit, a stage move and a content decision were all
   * dead links that looked alive. `subject_type` has been stored and indexed
   * since day one and was never selected until now.
   *
   * Null means there is nowhere honest to send somebody, and the row stays as
   * plain text rather than pretending it goes somewhere.
   */
  const to = denied ? null : linkForSubject(entry.subject_type, entry.subject_id);
  if (!to) return body;

  return (
    <Link to={to} className="hover:bg-surface-2 block transition-colors duration-200">
      {body}
    </Link>
  );
}
