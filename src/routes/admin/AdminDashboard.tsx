import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FileText,
  Handshake,
  PackageCheck,
  Timer,
  Video,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { describeAction, linkForSubject, useAuditLog } from '@/lib/admin/useAuditLog';
import {
  useAtRisk,
  useInbox,
  useOpsMoney,
  useWithCreators,
  type OpsMoney,
} from '@/lib/admin/useOpsHome';

/**
 * The admin landing screen: what today looks like.
 *
 * It used to read ONE table, `applications`, and could say "nothing is waiting
 * on you, the queue is clear" while nine creators sat unanswered on the
 * requests queue and forty videos sat unwatched. It now counts all three
 * inboxes and will not claim the day is clear until every one of them is empty.
 *
 * Order matters here and follows what somebody actually needs: what is waiting
 * on US, then what is waiting on CREATORS, then the money, then what is at
 * risk. Every number is a link into the screen already filtered for it, because
 * a count you cannot act on is decoration.
 */
export function AdminDashboard() {
  const { data: inbox, isLoading: inboxLoading, isError: inboxFailed } = useInbox();
  const { data: creators } = useWithCreators();
  const { data: opsMoney } = useOpsMoney();
  const { data: risk } = useAtRisk();
  const { data: activity, isError: activityFailed } = useAuditLog({ limit: 6 });

  const queues = [
    {
      key: 'applications' as const,
      label: 'Applications',
      hint: 'people asking to join',
      icon: FileText,
      to: '/admin/applications?status=pending',
    },
    {
      key: 'requests' as const,
      label: 'Offer requests',
      hint: 'creators asking for a deal',
      icon: Handshake,
      to: '/admin/offers/requests?status=pending',
    },
    {
      key: 'videos' as const,
      label: 'Videos to watch',
      hint: 'work waiting on a decision',
      icon: Video,
      to: '/admin/content?status=submitted',
    },
  ];

  return (
    <>
      {/*
        THE GREETING AND THE SENTENCE UNDER IT WENT ON 2026-08-16.

        Rashid: the top bar names the section now, and he does not want the
        description of a section repeated on the section. Both rows were also
        saying, in prose, exactly what the three tiles below say better, as
        numbers you can click. The screen opens on the counts instead.

        There is no filter row here. Nothing on this screen filters anything, so
        an empty control panel would only be a bar of chrome to look past.

        The FAILURE line is the one sentence that survived, and it moved down
        beside the tiles it is about. It is not a description of the screen, it
        is the only thing that explains why every count reads "·".
      */}
      {inboxFailed ? (
        <p className="text-danger mb-4 max-w-2xl text-[0.9375rem] leading-relaxed">
          Those numbers would not load, so this page cannot tell you what is waiting. The queues
          themselves still work.
        </p>
      ) : null}

      {/* -------------------------------------------------- waiting on us -- */}
      <ul className="grid gap-3 sm:grid-cols-3">
        {queues.map((q) => {
          const n = inbox?.[q.key];
          return (
            <li key={q.key}>
              <Link
                to={q.to}
                className={cn(
                  'border-line bg-surface-1 hover:border-accent/60 flex h-full flex-col rounded-xl border p-5 shadow-md transition-colors'
                )}
              >
                <span className="text-muted flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                  <q.icon size={14} aria-hidden className="text-faint" />
                  {q.label}
                </span>
                <span
                  className={cn(
                    'font-display mt-3 text-[1.875rem] leading-none font-semibold',
                    inboxFailed ? 'text-faint' : n && n > 0 ? 'text-stage-due' : 'text-muted'
                  )}
                >
                  {inboxLoading ? '' : inboxFailed ? '·' : (n ?? 0)}
                </span>
                <span className="text-faint mt-2 text-[0.78125rem]">{q.hint}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* ---------------------------------------------- waiting on them --- */}
      <section className="border-line bg-surface-1 mt-4 rounded-xl border p-5 shadow-md">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Waiting on creators
          </h2>
          {creators && creators.live > 0 ? (
            <Link
              to="/admin/offers/requests?status=approved"
              className="text-muted hover:text-accent text-[0.8125rem] transition-colors"
            >
              {creators.live} {creators.live === 1 ? 'job' : 'jobs'} in flight
            </Link>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: 'Filming now',
              value: creators?.filming,
              icon: Video,
              to: '/admin/offers/requests?status=approved&stage=content_pending',
            },
            {
              label: 'Sample on its way',
              value: creators?.sampleOut,
              icon: PackageCheck,
              to: '/admin/offers/requests?status=approved&stage=sample_shipped',
            },
            {
              label: 'Awaiting payment',
              value: creators?.awaitingPayment,
              icon: Clock,
              to: '/admin/offers/requests?status=approved&stage=payment_pending',
            },
          ].map((c) => (
            <Link
              key={c.label}
              to={c.to}
              className="border-line bg-surface-2 hover:border-accent/60 rounded-lg border px-4 py-3 transition-colors"
            >
              <dt className="text-muted flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                <c.icon size={13} aria-hidden className="text-faint" />
                {c.label}
              </dt>
              <dd className="font-display mt-1 text-[1.1875rem] font-semibold">
                {c.value ?? '...'}
              </dd>
            </Link>
          ))}
        </dl>

        {creators && creators.stalled > 0 ? (
          <p className="border-line text-stage-due mt-4 flex items-start gap-2 border-t pt-3 text-[0.8125rem] leading-relaxed">
            <Timer size={14} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {creators.stalled} {creators.stalled === 1 ? 'job has' : 'jobs have'} not moved in
              a fortnight. Worth a nudge.
            </span>
          </p>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ money -- */}
      {(opsMoney ?? []).map((m) => (
        <MoneyRow key={m.currency} m={m} showCurrency={(opsMoney ?? []).length > 1} />
      ))}

      {/* ---------------------------------------------------------- at risk -- */}
      {risk && (risk.brands.length > 0 || risk.emptyOffers > 0 || risk.blocked > 0) ? (
        <section className="border-line bg-surface-1 mt-4 rounded-xl border p-5 shadow-md">
          <h2 className="text-muted flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            <AlertTriangle size={14} aria-hidden className="text-faint" />
            Worth a look
          </h2>

          <ul className="mt-3 flex flex-col gap-2">
            {risk.brands.map((b) => (
              <li key={b.id}>
                <Link
                  to={`/admin/brands/${b.id}`}
                  className="hover:text-accent flex flex-wrap items-baseline gap-x-2 text-[0.84375rem] transition-colors"
                >
                  <span className="font-medium">{b.name}</span>
                  <span className={cn(b.percent >= 100 ? 'text-danger' : 'text-stage-due')}>
                    {Math.round(b.percent)}% of its budget committed
                  </span>
                </Link>
              </li>
            ))}
            {risk.emptyOffers > 0 ? (
              <li>
                <Link
                  to="/admin/offers?kind=application"
                  className="text-muted hover:text-accent text-[0.84375rem] transition-colors"
                >
                  {risk.emptyOffers} live {risk.emptyOffers === 1 ? 'offer' : 'offers'} nobody
                  has taken
                </Link>
              </li>
            ) : null}
            {risk.blocked > 0 ? (
              <li>
                <Link
                  to="/admin/activity"
                  className="text-muted hover:text-accent text-[0.84375rem] transition-colors"
                >
                  {risk.blocked} blocked {risk.blocked === 1 ? 'attempt' : 'attempts'} this week
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {/* --------------------------------------------------------- activity -- */}
      <section className="border-line bg-surface-1 mt-4 rounded-xl border shadow-md">
        <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Latest activity
          </h2>
          <Link
            to="/admin/activity"
            className="text-muted hover:text-accent flex items-center gap-1 text-[0.8125rem] transition-colors"
          >
            See all
            <ArrowRight size={13} aria-hidden />
          </Link>
        </div>

        {activityFailed ? (
          <p className="text-muted px-5 py-6 text-[0.875rem]">The activity log would not load.</p>
        ) : (activity ?? []).length === 0 ? (
          <p className="text-muted px-5 py-6 text-[0.875rem]">Nothing has happened yet.</p>
        ) : (
          <ul className="divide-line divide-y">
            {(activity ?? []).map((entry) => {
              const to = linkForSubject(entry.subject_type, entry.subject_id);
              const body = (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-5 py-3">
                  <span className="text-[0.84375rem] font-medium break-all">
                    {entry.actor_email ?? 'Somebody'}
                  </span>
                  <span className="text-muted text-[0.84375rem]">
                    {describeAction(entry.action)}
                  </span>
                  <time
                    dateTime={entry.created_at}
                    className="text-faint ml-auto shrink-0 text-[0.75rem]"
                  >
                    {new Date(entry.created_at).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </time>
                </div>
              );
              return (
                <li key={entry.id}>
                  {to ? (
                    <Link to={to} className="hover:bg-surface-2 block transition-colors">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {inbox && inbox.total === 0 ? (
        <div className="border-line bg-surface-1 mt-4 rounded-xl border p-5 shadow-md">
          <p className="font-semibold">Nothing needs you right now.</p>
          <p className="text-muted mt-1.5 max-w-xl text-[0.875rem] leading-relaxed">
            A good moment to look at what is running: which brands are near their budget, and
            which offers nobody has taken.
          </p>
          <ButtonLink to="/admin/brands" variant="secondary" size="sm" className="mt-4">
            Brand hubs
            <ArrowRight size={15} aria-hidden />
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ money -- */

/**
 * Every brand's committed money, split the same three ways a creator sees it.
 *
 * Per currency, never summed across. The home screen must not be the one place
 * that adds dollars to pounds because it felt like a summary.
 */
function MoneyRow({ m, showCurrency }: { m: OpsMoney; showCurrency: boolean }) {
  const fmt = (n: number) => money(Math.round(n * 100) / 100, m.currency);
  const share = (n: number) => (m.total > 0 ? (n / m.total) * 100 : 0);

  const cells = [
    { label: 'Paid out', value: m.paid, text: 'text-stage-paid', bar: 'bg-stage-paid' },
    { label: 'Awaiting payment', value: m.due, text: 'text-stage-due', bar: 'bg-stage-due' },
    { label: 'In progress', value: m.working, text: 'text-stage-live', bar: 'bg-stage-live' },
  ];

  if (m.total === 0) return null;

  return (
    <section className="border-line bg-surface-1 mt-4 rounded-xl border p-5 shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Committed across every brand{showCurrency ? ` (${m.currency})` : ''}
        </h2>
        <p className="font-display text-[0.9375rem] font-semibold">{fmt(m.total)}</p>
      </div>

      <div
        className="bg-line mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={`${fmt(m.paid)} paid, ${fmt(m.due)} awaiting payment, ${fmt(m.working)} in progress`}
      >
        {cells
          .filter((c) => c.value > 0)
          .map((c) => (
            <span
              key={c.label}
              className={cn('h-full rounded-full', c.bar)}
              style={{ width: `${share(c.value)}%` }}
            />
          ))}
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {cells.map((c) => (
          <div
            key={c.label}
            className="border-line bg-surface-2 rounded-lg border px-4 py-3"
          >
            <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {c.label}
            </dt>
            <dd className={cn('font-display mt-1 text-[1.0625rem] font-semibold', c.text)}>
              {fmt(c.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
