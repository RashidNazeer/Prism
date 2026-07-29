import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { friendlyAuthError } from '@/lib/auth/auth-errors';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { getSupabase } from '@/lib/supabase';
import { collectErrors, resetPasswordSchema, PASSWORD_MIN } from '@/lib/schemas/auth';

/**
 * Landing page for the link in a password reset email.
 *
 * Supabase's client picks the recovery token out of the URL and turns it into a
 * temporary session (that is what `detectSessionInUrl` does). So by the time
 * this renders, the user is briefly signed in and allowed to set a new password.
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Partial<Record<'password' | 'confirmPassword', string>>>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking');

  useEffect(() => {
    // Give the client a moment to consume the token from the URL fragment.
    const t = setTimeout(async () => {
      const { data } = await getSupabase().auth.getSession();
      setReady(data.session ? 'ok' : 'invalid');
    }, 400);
    return () => clearTimeout(t);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next = collectErrors(resetPasswordSchema, values);
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    const { error } = await getSupabase().auth.updateUser({ password: values.password });
    setPending(false);

    if (error) {
      setFormError(friendlyAuthError(error.message));
      return;
    }
    navigate('/app', { replace: true });
  }

  if (ready === 'checking') {
    return (
      <AuthShell title="One moment">
        <p className="text-[15px] text-muted">Checking your reset link...</p>
      </AuthShell>
    );
  }

  if (ready === 'invalid') {
    return (
      <AuthShell
        title="That link has expired"
        subtitle="Reset links are good for one hour and can only be used once."
        footer={
          <Link to="/forgot-password" className="font-medium text-accent hover:underline">
            Send me a new one
          </Link>
        }
      >
        <p className="text-[15px] leading-relaxed text-muted">
          Ask for a fresh link and use it as soon as it arrives.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Then we will sign you straight in.">
      <form onSubmit={onSubmit} noValidate>
        <FormError>{formError}</FormError>
        <div className="space-y-5">
          <Field
            label="New password"
            error={errors.password}
            hint={`At least ${PASSWORD_MIN} characters.`}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="password"
                type="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
          <Field label="Confirm new password" error={errors.confirmPassword}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={(e) => setValues((v) => ({ ...v, confirmPassword: e.target.value }))}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
        </div>
        <Button type="submit" size="lg" disabled={pending} className="mt-6 w-full">
          {pending ? 'Saving...' : 'Save new password'}
        </Button>
      </form>
    </AuthShell>
  );
}
