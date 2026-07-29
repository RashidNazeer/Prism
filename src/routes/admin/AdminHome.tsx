import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/lib/auth/auth-context';

/**
 * Home for ops and admin. Placeholder for Step 1.
 * Step 4 replaces this with the application review queue.
 */
export function AdminHome() {
  const { claims } = useAuth();

  return (
    <AppShell>
      <h1 className="mt-4 text-[clamp(1.875rem,4vw,2.75rem)] font-extrabold">
        {claims?.role === 'admin' ? 'Admin' : 'Ops'}
      </h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted">
        The application review queue lands in Step 4: approve or reject, assign a
        tier, and activate the creator, with the applicant seeing the change live.
      </p>

      <ul className="mt-9 grid max-w-3xl gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {[
          { label: 'Applications', value: 'Step 4' },
          { label: 'Creators', value: 'Step 4' },
          { label: 'Brands', value: 'Step 6' },
        ].map((c) => (
          <li key={c.label} className="bg-surface-1 px-5 py-6">
            <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
              {c.label}
            </p>
            <p className="mt-2 text-lg font-bold text-accent">{c.value}</p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
