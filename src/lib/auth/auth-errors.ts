/**
 * Turn Supabase's error text into something a creator can act on.
 *
 * Anything unrecognised is passed straight through rather than swallowed, so a
 * real problem is never hidden behind a friendly lie.
 */
export function friendlyAuthError(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  const m = message.toLowerCase();

  if (m.includes('invalid login credentials')) {
    return 'That email and password combination did not work. Check both and try again.';
  }
  if (m.includes('email not confirmed')) {
    return 'Check your inbox and confirm your email address first.';
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'There is already an account with that email. Try signing in instead.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (m.includes('password should be')) {
    return 'That password is too short.';
  }
  if (m.includes('same password')) {
    return 'That is already your password. Choose a different one.';
  }
  return message;
}
