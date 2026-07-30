import { m } from 'motion/react';
import { Check, Clock, Sparkles, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { WelcomeMoment } from '@/components/creator/WelcomeMoment';
import { ApprovedMoment } from '@/components/creator/ApprovedMoment';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useApplication } from '@/lib/auth/useApplication';
import { useOnboarding } from '@/lib/creator/useOnboarding';

/**
 * Home for applicants and creators.
 *
 * Three states, one screen:
 *   waiting   a centred, living "we have you" panel
 *   in        approved, with what is coming next
 *   not now   a rejection written like a human wrote it
 *
 * Account details are NOT here. They live on the profile screen, so this page
 * is only ever about where the creator stands with us.
 *
 * The status is live. `useApplication` subscribes to this person's own row, so
 * an approval in the admin queue lands here while they are looking at it, and
 * the one-time congratulations fires on top of it.
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
        <Approved name={firstName ?? ''} handle={application?.tiktok_handle} />
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

/* ------------------------------------------------------------- approved -- */

const COMING = [
  'Your numbers, straight from the brands you sell for',
  'Brand hubs with briefs and products',
  'Leaderboards, and retainer offers as you grow',
];

function Approved({ name, handle }: { name: string; handle: string | undefined }) {
  return (
    <div className="mx-auto max-w-2xl py-4 sm:py-8">
      <m.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-success uppercase">
          <Check size={13} aria-hidden />
          Approved
        </span>
        <h1 className="mt-5 text-[clamp(1.6rem,5vw,2.25rem)] font-extrabold text-balance">
          Welcome to Wurx{name ? `, ${name}` : ''}
        </h1>
        <p className="mt-3 max-w-lg leading-relaxed text-muted text-pretty">
          {handle ? `@${handle} is` : 'You are'} part of the roster. Your hub is being
          switched on section by section, and each one appears here as it lands.
        </p>
      </m.div>

      <m.ul
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line"
      >
        {COMING.map((c) => (
          <li key={c} className="flex items-center gap-3 bg-surface-1 px-5 py-4">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <Sparkles size={14} aria-hidden />
            </span>
            <span className="text-[14px] text-muted">{c}</span>
          </li>
        ))}
      </m.ul>
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
    <div className="mx-auto flex max-w-xl flex-col items-center py-10 text-center">
      <div className="size-20 animate-pulse rounded-full bg-surface-2" />
      <div className="mt-8 h-8 w-64 max-w-full animate-pulse rounded bg-surface-2" />
      <div className="mt-4 h-4 w-80 max-w-full animate-pulse rounded bg-surface-2" />
      <div className="mt-10 h-32 w-full animate-pulse rounded-2xl bg-surface-1" />
    </div>
  );
}
