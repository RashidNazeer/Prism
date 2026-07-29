import { Check, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApplicationStatus } from '@/lib/auth/useApplication';

const STATUS = {
  pending: { icon: Clock, label: 'Pending', className: 'bg-warning-soft text-warning' },
  approved: { icon: Check, label: 'Approved', className: 'bg-success-soft text-success' },
  rejected: { icon: X, label: 'Rejected', className: 'bg-danger-soft text-danger' },
} as const satisfies Record<ApplicationStatus, unknown>;

/** One status pill, used identically in the queue and on the detail screen. */
export function StatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  const ui = STATUS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase',
        ui.className,
        className
      )}
    >
      <ui.icon size={12} aria-hidden />
      {ui.label}
    </span>
  );
}
