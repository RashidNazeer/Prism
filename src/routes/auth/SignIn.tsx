import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { friendlyAuthError } from '@/lib/auth/auth-errors';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { getSupabase } from '@/lib/supabase';
import { collectErrors, signInSchema, type SignInInput } from '@/lib/schemas/auth';
import { HOME_FOR_ROLE, readClaims } from '@/lib/auth/auth-context';

export function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState<SignInInput>({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof SignInInput, string>>>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);

  const set = <K extends keyof SignInInput>(k: K, v: SignInInput[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next = collectErrors(signInSchema, values);
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    const { data, error } = await getSupabase().auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    });
    setPending(false);

    if (error) {
      setFormError(friendlyAuthError(error.message));
      return;
    }

    // Send them where they were headed, or to the home screen for their role.
    // This is the ONE place a sign-in redirect happens; the auth listener never
    // navigates, so a token refresh cannot move anyone.
    const intended = (location.state as { from?: string } | null)?.from;
    const claims = readClaims(data.session?.access_token);
    navigate(intended ?? (claims ? HOME_FOR_ROLE[claims.role] : '/app'), { replace: true });
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your brands and your numbers."
      footer={
        <>
          No account yet?{' '}
          <Link to="/signup" className="font-medium text-accent hover:underline">
            Apply to join
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormError>{formError}</FormError>

        <div className="space-y-5">
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

          <Field label="Password" error={errors.password}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={values.password}
                onChange={(e) => set('password', e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
        </div>

        <div className="mt-3 text-right">
          <Link
            to="/forgot-password"
            className="text-[0.8125rem] text-muted underline-offset-4 hover:text-accent hover:underline"
          >
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" size="lg" disabled={pending} className="group mt-6 w-full">
          {pending ? (
            'Signing you in...'
          ) : (
            <>
              Sign in
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
