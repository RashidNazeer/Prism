import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  claimTikTokSignup,
  forgetIdentity,
  pendingIdentity,
  startTikTokSignup,
  type PendingIdentity,
} from '@/lib/signup/tiktokSignup';
import { useNavigate, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Field, Input, PasswordInput, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { TiltCard } from '@/components/ui/TiltCard';
import { FormError } from '@/components/auth/AuthShell';
import { friendlyAuthError } from '@/lib/auth/auth-errors';
import { useAuth } from '@/lib/auth/auth-context';
import {
  NICHES,
  PASSWORD_MIN,
  WORKED_WITH_WURX,
  emptyApplication,
  type ApplicationErrors,
  type ApplicationInput,
} from '@/lib/schemas/application-fields';

const EASE = [0.22, 1, 0.36, 1] as const;

type Validator = (input: ApplicationInput) => ApplicationErrors;

// Loaded lazily so Zod and the Supabase client stay off the landing page's
// critical path. Both are warmed the moment someone focuses a field, long
// before they can press the button.
const loadSchema = () => import('@/lib/schemas/application');
const loadSupabase = () => import('@/lib/supabase').then((m) => m.getSupabase());

/**
 * Creator application form. This IS the sign up.
 *
 * Applying creates the account, because an anonymous application cannot show
 * its own status, cannot update live when a decision is made, and would have to
 * be matched back to a login by email later, which breaks the moment someone
 * signs up with a different address.
 *
 * Two writes happen: create the auth user, then insert the application. If the
 * second fails the account still exists, and the dashboard offers to finish the
 * application, so nobody is ever stranded.
 */
export function ApplyForm() {
  const navigate = useNavigate();
  const { status: authStatus, user } = useAuth();

  const [values, setValues] = useState<ApplicationInput>(emptyApplication);
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const validator = useRef<Validator | null>(null);
  const queryClient = useQueryClient();

  const alreadySignedIn = authStatus === 'signedIn' && Boolean(user);

  /**
   * Drop anything already cached about this person's application before we send
   * them to their dashboard.
   *
   * Signing up fires the auth listener, which enables the "do I have an
   * application?" query. That can run BEFORE the insert below has landed, and
   * `null` then sits in the cache for the full staleTime. The dashboard would
   * greet somebody who has just applied with "Finish your application", which
   * is alarming and untrue.
   *
   * Removing rather than invalidating matters: an invalidated query still hands
   * the dashboard the stale `null` for one render while it refetches, so the
   * wrong message flashes up anyway. Removed, the dashboard opens on its
   * skeleton and then shows the truth.
   */
  const forgetCachedApplication = (id: string) => {
    queryClient.removeQueries({ queryKey: ['application', id] });
    void queryClient.invalidateQueries({ queryKey: ['profile', id] });
  };

  const warm = useCallback(async (): Promise<Validator> => {
    if (validator.current) return validator.current;
    const [{ validateApplication }] = await Promise.all([loadSchema(), loadSupabase()]);
    validator.current = validateApplication;
    return validateApplication;
  }, []);

  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    // Only nag once they have tried to submit.
    if (submitted && validator.current) setErrors(validator.current(next));
  };

  /*
   * WHAT TIKTOK HAS ALREADY VOUCHED FOR IN THIS TAB.
   *
   * Rashid, 2026-09-28: lead with "Continue with TikTok", then thank them and
   * ask for email and password with the handle already filled in.
   *
   * Read once on mount rather than on every render: it lives in sessionStorage,
   * and a component that re-reads storage while typing is a component that
   * fights the person filling the form.
   */
  const [verified, setVerified] = useState<PendingIdentity | null>(null);
  const [tiktokBusy, setTiktokBusy] = useState(false);
  const [tiktokError, setTiktokError] = useState('');

  useEffect(() => {
    const p = pendingIdentity();
    if (!p) return;
    setVerified(p);
    if (p.handle) set('tiktokHandle', p.handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onContinueWithTikTok() {
    setTiktokBusy(true);
    setTiktokError('');
    try {
      await startTikTokSignup();
      /* The browser leaves; nothing after this runs on the happy path. */
    } catch (e) {
      setTiktokBusy(false);
      setTiktokError((e as Error).message);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError('');
    setPending(true);

    const validate = await warm();
    // A signed-in user is only filling in the application half, so the password
    // rule does not apply to them.
    const toCheck = alreadySignedIn
      ? { ...values, password: 'x'.repeat(PASSWORD_MIN) }
      : values;
    const next = validate(toCheck);
    setErrors(next);

    if (Object.keys(next).length > 0) {
      setPending(false);
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    const supabase = await loadSupabase();
    let userId = user?.id ?? null;

    if (!alreadySignedIn) {
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          // Read by the handle_new_user trigger. Nothing here can set a role:
          // that is decided by the database and defaults to 'applicant'.
          data: { display_name: values.tiktokHandle.trim().replace(/^@/, '') },
        },
      });

      if (error) {
        setPending(false);
        setFormError(friendlyAuthError(error.message));
        return;
      }
      userId = data.user?.id ?? null;
    }

    if (!userId) {
      setPending(false);
      setFormError('Your account was created but we could not read it back. Try signing in.');
      return;
    }

    /*
     * ATTACH THE PROVEN TIKTOK IDENTITY, BEFORE THE APPLICATION IS WRITTEN.
     *
     * Order matters: a trigger on `applications` takes the handle from the
     * identity ledger, so the claim has to land first or the application is
     * stored with whatever is in the box instead of the account TikTok vouched
     * for. It is also why editing that box cannot cheat — the database
     * overwrites it either way.
     *
     * A failure here is NOT fatal to the application. The account exists and
     * the person is signed in; sending them back to the start would be the
     * worst possible moment to lose the form. They apply, and Settings can
     * connect TikTok afterwards.
     */
    if (verified) {
      try {
        await claimTikTokSignup();
      } catch (e) {
        forgetIdentity();
        console.error('[apply] TikTok claim failed', e);
      }
    }

    const { error: insertError } = await supabase.from('applications').insert({
      user_id: userId,
      tiktok_handle: values.tiktokHandle.trim().replace(/^@/, ''),
      niche: values.niche,
      niche_other: values.niche === 'Other' ? (values.nicheOther?.trim() ?? null) : null,
      worked_with_wurx: values.workedWithWurx === 'yes',
      video_links: values.videoLinks.trim(),
    });

    setPending(false);

    if (insertError) {
      // 23505 is a duplicate key: they already have an application on file.
      if (insertError.code === '23505') {
        forgetCachedApplication(userId);
        navigate('/app', { replace: true });
        return;
      }
      setFormError(
        'Your account is ready, but we could not save your application. Sign in and finish it from your dashboard.'
      );
      return;
    }

    forgetCachedApplication(userId);
    navigate('/app', { replace: true });
  }

  return (
    <TiltCard
      as="form"
      id="apply-form"
      onSubmit={onSubmit}
      noValidate
      // Warm the lazily loaded validator and database client as soon as anyone
      // touches the form, so the first submit never waits on a download.
      onFocus={() => void warm()}
      /* A much shallower tilt than the other cards, because this one is full of
         things you click into. See the `lift` note in TiltCard. */
      lift={2}
      className="wx-neo-raised rounded-2xl p-6 sm:p-7"
    >
      <div className="flex items-center gap-4">
        <h2 className="text-muted font-mono text-[0.6875rem] font-medium tracking-[0.16em] uppercase">
          {alreadySignedIn ? 'Finish your application' : 'Apply to join'}
        </h2>
        <span className="bg-line h-px flex-1" aria-hidden />
      </div>

      <FormError>{formError}</FormError>

      {/* ── CONTINUE WITH TIKTOK ──────────────────────────────────────────
          Rashid, 2026-09-28: "every creator must have tiktok account, that's
          why they are registering". Leading with it makes the handle PROVEN
          rather than typed, which is the fix for a field that has been quietly
          wrong for months and broke video matching on two brands.

          It is offered, not forced. TikTok can be down, an in-app browser can
          lose the tab, and a creator with no TikTok app to hand should still be
          able to apply — so the ordinary form is right underneath, unchanged. */}
      {!alreadySignedIn && !verified && (
        <div className="mt-6" data-wx="tiktok-signup">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={onContinueWithTikTok}
            disabled={tiktokBusy}
          >
            {tiktokBusy ? 'Opening TikTok…' : 'Continue with TikTok'}
          </Button>
          <p className="text-muted mt-2 text-center text-[0.75rem] leading-relaxed">
            We only read your handle and your public video stats — never your password, and we
            can never post anything.
          </p>
          {tiktokError ? (
            <p role="alert" className="text-danger mt-2 text-center text-[0.75rem]">
              {tiktokError}
            </p>
          ) : null}
          <div className="mt-5 flex items-center gap-3" aria-hidden>
            <span className="bg-line h-px flex-1" />
            <span className="text-muted font-mono text-[0.625rem] tracking-[0.16em] uppercase">
              or fill it in yourself
            </span>
            <span className="bg-line h-px flex-1" />
          </div>
        </div>
      )}

      {verified ? (
        <div className="bg-success-soft mt-6 rounded-xl p-3" data-wx="tiktok-verified">
          <p className="text-[0.875rem] font-semibold">
            Thanks — TikTok confirmed {verified.handle ? `@${verified.handle}` : 'your account'}
            .
          </p>
          <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
            {verified.handle
              ? 'Your handle is filled in below. Now choose an email and a password.'
              : 'We could not read a handle yet — add one below and we will confirm it once you post.'}
          </p>
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        <Field label="TikTok handle" error={errors.tiktokHandle}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="tiktokHandle"
              placeholder="@yourhandle"
              autoComplete="off"
              spellCheck={false}
              value={values.tiktokHandle}
              onChange={(e) => set('tiktokHandle', e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
              /* READ-ONLY, NOT DISABLED, once TikTok has vouched for it. A
                 disabled input is skipped by the tab order and reads as broken;
                 this reads as settled. Editing it would change nothing anyway —
                 the database takes the handle from the ledger — so the honest
                 thing is to stop inviting the edit. */
              readOnly={!!verified?.handle}
            />
          )}
        </Field>

        {!alreadySignedIn && (
          <>
            <Field label="Email" error={errors.email}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="email"
                  type="email"
                  inputMode="email"
                  placeholder="you@email.com"
                  autoComplete="email"
                  value={values.email}
                  onChange={(e) => set('email', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field
              label="Create a password"
              error={errors.password}
              hint={`At least ${PASSWORD_MIN} characters. Longer beats complicated.`}
            >
              {({ id, describedBy, invalid }) => (
                <PasswordInput
                  id={id}
                  name="password"
                  autoComplete="new-password"
                  placeholder="Something you will remember"
                  value={values.password}
                  onChange={(e) => set('password', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
          </>
        )}

        <Field label="Niche" error={errors.niche}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="niche"
              value={values.niche}
              onChange={(e) => set('niche', e.target.value as ApplicationInput['niche'])}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              <option value="" disabled>
                Select your niche
              </option>
              {NICHES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <AnimatePresence initial={false}>
          {values.niche === 'Other' && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="pt-1">
                <Field label="Which niche?" error={errors.nicheOther}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      name="nicheOther"
                      placeholder="Tell us in a few words"
                      value={values.nicheOther ?? ''}
                      onChange={(e) => set('nicheOther', e.target.value)}
                      aria-describedby={describedBy}
                      invalid={invalid}
                    />
                  )}
                </Field>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <Field label="Worked with a Wurx brand before?" error={errors.workedWithWurx}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="workedWithWurx"
              value={values.workedWithWurx}
              onChange={(e) =>
                set('workedWithWurx', e.target.value as ApplicationInput['workedWithWurx'])
              }
              aria-describedby={describedBy}
              invalid={invalid}
            >
              <option value="" disabled>
                Select an answer
              </option>
              {WORKED_WITH_WURX.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Your best 1-3 videos (links)"
          error={errors.videoLinks}
          hint="One per line. TikTok links are best."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name="videoLinks"
              placeholder="Paste links..."
              value={values.videoLinks}
              onChange={(e) => set('videoLinks', e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="group mt-7 w-full">
        {pending ? (
          'Sending your application...'
        ) : (
          <>
            {alreadySignedIn ? 'Submit application' : 'Apply, takes 60 seconds'}
            <ArrowRight
              size={17}
              className="ease-brand transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            />
          </>
        )}
      </Button>

      {!alreadySignedIn && (
        <p className="text-faint mt-4 text-center text-[0.8125rem]">
          Already applied?{' '}
          <Link to="/login" className="text-accent font-medium hover:underline">
            Sign in
          </Link>
        </p>
      )}
    </TiltCard>
  );
}
