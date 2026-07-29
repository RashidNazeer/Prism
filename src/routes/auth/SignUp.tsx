import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { friendlyAuthError } from '@/lib/auth/auth-errors';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { getSupabase } from '@/lib/supabase';
import { collectErrors, signUpSchema, PASSWORD_MIN, type SignUpInput } from '@/lib/schemas/auth';

const EMPTY: SignUpInput = {
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export function SignUp() {
  const navigate = useNavigate();
  const [values, setValues] = useState<SignUpInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof SignUpInput, string>>>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);

  const set = <K extends keyof SignUpInput>(k: K, v: SignUpInput[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next = collectErrors(signUpSchema, values);
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    const { error } = await getSupabase().auth.signUp({
      email: values.email.trim(),
      password: values.password,
      options: {
        // Read by the handle_new_user trigger to populate profiles.display_name.
        // NOTE: nothing here can set a role. Role is decided by the database,
        // defaults to 'applicant', and is not writable by the account holder.
        data: { display_name: values.displayName.trim() },
      },
    });
    setPending(false);

    if (error) {
      setFormError(friendlyAuthError(error.message));
      return;
    }

    // Email confirmation is off on dev, so a session already exists and the
    // guard will let them through. When confirmation is switched on for prod
    // this needs a "check your inbox" screen instead. See docs/PARKED.md item 2.
    navigate('/app', { replace: true });
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="One login for every Wurx brand you work with."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormError>{formError}</FormError>

        <div className="space-y-5">
          <Field label="Your name" error={errors.displayName}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="displayName"
                autoComplete="name"
                placeholder="How should we address you?"
                value={values.displayName}
                onChange={(e) => set('displayName', e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field label="Email" error={errors.email}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field
            label="Password"
            error={errors.password}
            hint={`At least ${PASSWORD_MIN} characters. Longer beats complicated.`}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Choose a password"
                value={values.password}
                onChange={(e) => set('password', e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field label="Confirm password" error={errors.confirmPassword}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Type it once more"
                value={values.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
        </div>

        <Button type="submit" size="lg" disabled={pending} className="group mt-7 w-full">
          {pending ? (
            'Creating your account...'
          ) : (
            <>
              Create account
              <ArrowRight
                size={17}
                className="transition-transform duration-200 ease-brand group-hover:translate-x-0.5"
                aria-hidden
              />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
