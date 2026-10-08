import { ShieldAlert } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/auth-context';

/**
 * Shown when a profile has is_active = false.
 *
 * The account keeps its session, it simply cannot reach anything. Row level
 * security is what actually stops the data being readable; this is the polite
 * explanation rather than a wall of empty screens.
 */
export function Suspended() {
  const { signOut } = useAuth();

  return (
    <AuthShell
      title="Your account is on hold"
      subtitle="Access has been paused by the Prism team. Nothing has been deleted."
    >
      <div className="text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft text-warning">
          <ShieldAlert size={22} aria-hidden />
        </span>
        <p className="mt-5 text-[0.9375rem] leading-relaxed text-muted">
          If you think this is a mistake, reply to any email from us and we will take a
          look.
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </AuthShell>
  );
}
