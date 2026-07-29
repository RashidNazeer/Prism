import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Check } from 'lucide-react';
import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { friendlyAuthError } from '@/lib/auth/auth-errors';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { getSupabase } from '@/lib/supabase';
import { collectErrors, forgotPasswordSchema } from '@/lib/schemas/auth';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ email?: string }>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next = collectErrors(forgotPasswordSchema, { email });
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);

    // Deliberately show the same confirmation whether or not the address
    // exists. Saying "no account with that email" would let anyone check which
    // of your creators are registered.
    if (error && !/rate limit|too many/i.test(error.message)) {
      setSent(true);
      return;
    }
    if (error) {
      setFormError(friendlyAuthError(error.message));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={
          <>
            If an account exists for <strong className="text-text">{email}</strong>, a reset
            link is on its way. It expires in an hour.
          </>
        }
        footer={
          <Link to="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
            <Check size={22} aria-hidden />
          </span>
          <p className="mt-5 text-[15px] leading-relaxed text-muted">
            Nothing after a few minutes? Check your spam folder, then try again.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Give us the email on your account and we will send you a link."
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormError>{formError}</FormError>
        <Field label="Email" error={errors.email}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <Button type="submit" size="lg" disabled={pending} className="mt-6 w-full">
          {pending ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>
    </AuthShell>
  );
}
