import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ListboxSelect, type SelectProps } from '@/components/ui/Select';

/**
 * Form primitives. Every input in the product uses these so focus rings, error
 * styling and label typography can never drift between forms.
 *
 * Errors are wired with `aria-invalid` + `aria-describedby`, so a screen reader
 * announces the problem instead of it being a red border only.
 */

/*
 * `rounded-lg`, not `rounded-xl`, since 2026-08-15. Rashid: reduce the roundness
 * of the corners of inputs and other things, look at the design. His design puts
 * inputs at 0.5rem and containers at 0.75rem, and the old 0.75rem on a 44px tall
 * control was round enough to read as a pill, which is why the forms looked soft
 * next to the cards rather than part of them.
 */
const controlBase = [
  // wx-neo-inset: things that receive are pressed INTO the page. The inset
  // shadow IS the field now — Rashid, 2026-10-08: no border lines anywhere,
  // shadows only. The 1px edge that used to carry the WCAG 1.4.11 boundary is
  // restored only under forced-colors (see global.css), where the OS discards
  // shadows and an unbordered field would be invisible.
  'wx-neo-inset w-full rounded-lg px-4 text-[0.9375rem]',
  'placeholder:text-faint',
  'transition-colors duration-200 ease-brand',
  // An outline, not a ring: a ring is a box-shadow and would replace the inset.
  'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

/*
 * INVALID IS A RING, NOT A BORDER, now that borders are gone. `outline` rather
 * than `ring`, because a ring is a box-shadow and would replace the inset that
 * makes the field a field. The error TEXT is still what announces the problem;
 * this only has to draw the eye to the right box.
 */
const controlState = (invalid?: boolean) =>
  invalid ? 'outline outline-2 outline-offset-1 outline-danger' : '';

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-muted block font-mono text-[0.6875rem] font-medium tracking-[0.14em] uppercase"
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
  children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
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
        <p id={errorId} role="alert" className="text-danger mt-1.5 text-[0.8125rem]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-faint mt-1.5 text-[0.8125rem]">
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

/**
 * Password box with a show/hide toggle.
 *
 * The toggle is why there is no "confirm password" field: letting someone check
 * what they typed solves the same problem with one field instead of two, which
 * matters when this sits inside an already long application form.
 */
export function PasswordInput({
  className,
  invalid,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        aria-invalid={invalid || undefined}
        className={cn(controlBase, controlState(invalid), 'h-12 pr-12', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="text-muted hover:text-accent focus-visible:outline-accent absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center rounded-lg transition-colors focus-visible:outline-2"
      >
        {visible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
      </button>
    </div>
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
      className={cn(
        controlBase,
        controlState(invalid),
        'min-h-28 resize-y py-3 leading-relaxed',
        className
      )}
    />
  );
}

/**
 * Same call shape as a native select (`<option>` children, `onChange` with
 * `e.target.value`), but the open list is ours, so it follows the theme on every
 * OS. See `Select.tsx` for why, and for the keyboard contract.
 */
export function Select({ className, invalid, ...props }: SelectProps) {
  return (
    <ListboxSelect
      {...props}
      invalid={invalid}
      className={cn(controlBase, controlState(invalid), 'h-12', className)}
    />
  );
}
