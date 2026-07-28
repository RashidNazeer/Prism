import { ChevronDown } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Form primitives. Every input in the product uses these so focus rings, error
 * styling and label typography can never drift between forms.
 *
 * Errors are wired with `aria-invalid` + `aria-describedby`, so a screen reader
 * announces the problem instead of it being a red border only.
 */

const controlBase = [
  'w-full rounded-xl border bg-surface-3 px-4 text-[15px]',
  'placeholder:text-faint',
  'transition-colors duration-200 ease-brand',
  'focus:outline-none focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

const controlState = (invalid?: boolean) =>
  invalid
    ? 'border-danger focus:border-danger'
    : 'border-line-interactive hover:border-accent/60 focus:border-accent';

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-mono text-[11px] font-medium tracking-[0.14em] text-muted uppercase"
    >
      {children}
    </label>
  );
}

/** Label + control + error message, wired together. */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2">{children({ id, describedBy, invalid: Boolean(error) })}</div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[13px] text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  invalid,
  ...props
}: ComponentProps<'input'> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(controlBase, controlState(invalid), 'h-12', className)}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(controlBase, controlState(invalid), 'min-h-28 resize-y py-3 leading-relaxed', className)}
    />
  );
}

export function Select({
  className,
  invalid,
  children,
  ...props
}: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        {...props}
        aria-invalid={invalid || undefined}
        className={cn(
          controlBase,
          controlState(invalid),
          // appearance-none removes the OS arrow, which cannot be themed and
          // looks wrong in dark mode on Windows.
          'h-12 cursor-pointer appearance-none pr-11',
          className
        )}
      >
        {children}
      </select>
      <ChevronDown
        size={17}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
