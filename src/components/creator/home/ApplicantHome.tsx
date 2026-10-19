import { openAccountMenu } from '@/lib/account-menu';
import { m } from 'motion/react';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application } from '@/lib/auth/useApplication';

/**
 * WHAT SOMEBODY SEES WHILE THEY ARE STILL WAITING.
 *
 * THE BUILDING, WITH THE ROOMS LOCKED. This keeps a decision the product
 * already made and the brief called "a good one": an applicant walks the real
 * app with most of it visibly shut, rather than being parked in a waiting
 * room. It sets an expectation of what approval buys, which a holding page
 * cannot.
 *
 * So the four tiles below are the REAL tiles, in their real places, drawn as
 * shapes with no figures in them. They are not a screenshot and they are not
 * sample numbers — inventing a GMV for somebody who has never sold anything
 * would be the one unforgivable thing on a money screen.
 *
 * THERE ARE ONLY THREE STEPS, because there are only three states the
 * application can be in (`pending`, `approved`, `rejected`). A five-step
 * tracker with invented middle steps would be a progress bar that does not
 * measure anything.
 */

const STEPS = [
  { key: 'applied', label: 'Applied' },
  { key: 'review', label: 'In review' },
  { key: 'decision', label: 'Decision' },
] as const;

export function ApplicantHome({
  name,
  application,
  tiktokConnected,
}: {
  name: string;
  application: Application | null;
  /** Drives the one clear next action, when there is one. */
  tiktokConnected: boolean;
}) {
  /* `pending` means applied and read-pending: step 1 is done, step 2 is where
     she is. There is no event stream that says a reviewer opened it, so step 2
     is never shown as finished until the decision lands. */
  const at = application?.status === 'pending' ? 1 : 2;
  const decided = application?.status === 'approved' || application?.status === 'rejected';

  return (
    <div className="space-y-6">
      <header>
        <p className="text-muted text-sm">{name ? `Hi, ${name}` : 'Welcome'}</p>
        <h1 className="text-text mt-1 text-2xl font-bold">Your application</h1>
      </header>

      {/* THE STAGE TRACKER: horizontal on desktop, vertical on a phone. */}
      <section className="wx-neo-raised-sm rounded-xl p-4">
        <ol className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          {STEPS.map((s, i) => {
            const done = i < at || (decided && i === 2);
            const current = i === at && !decided;
            return (
              <li key={s.key} className="flex flex-1 items-start gap-3 sm:flex-col sm:gap-2">
                <div className="flex items-center gap-3 sm:w-full">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold',
                      done
                        ? 'bg-accent text-on-accent'
                        : current
                          ? 'wx-neo-raised-sm text-text'
                          : 'bg-surface-2 text-faint'
                    )}
                  >
                    {done ? <Check aria-hidden className="size-4" /> : i + 1}
                  </span>
                  {/* The connector only exists between steps, so it is a
                      sibling of the dot rather than a border on the item. */}
                  {i < STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className={cn(
                        'hidden h-px flex-1 sm:block',
                        done ? 'bg-accent' : 'bg-surface-2'
                      )}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      current ? 'text-text' : done ? 'text-text' : 'text-muted'
                    )}
                  >
                    {s.label}
                    {current && (
                      /* A soft glow on the current step, done with opacity so
                         it stays inside the motion budget. */
                      <m.span
                        aria-hidden
                        className="bg-accent ms-2 inline-block size-1.5 rounded-full align-middle"
                        animate={{ opacity: [1, 0.35, 1] }}
                        transition={{ duration: 2.4, repeat: Infinity }}
                      />
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {application?.status === 'rejected' && application.review_note && (
          <p className="text-muted mt-4 border-t border-[var(--wx-glass-edge)] pt-3 text-sm">
            {application.review_note}
          </p>
        )}
      </section>

      {/* THE ONE CLEAR NEXT ACTION, when there is one. */}
      {!tiktokConnected && application?.status !== 'rejected' && (
        <section className="wx-neo-raised-sm rounded-xl p-4">
          <button
            type="button"
            onClick={() => openAccountMenu('tiktok')}
            className="bg-accent text-on-accent inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 text-sm font-semibold"
          >
            Connect TikTok
            <ArrowRight aria-hidden className="size-4" />
          </button>
        </section>
      )}

      {/* WHAT APPROVAL BUYS: the real tiles, locked and empty. */}
      <section className="wx-neo-raised-sm relative rounded-xl p-3 sm:p-4">
        <div aria-hidden className="grid grid-cols-2 gap-3 opacity-40 lg:grid-cols-4">
          {['Total GMV', 'Commission', 'Ad spend', 'Orders'].map((title) => (
            <div key={title} className="wx-neo-raised-sm min-h-[9rem] rounded-lg p-4">
              <p className="text-muted text-[0.6875rem] font-semibold tracking-wide uppercase">
                {title}
              </p>
              <div className="bg-surface-2 mt-3 h-7 w-20 rounded-md" />
              <div className="bg-surface-2 mt-5 h-14 w-full rounded-md" />
            </div>
          ))}
        </div>

        {/*
          A TRANSLUCENT OVERLAY, NOT A SECOND BLUR. §10 makes this explicit and
          §4.3 is why: the panel underneath already spends a blur layer, and
          stacking `backdrop-filter` on top of `backdrop-filter` is both over
          budget and, on this material, nearly invisible anyway.
        */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-[var(--wx-glass-fill)] p-4 text-center">
          <Lock aria-hidden className="text-muted size-5" />
          <p className="text-text text-sm font-semibold">Opens when you are approved</p>
        </div>
      </section>
    </div>
  );
}
