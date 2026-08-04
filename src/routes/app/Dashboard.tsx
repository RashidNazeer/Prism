import { useMemo } from 'react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import {
  Check,
  Clock,
  Handshake,
  Hourglass,
  Sparkles,
  Store,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { CountUp } from '@/components/creator/CountUp';
import { StageTracker } from '@/components/creator/StageTracker';
import { WelcomeMoment } from '@/components/creator/WelcomeMoment';
import { ApprovedMoment } from '@/components/creator/ApprovedMoment';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { STAGE_META, stageIndex } from '@/lib/offer-stages';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useApplication } from '@/lib/auth/useApplication';
import { useOnboarding } from '@/lib/creator/useOnboarding';
import {
  useMyStageEvents,
  useMyWork,
  useWorkSummary,
  type MyWorkRow,
  type WorkSummary,
} from '@/lib/creator/useMyWork';

/**
 * Home for applicants and creators.
 *
 * Four states, one screen: waiting on a decision, turned down, approved but
 * with nothing on yet, and working. The last one is the real product, and it is
 * the only screen in here that answers the question a creator actually opens
 * the app with: where is my money and what is happening to it.
 *
 * Everything is live. `useMyWork` watches this creator's own rows, so an admin
 * marking a sample shipped or a payment made lands here while they are looking
 * at it, with no refresh. That is the whole thesis of the product in one
 * behaviour.
 */
