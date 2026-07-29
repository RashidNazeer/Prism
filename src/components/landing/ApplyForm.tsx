import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Field, Input, PasswordInput, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
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

  const alreadySignedIn = authStatus === 'signedIn' && Boolean(user);

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
        navigate('/app', { replace: true });
        return;
      }
      setFormError(
        'Your account is ready, but we could not save your application. Sign in and finish it from your dashboard.'
      );
      return;
    }

    navigate('/app', { replace: true });
  }

  return (
    <form
      id="apply-form"
      onSubmit={onSubmit}
      noValidate
      // Warm the lazily loaded validator and database client as soon as anyone
      // touches the form, so the first submit never waits on a download.
      onFocus={() => void warm()}
      className="rounded-2xl border border-line bg-surface-1 p-6 shadow-lg sm:p-7"
    >
      <div className="flex items-center gap-4">
        <h2 className="font-mono text-[11px] font-medium tracking-[0.16em] text-muted uppercase">
          {alreadySignedIn ? 'Finish your application' : 'Apply to join'}
        </h2>
        <span className="h-px flex-1 bg-line" aria-hidden />
      </div>

      <FormError>{formError}</FormError>

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
              className="transition-transform duration-200 ease-brand group-hover:translate-x-0.5"
              aria-hidden
            />
          </>
        )}
      </Button>

      {!alreadySignedIn && (
        <p className="mt-4 text-center text-[13px] text-faint">
          Already applied?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      )}
    </form>
  );
}
