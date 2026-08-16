import { Clock } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * What an applicant sees where a creator sees a brand hub.
 *
 * The database already refuses them, so without this they would land on a
 * truthful but baffling "no brands open yet". This says which of the two it is:
 * there is plenty here, it is just not theirs yet.
 *
 * Not a security boundary, and not pretending to be one. The rows are gone
 * before the browser is involved.
 */
export function LockedUntilApproved({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface-1 px-6 py-14 text-center',
        className
      )}
    >
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
        <Clock size={22} aria-hidden />
      </span>
      <p className="mt-5 font-semibold">This opens when you are approved</p>
      <p className="mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed text-muted">
        Brand hubs, their products and their offers are for creators on the roster. A
        real person is reading your application, and this unlocks the moment they say
        yes.
      </p>
      <ButtonLink to="/app" variant="secondary" size="sm" className="mt-6">
        Back to home
      </ButtonLink>
    </div>
  );
}