export function Dashboard() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const { data: application, isLoading: appLoading } = useApplication();
  const { moment, dismiss, dismissing } = useOnboarding();

  // Prefer the profile row over the JWT claim. A token only refreshes about
  // once an hour, so a creator approved thirty seconds ago is still carrying
  // `applicant` in their claims.
  const role = profile?.role ?? claims?.role;
  const firstName = (profile?.display_name || profile?.email?.split('@')[0] || '').split(
    ' '
  )[0];
  const status = application?.status;

  return (
    <AppShell>
      {moment === 'welcome' ? (
        <WelcomeMoment
          name={firstName ?? ''}
          busy={dismissing}
          onDone={() => dismiss('welcome')}
        />
      ) : null}

      {moment === 'approved' ? (
        <ApprovedMoment
          name={firstName ?? ''}
          tier={profile?.tier ?? null}
          note={application?.review_note ?? null}
          busy={dismissing}
          onDone={() => dismiss('approved')}
        />
      ) : null}

      {appLoading ? (
        <Skeleton />
      ) : role === 'creator' ? (
        <CreatorHome name={firstName ?? ''} />
      ) : status === 'rejected' ? (
        <Rejected note={application?.review_note ?? null} />
      ) : application ? (
        <InReview
          name={firstName ?? ''}
          handle={application.tiktok_handle}
          appliedAt={application.created_at}
        />
      ) : (
        <Unfinished />
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------ the board -- */

function CreatorHome({ name }: { name: string }) {
  const { data: rows, isLoading } = useMyWork();
  const { data: events } = useMyStageEvents(12);
  const summary = useWorkSummary(rows);

  /** Active work first, then anything already paid out. */
  const work = useMemo(() => {
    const approved = (rows ?? []).filter((r) => r.status === 'approved');
    return approved.sort((a, b) => {
      const ap = a.stage === 'paid' ? 1 : 0;
      const bp = b.stage === 'paid' ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return stageIndex(b.stage ?? 'pending_request') - stageIndex(a.stage ?? 'pending_request');
    });
  }, [rows]);

  if (isLoading) return <Skeleton />;

  const nothingYet = summary.approved === 0 && summary.waiting === 0;

  return (
    <div className="max-w-5xl">
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-extrabold">
          {name ? `Welcome back, ${name}` : 'Welcome back'}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {nothingYet
            ? 'Nothing on the go yet. Take an offer and it appears here.'
            : 'Where your work stands, and where your money is.'}
        </p>
      </m.div>

      {nothingYet ? <NothingYet /> : <Money summary={summary} />}

      {summary.approved > 0 || summary.waiting > 0 ? (
        <Counts summary={summary} />
      ) : null}

      {work.length > 0 ? <Work rows={work} /> : null}

      {(events ?? []).length > 0 ? <Activity rows={rows ?? []} events={events ?? []} /> : null}
    </div>
  );
}

/* --------------------------------------------------------------- money --- */

function Money({ summary }: { summary: WorkSummary }) {
  const { paid, due, working, total, currency } = summary.money;
  const fmt = (n: number) => money(Math.round(n * 100) / 100, currency);

  // Widths of the flow bar. Guarded against a zero total so an empty bar does
  // not become NaN% and disappear.
  const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <m.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface-1"
    >
      <div className="border-b border-line px-5 py-5 sm:px-7 sm:py-6">
        <p className="font-mono text-[10px] tracking-[0.16em] text-faint uppercase">
          Paid to you so far
        </p>
        <CountUp
          value={paid}
          format={fmt}
          className="wx-numeric mt-1 block text-[clamp(2rem,7vw,3rem)] leading-none font-extrabold text-accent"
        />
        <p className="mt-2 text-[14px] text-muted">
          {total > paid ? (
            <>
              <span className="wx-numeric font-semibold text-text">{fmt(total - paid)}</span>{' '}
              more agreed and on its way
            </>
          ) : (
            'Everything agreed has been paid out.'
          )}
        </p>

        {/* Where every agreed pound currently sits. The three add up to the
            total by construction: each stage belongs to exactly one bucket. */}
        {total > 0 ? (
          <div className="mt-5">
            <div
              role="img"
              aria-label={`${fmt(paid)} paid, ${fmt(due)} awaiting payment, ${fmt(working)} in progress`}
              className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2"
            >
              {/*
               * Green, gold, grey. NOT success/warning/accent, which is the
               * obvious choice and unreadable: in light mode `--wx-warning`
               * (#8a6410) and `--wx-accent` (#8a5f1f) are within a hair of each
               * other, so two thirds of the bar looked like one segment.
               *
               * This ramp also says something true. Green is in your account,
               * gold is about to be, grey is not yet.
               */}
              {[
                { key: 'paid', value: paid, className: 'bg-success' },
                { key: 'due', value: due, className: 'bg-accent' },
                { key: 'working', value: working, className: 'bg-line-strong' },
              ]
                .filter((s) => s.value > 0)
                .map((s, i) => (
                  <m.span
                    key={s.key}
                    initial={{ width: 0 }}
                    animate={{ width: `${share(s.value)}%` }}
                    transition={{ duration: 0.7, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                    className={cn('h-full', s.className)}
                  />
                ))}
            </div>
          </div>
        ) : null}
      </div>

      <dl className="grid divide-line sm:grid-cols-3 sm:divide-x">
        <MoneyCell
          label="Paid"
          value={fmt(paid)}
          hint="Already in your account"
          icon={<Check size={14} aria-hidden />}
          tone="success"
        />
        {/* The icon tones match the bar above, in the same order, so the bar
            needs no legend of its own. */}
        <MoneyCell
          label="Awaiting payment"
          value={fmt(due)}
          hint="Work done, payment approved"
          icon={<Wallet size={14} aria-hidden />}
          tone="accent"
        />
        <MoneyCell
          label="In progress"
          value={fmt(working)}
          hint="Agreed, still being worked"
          icon={<Clock size={14} aria-hidden />}
          tone="muted"
        />
      </dl>
    </m.section>
  );
}

function MoneyCell({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: 'success' | 'accent' | 'muted';
}) {
  return (
    <div className="border-t border-line px-5 py-4 sm:border-t-0 sm:px-6 sm:py-5">
      <dt className="flex items-center gap-2">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full',
            tone === 'success' && 'bg-success-soft text-success',
            tone === 'accent' && 'bg-accent-soft text-accent',
            tone === 'muted' && 'bg-surface-2 text-muted'
          )}
        >
          {icon}
        </span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
          {label}
        </span>
      </dt>
      <dd className="wx-numeric mt-2 text-[19px] font-bold">{value}</dd>
      <dd className="mt-0.5 text-[12px] text-faint">{hint}</dd>
    </div>
  );
}

/* -------------------------------------------------------------- counts --- */

function Counts({ summary }: { summary: WorkSummary }) {
  const items = [
    {
      label: 'Offers you are on',
      value: summary.approved,
      icon: Handshake,
      to: '/app/offers?tab=in',
    },
    { label: 'Brands you work with', value: summary.brands, icon: Store, to: '/app/brands' },
    { label: 'Waiting on a decision', value: summary.waiting, icon: Hourglass, to: '/app/offers' },
    { label: 'Not accepted', value: summary.declined, icon: X, to: '/app/offers' },
  ];

  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, i) => (
        <m.li
          key={item.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link
            to={item.to}
            className="flex h-full items-center gap-3 rounded-2xl border border-line bg-surface-1 px-5 py-4 transition-colors duration-200 hover:border-accent"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
              <item.icon size={16} aria-hidden />
            </span>
            <span className="min-w-0">
              <CountUp
                value={item.value}
                format={(n) => String(Math.round(n))}
                className="wx-numeric block text-[22px] leading-none font-extrabold"
              />
              <span className="mt-1 block text-[13px] text-muted">{item.label}</span>
            </span>
          </Link>
        </m.li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- work --- */

function Work({ rows }: { rows: MyWorkRow[] }) {
  return (
    <section className="mt-8">
      <SectionHeading>Your work</SectionHeading>

      <ul className="mt-3 grid gap-3">
        {rows.map((row, i) => (
          <m.li
            key={row.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'rounded-2xl border bg-surface-1 p-5',
              row.stage === 'paid' ? 'border-dashed border-line' : 'border-line'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
              <div className="min-w-0 flex-1 basis-56">
                <Link
                  to={`/app/brands/${row.brand?.slug ?? ''}`}
                  className="inline-flex items-center gap-2 text-muted transition-colors hover:text-accent"
                >
                  <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2">
                    {row.brand?.logo_url ? (
                      <img src={row.brand.logo_url} alt="" className="size-full object-cover" />
                    ) : (
                      <Store size={11} aria-hidden className="text-faint" />
                    )}
                  </span>
                  <span className="truncate text-[13px] font-medium">{row.brand?.name}</span>
                </Link>
                <p className="mt-1 font-semibold break-words">
                  {row.offer?.title ?? 'An offer'}
                </p>
                {row.stage ? (
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    {STAGE_META[row.stage].creatorHint}
                  </p>
                ) : null}
              </div>

              <div className="shrink-0 text-right">
                <span className="block font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                  {row.stage === 'paid' ? 'Paid' : 'You get'}
                </span>
                <span
                  className={cn(
                    'wx-numeric mt-1 block text-lg font-bold',
                    row.stage === 'paid' ? 'text-success' : 'text-accent'
                  )}
                >
                  {row.committed_amount === null
                    ? 'To confirm'
                    : money(row.committed_amount, row.currency)}
                </span>
              </div>
            </div>

            {row.stage ? <StageTracker stage={row.stage} className="mt-4" /> : null}
          </m.li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------ activity --- */

function Activity({
  rows,
  events,
}: {
  rows: MyWorkRow[];
  events: { id: number; application_id: string; to_stage: keyof typeof STAGE_META; note: string | null; created_at: string }[];
}) {
  const byId = new Map(rows.map((r) => [r.id, r]));

  return (
    <section className="mt-8">
      <SectionHeading>Latest</SectionHeading>

      <ol className="mt-3 overflow-hidden rounded-2xl border border-line">
        {events.map((event, i) => {
          const row = byId.get(event.application_id);
          const meta = STAGE_META[event.to_stage];
          const Icon = meta.icon;
          return (
            <li
              key={event.id}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface-1 px-4 py-3',
                i > 0 && 'border-t border-line'
              )}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full',
                  event.to_stage === 'paid'
                    ? 'bg-success-soft text-success'
                    : 'bg-accent-soft text-accent'
                )}
              >
                <Icon size={13} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 basis-48 text-[14px]">
                <span className="font-semibold">{meta.label}</span>
                {row ? (
                  <span className="text-muted">
                    {' '}
                    on {row.offer?.title ?? 'an offer'}
                    {row.brand ? ` at ${row.brand.name}` : ''}
                  </span>
                ) : null}
                {event.note ? (
                  <span className="mt-0.5 block text-[13px] text-muted">{event.note}</span>
                ) : null}
              </span>
              <time
                dateTime={event.created_at}
                className="shrink-0 font-mono text-[11px] text-faint"
              >
                {new Date(event.created_at).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })}
              </time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
        {children}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

/* ----------------------------------------------------------- nothing yet -- */

const COMING = [
  'Your numbers, straight from the brands you sell for',
  'Briefs, contests and leaderboards inside each hub',
  'Retainer offers as you grow',
];

function NothingYet() {
  return (
    <>
      <m.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 rounded-2xl border border-line bg-surface-1 px-6 py-8 text-center"
      >
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <TrendingUp size={22} aria-hidden />
        </span>
        <p className="mt-5 text-lg font-bold">Take your first offer</p>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted">
          Everything you take shows up here: what stage it is at, what it pays, and what has
          landed in your account. Nothing is hidden from you.
        </p>
        <ButtonLink to="/app/offers" className="mt-6">
          See what is on the table
        </ButtonLink>
      </m.div>

      <ul className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {COMING.map((c) => (
          <li key={c} className="flex items-center gap-3 bg-surface-1 px-5 py-4">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <Sparkles size={14} aria-hidden />
            </span>
            <span className="text-[14px] text-muted">{c}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* -------------------------------------------------------------- waiting -- */

const STEPS = [
  { label: 'Applied', state: 'done' as const },
  { label: 'In review', state: 'now' as const },
  { label: 'Approved', state: 'next' as const },
];

function InReview({
  name,
  handle,
  appliedAt,
}: {
  name: string;
  handle: string;
  appliedAt: string;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center sm:py-12">
      {/* A slow double ring around a clock. It never stops, so the screen
          always looks alive rather than like a page that failed to load. */}
      <div className="relative grid size-28 place-items-center">
        {[0, 1].map((i) => (
          <m.span
            key={i}
            aria-hidden
            initial={{ scale: 0.6, opacity: 0.5 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 1.5,
              ease: 'easeOut',
            }}
            className="absolute inset-0 rounded-full border border-accent"
          />
        ))}
        <m.span
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          className="relative grid size-20 place-items-center rounded-full bg-accent-soft text-accent"
        >
          <Clock size={30} aria-hidden />
        </m.span>
      </div>

      <m.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 text-[clamp(1.6rem,5vw,2.25rem)] font-extrabold text-balance"
      >
        Thank you for joining{name ? `, ${name}` : ''}
      </m.h1>

      <m.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="mt-4 max-w-md leading-relaxed text-muted text-pretty"
      >
        Your application is with our team. A real person reads every one, so it takes a
        little time rather than a moment.
      </m.p>

      {/* Where they are, at a glance. */}
      <m.ol
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-9 flex w-full max-w-sm items-start justify-between gap-2"
      >
        {STEPS.map((s, i) => (
          <li key={s.label} className="relative flex flex-1 flex-col items-center gap-2">
            {i > 0 ? (
              <span
                aria-hidden
                className={`absolute top-4 right-1/2 left-[-50%] h-px ${
                  s.state === 'next' ? 'bg-line' : 'bg-accent'
                }`}
              />
            ) : null}

            <span
              className={`relative grid size-8 place-items-center rounded-full border text-[11px] ${
                s.state === 'done'
                  ? 'border-accent bg-accent text-on-accent'
                  : s.state === 'now'
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface-1 text-faint'
              }`}
            >
              {s.state === 'done' ? (
                <Check size={14} aria-hidden />
              ) : s.state === 'now' ? (
                <m.span
                  aria-hidden
                  animate={{ opacity: [1, 0.25, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="size-2 rounded-full bg-accent"
                />
              ) : (
                <span aria-hidden className="size-2 rounded-full bg-line-strong" />
              )}
            </span>
            <span
              className={`font-mono text-[10px] tracking-[0.12em] uppercase ${
                s.state === 'next' ? 'text-faint' : 'text-muted'
              }`}
            >
              {s.label}
            </span>
          </li>
        ))}
      </m.ol>

      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="mt-10 w-full rounded-2xl border border-line bg-surface-1 px-6 py-5 text-left shadow-sm"
      >
        <p className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
          Under review
        </p>
        <p className="mt-2 text-lg font-bold break-all">@{handle}</p>
        <p className="mt-1 text-[13px] text-muted">
          Applied {new Date(appliedAt).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-[13px] leading-relaxed text-muted">
          <Sparkles size={15} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          Keep this page open if you like. The moment a decision is made it changes here
          on its own, with no refresh and no email needed.
        </p>
      </m.div>
    </div>
  );
}

/* ------------------------------------------------------------- rejected -- */

function Rejected({ note }: { note: string | null }) {
  return (
    <div className="mx-auto max-w-lg py-8 text-center sm:py-14">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-danger-soft text-danger">
        <X size={26} aria-hidden />
      </span>
      <h1 className="mt-6 text-[clamp(1.5rem,5vw,2rem)] font-extrabold">Not this time</h1>
      <p className="mt-4 leading-relaxed text-muted text-pretty">
        We are not able to take you on right now. This is usually about fit with the
        brands we are running, rather than the quality of your work, and it is not
        permanent.
      </p>
      {note ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface-1 px-5 py-4 text-left text-[14px] leading-relaxed text-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------- unfinished -- */

function Unfinished() {
  return (
    <div className="mx-auto max-w-lg py-8 text-center sm:py-14">
      <h1 className="text-[clamp(1.5rem,5vw,2rem)] font-extrabold">
        Finish your application
      </h1>
      <p className="mt-4 leading-relaxed text-muted text-pretty">
        Your account is ready, but we do not have your application details yet. It takes
        about a minute.
      </p>
      <ButtonLink to="/apply" className="mt-6">
        Complete it now
      </ButtonLink>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-5xl">
      <div className="h-8 w-64 max-w-full animate-pulse rounded bg-surface-2" />
      <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-surface-2" />
      <div className="mt-6 h-56 animate-pulse rounded-2xl bg-surface-1" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-1" />
        ))}
      </div>
    </div>
  );
}
